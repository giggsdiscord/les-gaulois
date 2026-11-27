// FICHIER GÉNÉRÉ par scripts/sync-engine.mjs — ne pas modifier. Source : src/engine/personality.ts
/**
 * Résidents avec une personnalité [GDD §4.8, V5.7] : trait de caractère déterministe (tiré de
 * l'identifiant), humeur 0–100 qui varie chaque nuit selon le travail, la faim et le froid et agit un
 * peu sur le rendement au poste, un ami et parfois un rival, et une petite histoire de temps en temps
 * dans la Gazette (`life.story_last`, événement public `resident_story` : marche sans IA).
 * État dans `village_migrants.traits` (aucune migration) ; processResidentLife() est appelé par
 * closeDay après les filières (la faim et le froid de la nuit sont alors connus).
 */
import * as C from './constants.ts';
import { pushEvent } from './effects.ts';
import { ensureLife } from './life.ts';
import { clamp } from './math.ts';
import { residents } from './population.ts';
import { createRng, type Rng } from './rng.ts';
import { pantryAmount } from './supply.ts';
import type { EngineEffects, GameSnapshot, Migrant, ResidentStory, ResidentTraits } from './types.ts';
import type { ResidentWorkPlan } from './work.ts';

type PersonLike = Pick<Migrant, 'id' | 'traits'>;

export function traitsOf(m: Pick<Migrant, 'traits'>): ResidentTraits {
  return m.traits && typeof m.traits === 'object' ? m.traits : {};
}

/** Trait de caractère : celui mémorisé, sinon tiré de l'identifiant (stable d'une nuit à l'autre). */
export function temperOf(m: PersonLike): C.TemperDef {
  const saved = C.TEMPERS.find((t) => t.code === traitsOf(m).temper);
  return saved ?? createRng(`temper:${m.id}`).pick(C.TEMPERS);
}

export function moodOf(m: Pick<Migrant, 'traits'>): number {
  const mood = traitsOf(m).mood;
  return typeof mood === 'number' && Number.isFinite(mood) ? clamp(Math.round(mood), 0, 100) : C.MOOD_DEFAULT;
}

export type MoodLevel = 'happy' | 'ok' | 'sulk';
export function moodLevel(mood: number): MoodLevel {
  return mood >= C.MOOD_HAPPY_AT ? 'happy' : mood < C.MOOD_SULK_AT ? 'sulk' : 'ok';
}
export const MOOD_LABEL: Record<MoodLevel, string> = { happy: 'Joyeux', ok: 'Tranquille', sulk: 'Maussade' };
export const MOOD_ICON: Record<MoodLevel, string> = { happy: '😊', ok: '🙂', sulk: '😞' };

/** Prénom affiché (premier mot du nom complet). */
export function firstName(m: Pick<Migrant, 'full_name'>): string {
  return m.full_name.trim().split(/\s+/)[0] || m.full_name;
}

/** Effet de la personnalité sur le rendement au poste : humeur × trait « bosseur ». */
export function personalityFactor(m: PersonLike): number {
  const level = moodLevel(moodOf(m));
  const mood = level === 'happy' ? C.MOOD_HAPPY_FACTOR : level === 'sulk' ? C.MOOD_SULK_FACTOR : 1;
  return mood * (temperOf(m).code === 'hard_worker' ? C.TEMPER_WORKER_FACTOR : 1);
}

function setTraits(m: Migrant, patch: Partial<ResidentTraits>): void {
  m.traits = { ...traitsOf(m), ...patch };
}

const pairScore = (a: string, b: string): number => createRng(`pair:${a < b ? `${a}|${b}` : `${b}|${a}`}`).int(0, 999_999);

/**
 * Relations : chaque résident (sauf solitaire) se fait un ami parmi ceux qui n'en ont pas ; un ronchon
 * se trouve un rival dès qu'il y a assez de monde. Les liens vers un résident parti sont oubliés.
 * Renvoie les nouvelles amitiés (paires d'identifiants).
 */
