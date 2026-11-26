/**
 * Mode démo : la partie complète tourne dans le navigateur, sans Supabase.
 * Le moteur et la GameSession sont exactement ceux des Edge Functions (Maître du Jeu en
 * dictionnaire de secours) ; les RPC SQL et la sécurité RLS sont émulées ici ; l'état est
 * conservé dans le stockage local. Une horloge décalable permet d'avancer le temps.
 */
import { createGm } from '../../../supabase/functions/_shared/core/gm/runner.ts';
import { GameSession, type OpResult } from '../../../supabase/functions/_shared/core/session.ts';
import type { GameState } from '../../../supabase/functions/_shared/core/types.ts';
import {
  agoraWeekFor,
  computeHiddenIndicators,
  createRng,
  dayKey,
  isAfter,
  nextAgoraSession,
  portfolioUnlocked,
  sanitizeTaps,
  weekdayOfKey,
  type Player,
  type Portfolio,
  type ProposalKind,
  type TargetTap,
} from '../engine.ts';
import { demoPlayers, demoStructures, demoVillage, type DemoPlayer } from '../demo/seed.ts';
import {
  HIDDEN_MIGRANT_KEYS,
  HIDDEN_VILLAGE_KEYS,
  NOTIFICATION_CATEGORIES,
  UNREAD_AREAS,
  type ActionInput,
  type ChangeListener,
  type DuelMode,
  type GameApi,
  type GameData,
  type GameEventRow,
  type GazetteEdition,
  type HiddenIndicator,
  type LedgerRow,
  type LoginCard,
  type MotionKind,
  type MyPlayer,
  type NotificationCategory,
  type NotificationSettings,
  type OpResponse,
  type Proposal,
  type PublicPlayer,
  type ScreeningRow,
  type SnapshotInfo,
  type TavernMessage,
  type UnreadArea,
  type UnreadCounts,
} from './types.ts';

const STORAGE_KEY = 'les-gaulois-demo-v4';
const MAX_SNAPSHOTS = 10;
const PILLARS = ['mayor_agri', 'treasurer_physio', 'civil_eng'];

interface DemoCore {
  state: GameState;
  ledger: LedgerRow[];
  screenings: ScreeningRow[];
  hidden: HiddenIndicator[];
}

interface DemoStore extends DemoCore {
  version: 4;
  offsetMs: number;
  tavern: TavernMessage[];
  gazette: GazetteEdition[];
  events: GameEventRow[];
  pins: Record<string, string>;
  sessions: Record<string, string>;
  snapshots: { info: SnapshotInfo; data: DemoCore }[];
  /** V4.3 (facultatifs : parties démo plus anciennes) — dernières lectures, catégories de notifications. */
  readMarks?: Record<string, Partial<Record<UnreadArea, string>>>;
  notificationPrefs?: Record<string, NotificationCategory[]>;
}

const uuid = (): string => crypto.randomUUID();
const clone = <T>(v: T): T => structuredClone(v);

function omit<T extends object>(obj: T, keys: readonly string[]): Record<string, unknown> {
  const out: Record<string, unknown> = { ...(obj as Record<string, unknown>) };
  for (const k of keys) delete out[k];
  return out;
}

function initialStore(): DemoStore {
  const nowIso = new Date().toISOString();
  const state: GameState = {
    snapshot: {
      village: demoVillage(nowIso),
      players: demoPlayers(),
      migrants: [],
      children: [],
      structures: demoStructures(),
      unions: [],
      approvals: [],
      temptations: [],
      constitution: [],
    },
    proposals: [],
    duels: [],
    moves: [],
    targetResults: [],
    chat: [],
    recentEvents: [],
  };
  const founders = state.snapshot.players.filter((p) => p.is_founder);
  return {
    version: 4,
    offsetMs: 0,
    state,
    tavern: [
      { id: uuid(), channel: 'village_square', sender_id: null, recipient_ids: null, content: '🏔️ Bienvenue au hameau ! Caisse commune : 50 000 €. Dette foncière : 295 000 €. Bon courage. (Mode démo : PIN 0000 pour tous.)', is_system_event: true, created_at: nowIso },
    ],
    gazette: [
      {
        id: uuid(),
        edition_date: nowIso.slice(0, 10),
        headline: 'Sept Français rachètent un hameau fantôme au-dessus de Lleida',
        body_markdown: "L'Ayuntamiento confirme la vente d'un hameau abandonné de 30 hectares, à 18 km d'Andorre, pour 295 000 €. Ni eau courante ni électricité : une piste forestière, des ruines, un potager et une famille de grenouilles. Les nouveaux propriétaires annoncent « une simple rénovation ». Personne n'y croit.",
        sections: [],
        generated_by: 'manual',
        created_at: nowIso,
      },
    ],
    events: [
      { id: uuid(), event_type: 'game_started', visibility: 'public', player_id: null, role_code: null, title: 'Fondation du hameau', body: 'Les sept fondateurs prennent possession des ruines. Acte I : le Chantier des Ruines.', data: {}, game_day: 0, created_at: nowIso },
    ],
    ledger: [
      { id: uuid(), account: 'treasury', player_id: null, amount_eur: 50000, label: 'Fonds de roulement initial (apports des fondateurs)', category: 'opening', supplier: null, created_at: nowIso },
      { id: uuid(), account: 'land_debt', player_id: null, amount_eur: 295000, label: 'Emprunt foncier — achat du hameau (30 ha, PLU 2013)', category: 'opening', supplier: null, created_at: nowIso },
      ...founders.map((p) => ({ id: uuid(), account: 'private', player_id: p.id, amount_eur: 2000, label: "Épargne personnelle d'ouverture", category: 'opening', supplier: null, created_at: nowIso })),
    ],
    screenings: [],
    hidden: Object.entries(computeHiddenIndicators(state.snapshot, new Date(nowIso))).map(([role_code, payload]) => ({ role_code, payload, computed_at: nowIso })),
    pins: {},
    sessions: {},
    snapshots: [],
  };
}