export function assignRelations(s: GameSnapshot): Array<[string, string]> {
  const res = residents(s).slice().sort((a, b) => a.id.localeCompare(b.id));
  const ids = new Set(res.map((m) => m.id));
  for (const m of res) {
    const t = traitsOf(m);
    if (t.friend_id && !ids.has(t.friend_id)) setTraits(m, { friend_id: null });
    if (t.rival_id && !ids.has(t.rival_id)) setTraits(m, { rival_id: null });
    if (!t.temper) setTraits(m, { temper: temperOf(m).code });
  }
  const formed: Array<[string, string]> = [];
  const free = res.filter((m) => temperOf(m).code !== 'loner' && !traitsOf(m).friend_id);
  while (free.length >= 2) {
    const a = free.shift()!;
    const b = free.slice().sort((x, y) => pairScore(a.id, x.id) - pairScore(a.id, y.id) || x.id.localeCompare(y.id))[0]!;
    free.splice(free.indexOf(b), 1);
    setTraits(a, { friend_id: b.id });
    setTraits(b, { friend_id: a.id });
    formed.push([a.id, b.id]);
  }
  if (res.length >= C.RIVAL_MIN_RESIDENTS) {
    for (const m of res) {
      if (temperOf(m).code !== 'grumpy' || traitsOf(m).rival_id) continue;
      const others = res.filter((o) => o.id !== m.id && o.id !== traitsOf(m).friend_id && temperOf(o).code !== 'loner');
      if (others.length === 0) continue;
      const rival = others.sort((x, y) => pairScore(`rival:${m.id}`, x.id) - pairScore(`rival:${m.id}`, y.id) || x.id.localeCompare(y.id))[0]!;
      setTraits(m, { rival_id: rival.id });
    }
  }
  return formed;
}

export interface MoodChange {
  migrant_id: string;
  delta: number;
  reason: string;
}

/** Conditions de la nuit qui jouent sur l'humeur. */
export interface MoodNight {
  hungry: boolean;
  cold: boolean;
  cheese: boolean;
}

/** Variation d'humeur de la nuit pour chaque résident (calcul pur, sans modifier l'instantané). */
export function planMoods(s: GameSnapshot, plan: Pick<ResidentWorkPlan, 'lines'> | null, night: MoodNight): MoodChange[] {
  const res = residents(s);
  const byId = new Map(res.map((m) => [m.id, m]));
  const lines = new Map((plan?.lines ?? []).map((l) => [l.migrant_id, l]));
  return res.map((m) => {
    const temper = temperOf(m).code;
    const t = traitsOf(m);
    const parts: Array<[number, string]> = [];
    const line = lines.get(m.id);
    if (m.injury_type) parts.push([C.MOOD_INJURED, 'sa blessure']);
    else if (line?.working) {
      parts.push([C.MOOD_WORKING + (line.skilled ? C.MOOD_SKILLED_BONUS : 0) + (temper === 'loner' ? 1 : 0), 'le travail']);
    } else parts.push([C.MOOD_IDLE - (temper === 'hard_worker' ? 2 : 0), line?.post ? 'rien à faire' : 'pas de poste']);
    if (night.hungry) parts.push([C.MOOD_HUNGRY * (temper === 'gourmand' ? 2 : 1), 'la faim']);
    else parts.push([C.MOOD_FED, 'le repas']);
    if (temper === 'gourmand' && night.cheese && !night.hungry) parts.push([2, 'le fromage']);
    if (night.cold) parts.push([C.MOOD_COLD * (temper === 'chilly' ? 2 : 1), 'le froid']);
    const friend = t.friend_id ? byId.get(t.friend_id) : undefined;
    if (friend) {
      parts.push([C.MOOD_FRIEND + (temper === 'chatty' ? 1 : 0) + (temperOf(friend).code === 'joker' ? 2 : 0), `son ami ${firstName(friend)}`]);
    }
    const rival = t.rival_id ? byId.get(t.rival_id) : undefined;
    if (rival && line?.working && lines.get(rival.id)?.working && lines.get(rival.id)?.post === line.post) {
      parts.push([C.MOOD_RIVAL_SAME_POST, `${firstName(rival)} au même poste`]);
    }
    if (temper === 'grumpy') parts.push([-1, 'son caractère']);
    let delta = parts.reduce((a, [d]) => a + d, 0);
    if (temper === 'joker' && delta < 0) delta /= 2;
    const mood = moodOf(m);
    delta += (C.MOOD_DEFAULT - mood) * C.MOOD_RETURN_RATE;
    const next = clamp(Math.round(mood + delta), 0, 100);
    const main = parts.slice().sort((a, b) => Math.abs(b[0]) - Math.abs(a[0]))[0];
    return { migrant_id: m.id, delta: next - mood, reason: main?.[1] ?? '' };
  });
}