export class DemoApi implements GameApi {
  readonly mode = 'demo' as const;
  private store: DemoStore;
  private token: string | null = null;
  private readonly listeners = new Set<ChangeListener>();

  constructor() {
    this.store = this.load();
  }

  // ---------------------------------------------------------------------------
  // Stockage, horloge, notifications
  // ---------------------------------------------------------------------------
  private load(): DemoStore {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as DemoStore;
        if (parsed.version === 4) return parsed;
      }
    } catch {
      /* stockage indisponible : partie neuve en mémoire */
    }
    return initialStore();
  }

  private save(): void {
    for (;;) {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(this.store));
        return;
      } catch {
        if (this.store.snapshots.length === 0) return; // stockage indisponible : on reste en mémoire
        this.store.snapshots.shift();
      }
    }
  }

  private notify(table: string): void {
    for (const l of this.listeners) l(table);
  }

  now(): Date {
    return new Date(Date.now() + this.store.offsetMs);
  }

  setToken(token: string | null): void {
    this.token = token;
  }

  private get players(): DemoPlayer[] {
    return this.store.state.snapshot.players as DemoPlayer[];
  }

  private me(): DemoPlayer {
    const id = this.token ? this.store.sessions[this.token] : undefined;
    const me = this.players.find((p) => p.id === id);
    if (!me) throw new Error('Session invalide ou expirée : reconnectez-vous avec votre code PIN.');
    return me;
  }

  private requireFree(): DemoPlayer {
    const me = this.me();
    if (me.status === 'banished' || me.status === 'executed') throw new Error(`Vous n'appartenez plus au hameau (${me.status}).`);
    if (isAfter(me.is_detained_until, this.now())) throw new Error("Vous êtes à l'isolement au cachot.");
    return me;
  }

  private requireAdmin(): DemoPlayer {
    const me = this.me();
    if (!me.is_admin) throw new Error("Action réservée à l'administrateur du village.");
    return me;
  }

  private system(channel: TavernMessage['channel'], content: string): void {
    this.store.tavern.push({ id: uuid(), channel, sender_id: null, recipient_ids: null, content, is_system_event: true, created_at: this.now().toISOString() });
  }

  // ---------------------------------------------------------------------------
  // Exécution du moteur (équivalent de runGame + engine_commit)
  // ---------------------------------------------------------------------------
  private workingState(now: Date): GameState {
    const state = clone(this.store.state);
    const names = new Map(this.players.map((p) => [p.id, p.display_name]));
    state.chat = this.store.tavern
      .filter((m) => m.channel !== 'whisper')
      .slice(-25)
      .map((m) => ({ sender: m.sender_id ? names.get(m.sender_id) ?? '?' : 'Système', content: m.content, created_at: m.created_at }));
    const since = now.getTime() - 26 * 3_600_000;
    state.recentEvents = this.store.events
      .filter((e) => e.visibility === 'public' && new Date(e.created_at).getTime() >= since)
      .map((e) => ({ event_type: e.event_type, title: e.title, body: e.body, created_at: e.created_at }));
    return state;
  }

  private commit(session: GameSession, now: Date): void {
    const s = this.store;
    const iso = now.toISOString();
    s.state = { ...clone(session.state), chat: [], recentEvents: [] };
    s.state.snapshot.village.revision += 1;
    for (const p of s.state.proposals as Proposal[]) if (!p.created_at) p.created_at = iso;
    for (const e of session.fx.events) {
      s.events.push({ id: uuid(), event_type: e.event_type, visibility: e.visibility, player_id: e.player_id ?? null, role_code: e.role_code ?? null, title: e.title, body: e.body, data: e.data ?? {}, game_day: e.game_day, created_at: iso });
    }
    for (const l of session.fx.ledger) {
      s.ledger.push({ id: uuid(), account: l.account, player_id: l.player_id ?? null, amount_eur: l.amount_eur, label: l.label, category: l.category, supplier: l.supplier ?? null, created_at: iso });
    }
    for (const sc of session.fx.screenings) {
      s.screenings = s.screenings.filter((x) => !(x.migrant_id === sc.migrant_id && x.screened_by === sc.screened_by && x.screening_type === sc.screening_type));
      s.screenings.push({ id: uuid(), ...sc, created_at: iso });
    }
    for (const t of session.tavern) {
      s.tavern.push({ id: uuid(), channel: t.channel, sender_id: null, recipient_ids: t.recipient_ids ?? null, content: t.content, is_system_event: true, created_at: iso });
    }
    for (const g of session.gazette) {
      s.gazette = s.gazette.filter((x) => x.edition_date !== g.edition_date);
      s.gazette.push({ id: uuid(), ...g, created_at: iso });
    }
    s.hidden = session.hiddenRows();
    s.events = s.events.slice(-400);
    s.ledger = s.ledger.slice(-600);
    s.tavern = s.tavern.slice(-600);
    s.gazette = s.gazette.slice(-30);
    this.save();
    this.notify('*');
  }

  private async run(operation: (session: GameSession) => Promise<OpResult> | OpResult, skipIfTrivial = false): Promise<OpResponse> {
    const now = this.now();
    const session = new GameSession(this.workingState(now), { now, gm: createGm(null, { seed: `demo:${now.toISOString()}` }) });
    session.tick();
    await session.maintainAgora();
    const result = await operation(session);
    if (!((skipIfTrivial || !result.ok) && session.isTrivial())) this.commit(session, now);
    const playerId = this.token ? this.store.sessions[this.token] ?? null : null;
    const response = { ...result, events: session.visibleEvents(playerId) } as OpResponse;
    if (!response.ok) throw new Error(response.error ?? 'Opération refusée.');
    return response;
  }

  // ---------------------------------------------------------------------------
  // Connexion
  // ---------------------------------------------------------------------------
  async listLoginCards(): Promise<LoginCard[]> {
    return this.players.map((p) => ({
      id: p.id, slot_number: p.slot_number, display_name: p.display_name, character_name: p.character_name,
      role_title: p.role_title, avatar_emoji: p.avatar_emoji, avatar_color: p.avatar_color, is_active_slot: p.is_active_slot,
    }));
  }

  async login(playerId: string, pin: string): Promise<string | null> {
    if (!/^\d{4}$/.test(pin)) throw new Error('Le code PIN doit comporter exactement 4 chiffres.');
    const p = this.players.find((x) => x.id === playerId);
    if (!p || !p.is_active_slot) throw new Error('Personnage inconnu ou place non attribuée.');
    if ((this.store.pins[playerId] ?? '0000') !== pin) return null;
    const token = uuid();
    this.store.sessions[token] = playerId;
    p.last_seen_at = this.now().toISOString();
    this.save();
    return token;
  }

  async logout(): Promise<void> {
    if (this.token) delete this.store.sessions[this.token];
    this.token = null;
    this.save();
  }

  async setPin(oldPin: string, newPin: string): Promise<void> {
    const me = this.me();
    if (!/^\d{4}$/.test(newPin)) throw new Error('Le nouveau PIN doit comporter exactement 4 chiffres.');
    if ((this.store.pins[me.id] ?? '0000') !== oldPin) throw new Error('Ancien PIN incorrect.');
    this.store.pins[me.id] = newPin;
    me.must_change_pin = false;
    this.save();
  }

  // ---------------------------------------------------------------------------
  // Lectures (avec filtrage équivalent à la RLS)
  // ---------------------------------------------------------------------------
  async loadAll(): Promise<GameData> {
    const me = this.me();
    const s = this.store;
    const snap = s.state.snapshot;
    const now = this.now();
    const isTreasurer = me.role_code === 'treasurer_physio';
    const roles = new Set<string>([me.role_code, ...me.ministerial_portfolios.map((p) => `portfolio:${p}`)]);
    const spouse = me.spouse_id ? this.players.find((p) => p.id === me.spouse_id) : undefined;
    if (spouse) roles.add(spouse.role_code);
    const duelById = new Map(s.state.duels.map((d) => [d.id, d]));
    const recent = (iso: string, days: number) => now.getTime() - new Date(iso).getTime() <= days * 86_400_000;
    const publicPlayer = (p: DemoPlayer): PublicPlayer =>
      omit(p, ['mental_health_pct', 'morale_pct', 'addiction_level_pct', 'temptation_guilt_pct', 'pending_ap_penalty', 'private_wealth_eur', 'power_kwh_used', 'strapping_until', 'injury_since', 'must_change_pin', 'ambition']) as unknown as PublicPlayer;
    return clone({
      me: me as unknown as MyPlayer,
      village: omit(snap.village, HIDDEN_VILLAGE_KEYS) as unknown as GameData['village'],
      players: this.players.map(publicPlayer),
      migrants: snap.migrants
        .filter((m) => ['candidate', 'accepted', 'forced_labor'].includes(m.status))
        .map((m) => omit(m, HIDDEN_MIGRANT_KEYS) as unknown as GameData['migrants'][number]),
      children: snap.children.filter((c) => c.status !== 'departed'),
      structures: snap.structures as GameData['structures'],
      unions: snap.unions.filter((u) => u.is_active),
      proposals: (s.state.proposals as Proposal[]).filter((p) => recent(p.created_at ?? now.toISOString(), 35)).slice().reverse(),
      constitution: snap.constitution.slice().sort((a, b) => a.article_number - b.article_number),
      approvals: snap.approvals.slice().reverse().slice(0, 40),
      duels: s.state.duels.filter((d) => d.status === 'active' || (d.finished_at !== null && recent(d.finished_at, 2))).slice().reverse(),
      moves: s.state.moves.filter((m) => {
        const d = duelById.get(m.duel_id);
        return m.player_id === me.id || !d || d.status !== 'active' || d.current_round > m.round;
      }),
      targetResults: s.state.targetResults.filter((r) => r.player_id === me.id || duelById.get(r.duel_id)?.status !== 'active'),
      gazette: s.gazette.slice().reverse().slice(0, 14),
      events: s.events
        .filter((e) => e.visibility === 'public' || (e.visibility === 'private' && e.player_id === me.id) || (e.visibility === 'role' && roles.has(e.role_code ?? '')))
        .slice()
        .reverse()
        .slice(0, 80),
      ledger: s.ledger.filter((l) => l.account !== 'private').slice().reverse().slice(0, 120),
      privateLedger: {
        wealth: this.players
          .filter((p) => isTreasurer || p.id === me.id)
          .map((p) => ({ player_id: p.id, display_name: p.display_name, private_wealth_eur: p.private_wealth_eur, power_kwh_used: p.power_kwh_used })),
        entries: s.ledger.filter((l) => l.account === 'private' && (isTreasurer || l.player_id === me.id)).slice().reverse().slice(0, 300),
      },
      hidden: s.hidden.filter((h) => roles.has(h.role_code)),
      screenings: s.screenings.filter((x) => x.screened_by === me.id),
      temptations: snap.temptations.filter((t) => t.player_id === me.id).slice().reverse().slice(0, 20),
    });
  }

  // ---------------------------------------------------------------------------
  // Pastilles et notifications (V4.3) : même calcul que unread_counts_for (SQL).
  // Pas de notification push en mode démo (aucun serveur pour les envoyer).
  // ---------------------------------------------------------------------------
  readonly pushPublicKey = null;

  async unreadCounts(): Promise<UnreadCounts> {
    return this.countsFor(this.me().id);
  }

  async markSeen(area: UnreadArea): Promise<UnreadCounts> {
    const me = this.me();
    if (!UNREAD_AREAS.includes(area)) throw new Error('Zone inconnue.');
    this.store.readMarks ??= {};
    this.store.readMarks[me.id] = { ...this.store.readMarks[me.id], [area]: this.now().toISOString() };
    this.save();
    return this.countsFor(me.id);
  }

  async notificationSettings(): Promise<NotificationSettings> {
    const me = this.me();
    return { categories: [...(this.store.notificationPrefs?.[me.id] ?? NOTIFICATION_CATEGORIES)], devices: 0 };
  }

  async setNotificationCategories(categories: NotificationCategory[]): Promise<NotificationSettings> {
    const me = this.me();
    this.store.notificationPrefs ??= {};
    this.store.notificationPrefs[me.id] = [...new Set(categories.filter((c) => NOTIFICATION_CATEGORIES.includes(c)))].sort();
    this.save();
    return this.notificationSettings();
  }

  async savePushSubscription(): Promise<NotificationSettings> {
    this.me();
    throw new Error('Notifications indisponibles en mode démo.');
  }

  async deletePushSubscription(): Promise<NotificationSettings> {
    return this.notificationSettings();
  }

  private countsFor(playerId: string): UnreadCounts {
    const now = this.now().getTime();
    const floor = now - 3 * 86_400_000;
    const marks = this.store.readMarks?.[playerId] ?? {};
    const since = (area: UnreadArea) => Math.max(marks[area] ? Date.parse(marks[area]!) : floor, floor);
    const after = (iso: string, area: UnreadArea) => Date.parse(iso) > since(area);
    const tavern = (channel: TavernMessage['channel']) =>
      this.store.tavern.filter((m) => m.channel === channel && m.sender_id !== playerId && after(m.created_at, channel)).length;
    const me = this.players.find((p) => p.id === playerId);
    const counts = {
      village_square: tavern('village_square'),
      agora_hall: tavern('agora_hall'),
      whisper: this.store.tavern.filter((m) => m.channel === 'whisper' && (m.recipient_ids ?? []).includes(playerId) && m.sender_id !== playerId && after(m.created_at, 'whisper')).length,
      gazette: Math.min(this.store.gazette.filter((g) => after(g.created_at, 'gazette')).length, 1),
      votes: this.store.state.proposals.filter((p) => p.status === 'open' && Date.parse(p.closes_at) > now && !p.votes_yes.includes(playerId) && !p.votes_no.includes(playerId)).length,
      approvals: this.store.state.snapshot.approvals.filter((a) => a.status === 'pending' && a.required_role === me?.role_code).length,
      duels: this.store.state.duels.filter((d) => d.status === 'active' && (d.player_a_id === playerId || d.player_b_id === playerId)).length,
    };
    return { ...counts, total: Object.values(counts).reduce((a, b) => a + b, 0) };
  }

  async loadTavern(channel: TavernMessage['channel']): Promise<TavernMessage[]> {
    const me = this.me();
    return clone(
      this.store.tavern
        .filter((m) => m.channel === channel)
        .filter((m) => channel !== 'whisper' || m.sender_id === me.id || (m.recipient_ids ?? []).includes(me.id))
        .slice(-120),
    );
  }

  subscribe(listener: ChangeListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  // ---------------------------------------------------------------------------
  // Moteur
  // ---------------------------------------------------------------------------
  tick(): Promise<OpResponse> {
    this.me();
    return this.run(() => ({ ok: true }), true);
  }
  action(input: ActionInput): Promise<OpResponse> {
    const me = this.me();
    return this.run((s) => s.action(me.id, input));
  }
  freeAction(text: string, onBehalfOf?: string | null): Promise<OpResponse> {
    return this.action({ action_code: 'free_ai_action', free_text: text, on_behalf_of_id: onBehalfOf ?? null });
  }
  decideApproval(approvalId: string, approve: boolean, reason?: string | null): Promise<OpResponse> {
    const me = this.me();
    return this.run((s) => s.decideApproval(me.id, approvalId, approve, reason ?? null));
  }
  respondTemptation(temptationId: string, yieldToIt: boolean): Promise<OpResponse> {
    const me = this.me();
    return this.run((s) => s.respondTemptation(me.id, temptationId, yieldToIt));
  }
  challengeDuel(input: { proposalId?: string | null; targetPlayerId?: string | null; championPlayerId?: string | null; mode: DuelMode }): Promise<OpResponse> {
    const me = this.me();
    return this.run((s) => s.challengeDuel(me.id, input));
  }
  resolveDuel(duelId: string): Promise<OpResponse> {
    this.me();
    return this.run((s) => s.resolveDuel(duelId, 'player'), true);
  }
  repressPutsch(duelId: string): Promise<OpResponse> {
    const me = this.me();
    return this.run((s) => s.repressPutsch(me.id, duelId));
  }

  // ---------------------------------------------------------------------------
  // RPC légères (équivalents des fonctions SQL)
  // ---------------------------------------------------------------------------
  async postMessage(channel: TavernMessage['channel'], content: string, recipients?: string[]): Promise<void> {
    const me = this.requireFree();
    const text = content.trim();
    if (!text || content.length > 2000) throw new Error('Message vide ou trop long (2000 caractères max).');
    let to: string[] | null = null;
    if (channel === 'whisper') {
      if (!recipients || recipients.length === 0) throw new Error('Un chuchotement doit avoir au moins un destinataire.');
      if (recipients.includes(me.id) || recipients.some((r) => !this.players.some((p) => p.id === r && p.is_active_slot))) throw new Error('Destinataires invalides.');
      to = recipients;
    }
    this.store.tavern.push({ id: uuid(), channel, sender_id: me.id, recipient_ids: to, content: text, is_system_event: false, created_at: this.now().toISOString() });
    this.save();
    this.notify('tavern_messages');
  }

  private newProposal(me: Player, kind: ProposalKind, title: string, explanation: string, category: string, extra: Partial<Proposal> = {}): Proposal {
    const now = this.now();
    const closes = nextAgoraSession(now);
    return {
      id: uuid(), week_number: agoraWeekFor(this.store.state.snapshot, closes, now), proposer_id: me.id, kind, title: title.trim(),
      detailed_explanation: explanation.trim(), category, payload: {}, target_migrant_id: null, target_player_id: null,
      required_majority: 'simple', votes_yes: [], votes_no: [], status: 'open', vetoed_by: null, closes_at: closes.toISOString(),
      ai_execution_summary: null, executed_at: null, closed_at: null, created_at: now.toISOString(), ...extra,
    };
  }

  async submitProposal(title: string, explanation: string, category: string): Promise<void> {
    const me = this.requireFree();
    if (title.trim().length < 5) throw new Error('Titre trop court (5 caractères minimum).');
    if (explanation.trim().length < 80) throw new Error('Le détail explicatif doit être complet (80 caractères minimum : objectifs, financement, modalités).');
    const p = this.newProposal(me, 'initiative', title, explanation, category);
    if (this.store.state.proposals.some((x) => x.kind === 'initiative' && x.proposer_id === me.id && x.week_number === p.week_number)) {
      throw new Error('Vous avez déjà soumis votre initiative pour la prochaine séance.');
    }
    this.store.state.proposals.push(p);
    this.system('agora_hall', `📜 Nouvelle initiative de ${me.display_name} : « ${p.title} ».`);
    this.save();
    this.notify('agora_proposals');
  }

  async submitMotion(kind: MotionKind, title: string, explanation: string, payload: Record<string, unknown>): Promise<void> {
    const me = this.requireFree();
    const snap = this.store.state.snapshot;
    const act = snap.village.act_number;
    if (this.store.state.proposals.filter((p) => p.proposer_id === me.id && p.status === 'open' && p.kind !== 'initiative').length >= 3) {
      throw new Error('Maximum 3 motions ouvertes par joueur.');
    }
    if (title.trim().length < 3 || explanation.trim().length < 10) throw new Error('Titre et motifs obligatoires.');
    const extra: Partial<Proposal> = { payload };
    let category = 'society';
    switch (kind) {
      case 'tribunal': {
        category = 'justice';
        const sentence = String(payload.sentence ?? '');
        if (!['forced_labor', 'expulsion', 'execution'].includes(sentence)) throw new Error('Sentence inconnue.');
        const migrant = (payload.target_migrant_id as string | undefined) || null;
        const player = (payload.target_player_id as string | undefined) || null;
        if (!migrant === !player) throw new Error('Désignez exactement un accusé (résident ou joueur).');
        if (player === me.id) throw new Error("On ne s'accuse pas soi-même devant le Tribunal.");
        if (sentence === 'forced_labor') {
          const days = Number(payload.days ?? 3);
          if (!(days >= 3 && days <= 7)) throw new Error('Travaux forcés : durée de 3 à 7 jours.');
        }
        extra.target_migrant_id = migrant;
        extra.target_player_id = player;
        extra.required_majority = sentence === 'execution' ? 'two_thirds' : 'simple';
        break;
      }
      case 'naturalization':
        category = 'immigration';
        if (act < 3) throw new Error("La naturalisation n'est ouverte qu'à l'Acte III.");
        extra.target_migrant_id = String(payload.migrant_id ?? '');
        if (!snap.migrants.some((m) => m.id === extra.target_migrant_id && m.status === 'accepted' && !m.is_naturalized)) throw new Error('Résident introuvable ou déjà naturalisé.');
        break;
      case 'migrant_admission':
        category = 'immigration';
        extra.target_migrant_id = String(payload.migrant_id ?? '');
        if (!snap.migrants.some((m) => m.id === extra.target_migrant_id && m.status === 'candidate')) throw new Error('Candidat introuvable.');
        break;
      case 'collectivization':
      case 'decollectivization':
        category = 'economy';
        break;
      case 'prohibition':
        if (!['alcohol', 'drugs', 'tomatoes'].includes(String(payload.target)) || typeof payload.active !== 'boolean') throw new Error('Prohibition : cible et activation requises.');
        break;
      case 'rationing':
        if (typeof payload.active !== 'boolean') throw new Error('Rationnement : activation requise.');
        break;
      case 'ministry_election': {
        category = 'security';
        const portfolio = String(payload.portfolio) as Portfolio;
        if (!['defense', 'interior', 'customs', 'chancery', 'media'].includes(portfolio)) throw new Error('Portefeuille inconnu.');
        if (!portfolioUnlocked(act, portfolio)) throw new Error("Ce portefeuille n'est pas encore débloqué.");
        extra.target_player_id = String(payload.player_id ?? '');
        if (!this.players.some((p) => p.id === extra.target_player_id && p.is_active_slot)) throw new Error('Candidat au ministère introuvable.');
        break;
      }
      case 'constitution_article': {
        category = 'constitution';
        if (act < 3) throw new Error("La Constitution se rédige à l'Acte III.");
        const article = snap.constitution.find((a) => a.article_number === Number(payload.article_number) && (a.status === 'draft' || a.status === 'proposed'));
        if (!article) throw new Error('Article introuvable ou déjà adopté.');
        article.status = 'proposed';
        break;
      }
      case 'independence':
        category = 'constitution';
        if (act < 3 || snap.village.independence_proclaimed) throw new Error('Proclamation impossible (Acte III requis, une seule fois).');
        if (!snap.constitution.some((a) => a.status === 'adopted')) throw new Error("Adoptez au moins un article de Constitution avant de proclamer l'indépendance.");
        extra.required_majority = 'two_thirds';
        break;
    }
    const p = this.newProposal(me, kind, title, explanation, category, extra);
    this.store.state.proposals.push(p);
    this.system('agora_hall', `⚖️ Motion déposée par ${me.display_name} : « ${p.title} »${p.required_majority === 'two_thirds' ? ' (majorité des deux tiers requise)' : ''}.`);
    this.save();
    this.notify('agora_proposals');
  }

  async vote(proposalId: string, yes: boolean): Promise<void> {
    const me = this.requireFree();
    const p = this.store.state.proposals.find((x) => x.id === proposalId);
    if (!p) throw new Error('Proposition introuvable.');
    if (p.status !== 'open' || new Date(p.closes_at).getTime() <= this.now().getTime()) throw new Error('Le scrutin est clos.');
    if (p.target_player_id === me.id) throw new Error("L'accusé ne vote pas sur son propre jugement.");
    p.votes_yes = p.votes_yes.filter((id) => id !== me.id);
    p.votes_no = p.votes_no.filter((id) => id !== me.id);
    (yes ? p.votes_yes : p.votes_no).push(me.id);
    this.save();
    this.notify('agora_proposals');
  }

  async veto(proposalId: string): Promise<void> {
    const me = this.requireFree();
    if (!PILLARS.includes(me.role_code)) throw new Error('Seuls les piliers institutionnels (Mairie, Trésorerie, Génie civil) disposent du veto.');
    if (me.veto_tokens < 1) throw new Error('Jeton de veto déjà utilisé cette saison.');
    const p = this.store.state.proposals.find((x) => x.id === proposalId);
    if (!p || p.status !== 'passed' || p.executed_at !== null) throw new Error('Seule une décision adoptée et non encore exécutée peut être frappée de veto.');
    if (p.closed_at && this.now().getTime() - new Date(p.closed_at).getTime() > 6 * 3_600_000) throw new Error('Délai de veto expiré (6 heures après la clôture).');
    me.veto_tokens -= 1;
    p.status = 'vetoed';
    p.vetoed_by = me.id;
    this.system('agora_hall', `🛑 ${me.display_name} oppose son veto à « ${p.title} ». Le porteur peut contester en duel.`);
    this.save();
    this.notify('agora_proposals');
  }

  async submitMove(duelId: string, move: string, pivotTarget?: string | null): Promise<{ both_submitted: boolean }> {
    const me = this.me();
    const d = this.store.state.duels.find((x) => x.id === duelId);
    if (!d || d.status !== 'active') throw new Error('Duel introuvable ou terminé.');
    if (d.mode !== 'carlage') throw new Error("Ce duel se joue à l'épreuve de la cible.");
    const side = d.player_a_id === me.id ? 'a' : d.player_b_id === me.id ? 'b' : null;
    if (!side) throw new Error("Vous n'êtes pas combattant de ce duel.");
    if (this.now().getTime() > new Date(d.round_deadline_at).getTime() + 2000) throw new Error('Trop tard pour cette manche.');
    if (!['push', 'pivot', 'anchor', 'shoulder'].includes(move)) throw new Error('Coup inconnu.');
    const own = side === 'a' ? d.player_a_pos : d.player_b_pos;
    const other = side === 'a' ? d.player_b_pos : d.player_a_pos;
    const adjacent: Record<string, string[]> = { TL: ['TR', 'BL'], TR: ['TL', 'BR'], BL: ['TL', 'BR'], BR: ['TR', 'BL'] };
    if (move === 'pivot' && (!pivotTarget || pivotTarget === other || !adjacent[own]?.includes(pivotTarget))) throw new Error('Pivot : carreau adjacent libre requis.');
    if (!this.store.state.moves.some((m) => m.duel_id === duelId && m.round === d.current_round && m.side === side)) {
      this.store.state.moves.push({ duel_id: duelId, round: d.current_round, side, player_id: me.id, move: move as 'push', pivot_target: move === 'pivot' ? (pivotTarget as 'TL') : null });
    }
    const count = this.store.state.moves.filter((m) => m.duel_id === duelId && m.round === d.current_round).length;
    this.save();
    this.notify('carlage_moves');
    return { both_submitted: count >= 2 || d.opponent_migrant_id !== null };
  }

  async submitTargetTaps(duelId: string, taps: TargetTap[]): Promise<{ both_submitted: boolean }> {
    const me = this.me();
    const d = this.store.state.duels.find((x) => x.id === duelId);
    if (!d || d.status !== 'active' || d.mode !== 'target') throw new Error('Épreuve introuvable ou terminée.');
    const side = d.player_a_id === me.id ? 'a' : d.player_b_id === me.id ? 'b' : null;
    if (!side) throw new Error('Vous ne participez pas à cette épreuve.');
    if (this.now().getTime() > new Date(d.round_deadline_at).getTime()) throw new Error("Trop tard : l'échéance de l'épreuve est passée.");
    if (!sanitizeTaps(taps)) throw new Error('Résultat invalide (5 taps au plus).');
    if (this.store.state.targetResults.some((r) => r.duel_id === duelId && r.side === side)) throw new Error('Vous avez déjà joué cette épreuve.');
    this.store.state.targetResults.push({ duel_id: duelId, side, player_id: me.id, taps, submitted_at: this.now().toISOString() });
    const count = this.store.state.targetResults.filter((r) => r.duel_id === duelId).length;
    this.save();
    this.notify('target_trial_results');
    return { both_submitted: count >= 2 || d.opponent_migrant_id !== null };
  }

  async setDelegation(delegateId: string | null, until: string | null): Promise<void> {
    const me = this.me();
    if (!delegateId) {
      me.delegated_to = null;
      me.delegation_until = null;
    } else {
      if (delegateId === me.id || !this.players.some((p) => p.id === delegateId && p.is_active_slot && p.status === 'active')) throw new Error('Délégataire invalide.');
      const end = until ? new Date(until).getTime() : 0;
      if (!(end > this.now().getTime() && end <= this.now().getTime() + 14 * 86_400_000)) throw new Error("Durée de délégation : jusqu'à 14 jours.");
      me.delegated_to = delegateId;
      me.delegation_until = new Date(end).toISOString();
      const d = this.players.find((p) => p.id === delegateId);
      this.system('village_square', `🔑 ${me.display_name} délègue temporairement son poste à ${d?.display_name ?? '?'}.`);
    }
    this.save();
    this.notify('players');
  }

  async editConstitution(articleNumber: number, title: string, body: string): Promise<void> {
    const me = this.requireFree();
    const snap = this.store.state.snapshot;
    if (snap.village.act_number < 3) throw new Error("La Constitution se rédige à l'Acte III.");
    const existing = snap.constitution.find((a) => a.article_number === articleNumber);
    if (existing && (existing.status === 'adopted' || existing.status === 'proposed')) throw new Error(`Article ${articleNumber} verrouillé (${existing.status}).`);
    if (existing) {
      existing.title = title.trim();
      existing.body = body.trim();
      if (existing.status === 'repealed') existing.status = 'draft';
    } else {
      snap.constitution.push({ id: uuid(), article_number: articleNumber, title: title.trim(), body: body.trim(), status: 'draft' });
    }
    void me;
    this.save();
    this.notify('constitution_articles');
  }

  // ---------------------------------------------------------------------------
  // Administration
  // ---------------------------------------------------------------------------
  private snapshotInternal(trigger: string, label?: string | null): void {
    const now = this.now();
    const date = dayKey(now);
    if ((trigger === 'auto_midnight' || trigger === 'pre_agora') && this.store.snapshots.some((x) => x.info.snapshot_date === date && x.info.trigger_type === trigger)) return;
    const data: DemoCore = clone({ state: this.store.state, ledger: this.store.ledger, screenings: this.store.screenings, hidden: this.store.hidden });
    const size = JSON.stringify(data).length;
    const defaultLabel = trigger === 'auto_midnight' ? `Sauvegarde automatique du ${date}` : trigger === 'pre_restore' ? 'Avant restauration' : `Sauvegarde manuelle (${now.toLocaleString('fr-FR')})`;
    this.store.snapshots.push({ info: { id: uuid(), snapshot_date: date, trigger_type: trigger, label: label ?? defaultLabel, size_bytes: size, created_at: now.toISOString(), days_ago: 0 }, data });
    this.store.snapshots = this.store.snapshots.slice(-MAX_SNAPSHOTS);
  }

  async listSnapshots(): Promise<SnapshotInfo[]> {
    this.requireAdmin();
    const today = new Date(`${dayKey(this.now())}T00:00:00Z`).getTime();
    return this.store.snapshots
      .map((x) => ({ ...x.info, days_ago: Math.round((today - new Date(`${x.info.snapshot_date}T00:00:00Z`).getTime()) / 86_400_000) }))
      .reverse();
  }

  async createSnapshot(label?: string | null): Promise<void> {
    this.requireAdmin();
    this.snapshotInternal('manual', label);
    this.save();
  }

  async restoreSnapshot(snapshotId: string): Promise<void> {
    this.requireAdmin();
    const snap = this.store.snapshots.find((x) => x.info.id === snapshotId);
    if (!snap) throw new Error('Sauvegarde introuvable.');
    const revision = this.store.state.snapshot.village.revision;
    this.snapshotInternal('pre_restore');
    const data = clone(snap.data);
    this.store.state = data.state;
    this.store.ledger = data.ledger;
    this.store.screenings = data.screenings;
    this.store.hidden = data.hidden;
    this.store.state.snapshot.village.revision = revision + 1;
    this.store.state.snapshot.village.last_tick_at = this.now().toISOString();
    for (const d of this.store.state.duels) if (d.status === 'active') d.status = 'cancelled';
    this.system('village_square', `⏪ Le village a été restauré à l'état « ${snap.info.label} ».`);
    this.save();
    this.notify('*');
  }

  async exportState(): Promise<unknown> {
    this.requireAdmin();
    return { format: 'les-gaulois-snapshot', schema_version: '4.0', exported_at: this.now().toISOString(), demo: clone({ state: this.store.state, ledger: this.store.ledger, screenings: this.store.screenings, hidden: this.store.hidden, tavern: this.store.tavern, gazette: this.store.gazette, events: this.store.events }) };
  }

  async importState(json: unknown, label?: string | null): Promise<void> {
    this.requireAdmin();
    const j = json as { format?: string; demo?: DemoCore & Partial<DemoStore> };
    if (j?.format !== 'les-gaulois-snapshot' || !j.demo?.state) throw new Error('Fichier JSON invalide (export du mode démo attendu).');
    const now = this.now();
    this.store.snapshots.push({
      info: { id: uuid(), snapshot_date: dayKey(now), trigger_type: 'import', label: label ?? `Import JSON (${now.toLocaleString('fr-FR')})`, size_bytes: JSON.stringify(j.demo).length, created_at: now.toISOString(), days_ago: 0 },
      data: { state: j.demo.state, ledger: j.demo.ledger ?? [], screenings: j.demo.screenings ?? [], hidden: j.demo.hidden ?? [] },
    });
    await this.restoreSnapshot(this.store.snapshots[this.store.snapshots.length - 1]!.info.id);
  }

  async configureSlot(playerId: string, displayName: string | null, characterName: string | null, pin: string | null, active: boolean): Promise<void> {
    this.requireAdmin();
    const p = this.players.find((x) => x.id === playerId);
    if (!p) throw new Error('Joueur introuvable.');
    if (pin !== null && !/^\d{4}$/.test(pin)) throw new Error('PIN invalide (4 chiffres).');
    if (displayName?.trim()) p.display_name = displayName.trim();
    if (characterName?.trim()) p.character_name = characterName.trim();
    p.is_active_slot = active;
    if (pin !== null) {
      this.store.pins[p.id] = pin;
      p.must_change_pin = true;
    }
    this.save();
    this.notify('players');
  }

  async aiStatus(): Promise<Record<string, unknown>> {
    this.requireAdmin();
    return { ok: true, model: 'dictionnaire de secours (mode démo)', effort: '—', api_key_configured: false, recent_calls: [] };
  }

  runWorldSync(mode: 'nightly' | 'maintenance'): Promise<OpResponse> {
    if (mode === 'maintenance') return this.run((s) => ({ ok: true, duels_advanced: s.expireDuels() }), true);
    this.snapshotInternal('auto_midnight');
    return this.run(async (s) => {
      s.applyWorld(null, []);
      const scandals = s.publishScandals();
      const today = dayKey(s.now);
      const gazette = await s.writeGazette(today, scandals);
      let migrants: string[] = [];
      const open = s.snapshot.migrants.filter((m) => m.status === 'candidate').length;
      if ([1, 3, 5].includes(weekdayOfKey(today)) && open < 5) {
        migrants = await s.generateMigrants(createRng(`${s.snapshot.village.id}:${today}:migrants`).int(1, 3));
      }
      const temptations = await s.generateTemptations(20);
      return { ok: true, gazette: gazette.headline, migrants: migrants.length, temptations: temptations.length };
    });
  }

  generateMigrants(count: number): Promise<OpResponse> {
    this.requireAdmin();
    return this.run(async (s) => ({ ok: true, created: await s.generateMigrants(Math.max(1, Math.min(3, count))) }));
  }

  regenerateGazette(): Promise<OpResponse> {
    this.requireAdmin();
    return this.run(async (s) => ({ ok: true, gazette: (await s.writeGazette(dayKey(s.now), [])).headline }));
  }

  sendTemptation(playerId: string): Promise<OpResponse> {
    this.requireAdmin();
    return this.run(async (s) => {
      const id = await s.offerTemptation(playerId);
      return id ? { ok: true, temptation_id: id } : { ok: false, error: 'Joueur indisponible.' };
    });
  }

  async advanceTime(hours: number): Promise<OpResponse> {
    const before = dayKey(this.now());
    this.store.offsetMs += hours * 3_600_000;
    this.save();
    const crossed = dayKey(this.now()) !== before;
    return this.runWorldSync(crossed ? 'nightly' : 'maintenance');
  }

  async resetDemo(): Promise<void> {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* rien */
    }
    this.store = initialStore();
    this.token = null;
    this.save();
    this.notify('*');
  }
}