// ---------------------------------------------------------------------------
// Petites histoires (dictionnaire déterministe, sans IA)
// ---------------------------------------------------------------------------
interface StoryCandidate {
  weight: number;
  migrant: Migrant;
  other?: Migrant;
  title: string;
  texts: string[];
}

function storyCandidates(s: GameSnapshot, night: MoodNight, formed: Array<[string, string]>): StoryCandidate[] {
  const res = residents(s);
  const byId = new Map(res.map((m) => [m.id, m]));
  const out: StoryCandidate[] = [];
  for (const [a, b] of formed) {
    const A = byId.get(a)!;
    const B = byId.get(b)!;
    out.push({
      weight: 6, migrant: A, other: B, title: 'Une amitié au hameau',
      texts: [
        `${firstName(A)} et ${firstName(B)} ne se quittent plus : on les voit partager la gourde au bord du torrent.`,
        `${firstName(A)} a appris à ${firstName(B)} trois jurons du pays ; ${firstName(B)} a répondu par une recette de soupe. Une amitié est née.`,
      ],
    });
  }
  for (const m of res) {
    const A = firstName(m);
    const t = traitsOf(m);
    const temper = temperOf(m).code;
    const level = moodLevel(moodOf(m));
    const chatty = temper === 'chatty' ? 2 : 1;
    if (level === 'happy') {
      out.push({ weight: 2 * chatty, migrant: m, title: 'Bonne humeur', texts: [
        `${A} sifflote du matin au soir ; certains jurent l'avoir entendu chanter en catalan.`,
        `${A} a offert des beignets à tout le hameau « parce que la vie est belle ».`,
      ] });
    }
    if (level === 'sulk') {
      out.push({ weight: 3 * chatty, migrant: m, title: 'Mauvaise passe', texts: [
        `${A} boude depuis deux jours et ne répond plus que par des soupirs. Un mot gentil ne serait pas de trop.`,
        `${A} menace de « rentrer au pays » ; personne n'ose demander lequel.`,
      ] });
    }
    const friend = t.friend_id ? byId.get(t.friend_id) : undefined;
    if (friend && m.id < friend.id) {
      out.push({ weight: 1 * chatty, migrant: m, other: friend, title: 'Entre amis', texts: [
        `${A} et ${firstName(friend)} ont passé la soirée à refaire le monde. Le monde n'a pas été consulté.`,
        `Partie de cartes acharnée entre ${A} et ${firstName(friend)} : l'enjeu, une tranche de saucisson, a été mangé avant la fin.`,
      ] });
    }
    const rival = t.rival_id ? byId.get(t.rival_id) : undefined;
    if (rival) {
      out.push({ weight: 2 * chatty, migrant: m, other: rival, title: 'Querelle de voisinage', texts: [
        `${A} accuse ${firstName(rival)} d'avoir « emprunté » sa meilleure pelle. L'affaire pourrait remonter jusqu'à l'Agora.`,
        `Dispute entre ${A} et ${firstName(rival)} pour la place la plus proche du poêle. Match nul, chacun boude dans son coin.`,
      ] });
    }
    if (temper === 'chilly' && night.cold) {
      out.push({ weight: 3, migrant: m, title: 'Nuit glaciale', texts: [
        `${A} dort avec trois couvertures et un bonnet : « Ici, même les loups claquent des dents. »`,
      ] });
    }
    if (temper === 'gourmand' && night.cheese) {
      out.push({ weight: 2, migrant: m, title: 'Mystère à la fromagerie', texts: [
        `Un morceau de fromage a disparu de la réserve. ${A} parle d'une « dégustation de contrôle ».`,
      ] });
    }
    if (temper === 'gourmand' && night.hungry) {
      out.push({ weight: 3, migrant: m, title: 'Ventre creux', texts: [
        `${A} rêve à voix haute de cassoulet. Les rations manquent et tout le hameau l'entend.`,
      ] });
    }
    if (temper === 'hard_worker' && level !== 'sulk' && m.work_post) {
      out.push({ weight: 1, migrant: m, title: 'Avant l\'aube', texts: [
        `${A} a fini sa journée avant l'aube et en redemande déjà.`,
      ] });
    }
    if (temper === 'loner') {
      out.push({ weight: 1, migrant: m, title: 'Promenade solitaire', texts: [
        `${A} : sortie solitaire en forêt, retour avec un cèpe énorme et pas un mot d'explication.`,
      ] });
    }
    if (temper === 'chatty') {
      out.push({ weight: 1, migrant: m, title: 'Le conteur', texts: [
        `${A} a raconté pour la douzième fois son arrivée au hameau ; le récit gagne un détail à chaque fois.`,
      ] });
    }
    if (temper === 'joker') {
      out.push({ weight: 1, migrant: m, title: 'Farce au hameau', texts: [
        `${A} a caché le bonnet du maire dans le poulailler. Les poules n'ont rien dit.`,
      ] });
    }
  }
  return out;
}

/** Petite histoire de la nuit, ou null (une chance sur deux, plus avec un bavard ; toujours pour une amitié neuve). */
export function pickStory(s: GameSnapshot, rng: Rng, day: string, night: MoodNight, formed: Array<[string, string]>): ResidentStory | null {
  const cands = storyCandidates(s, night, formed);
  if (cands.length === 0) return null;
  const chatty = residents(s).some((m) => temperOf(m).code === 'chatty');
  const roll = rng.chance(C.STORY_CHANCE_PCT + (chatty ? 25 : 0));
  if (!roll && formed.length === 0) return null;
  const pool = formed.length > 0 ? cands.filter((c) => c.title === 'Une amitié au hameau') : cands;
  const c = rng.weighted(pool.map((x) => [x, x.weight] as const));
  return { day, migrant_id: c.migrant.id, other_id: c.other?.id ?? null, title: c.title, text: rng.pick(c.texts) };
}

/** Chaque nuit : relations, humeur de chacun (après travail, faim et froid) et petite histoire. */
export function processResidentLife(s: GameSnapshot, fx: EngineEffects, plan: ResidentWorkPlan | null, day: string, rng: Rng): void {
  if (residents(s).length === 0) return;
  const v = s.village;
  const life = ensureLife(v);
  const formed = assignRelations(s);
  const night: MoodNight = { hungry: v.food_rations <= 0, cold: (life.cold_streak ?? 0) > 0, cheese: pantryAmount(v, 'cheese_kg') > 0 };
  for (const ch of planMoods(s, plan, night)) {
    const m = s.migrants.find((x) => x.id === ch.migrant_id)!;
    setTraits(m, { mood: moodOf(m) + ch.delta, mood_delta: ch.delta, mood_reason: ch.reason });
  }
  const story = pickStory(s, rng, day, night, formed);
  if (!story) return;
  life.story_last = story;
  pushEvent(fx, s, {
    event_type: 'resident_story',
    title: `Petite histoire : ${story.title}`,
    body: story.text,
    data: { migrant_id: story.migrant_id, other_id: story.other_id ?? null },
  });
}

/** Refus d'un encouragement (null = possible). */
export function cheerBlocker(m: Migrant | undefined, day: string): string | null {
  if (!m || (m.status !== 'accepted' && m.status !== 'forced_labor')) return 'Résident introuvable.';
  if (traitsOf(m).cheered_day === day) return `${firstName(m)} a déjà eu son mot d'encouragement aujourd'hui.`;
  if (moodOf(m) >= 100) return `${firstName(m)} est déjà aux anges.`;
  return null;
}

/** Encourager un résident : humeur + CHEER_MOOD (une fois par jour). Renvoie la nouvelle humeur. */
export function cheerResident(m: Migrant, day: string): number {
  const mood = clamp(moodOf(m) + C.CHEER_MOOD, 0, 100);
  setTraits(m, { mood, cheered_day: day });
  return mood;
}
