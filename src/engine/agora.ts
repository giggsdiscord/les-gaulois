/**
 * L'Agora du dimanche [GDD §1.2, §4] : dépouillement des votes nominatifs OUI / NON,
 * voix prépondérante de la Présidente (Ely), majorité des deux tiers pour l'exécution,
 * vote des naturalisés aligné sur leur protecteur, veto institutionnel puis exécution.
 */
import { nextAgoraSession, weeksBetween } from './calendar.ts';
import {
  COLLECTIVIZATION_EVAPORATION,
  PRESIDENT_ROLE,
} from './constants.ts';
import { pushEvent, pushLedger, pushTrigger } from './effects.ts';
import { grantPortfolio } from './elections.ts';
import { applySentence, type Sentence } from './justice.ts';
import { gauge, money } from './math.ts';
import { admitMigrant, naturalizeMigrant, rejectMigrant } from './migrants.ts';
import { activePlayers, findPlayer } from './population.ts';
import type { Rng } from './rng.ts';
import type { AgoraProposal, EngineEffects, GameSnapshot, Migrant, Portfolio } from './types.ts';

/** Délai pendant lequel une décision adoptée peut être frappée de veto avant exécution. */
export const VETO_WINDOW_HOURS = 6;

/** Semaine de jeu d'une séance d'Agora (identique à la fonction SQL agora_week_for). */
export function agoraWeekFor(s: GameSnapshot, closesAt: Date, now: Date): number {
  return s.village.season_number + weeksBetween(now, closesAt);
}

export interface TallyResult {
  yes: number;
  no: number;
  yesVoters: string[];
  noVoters: string[];
  naturalizedYes: number;
  naturalizedNo: number;
  passed: boolean;
  tieBrokenByPresident: boolean;
  majority: 'simple' | 'two_thirds';
}

function eligiblePlayerIds(s: GameSnapshot, proposal: AgoraProposal): Set<string> {
  return new Set(
    activePlayers(s)
      .filter((p) => p.id !== proposal.target_player_id)
      .map((p) => p.id),
  );
}

/** Résidents naturalisés : votent systématiquement comme leur protecteur [GDD §4.3]. */
function naturalizedVoters(s: GameSnapshot): Migrant[] {
  return s.village.act_number >= 3
    ? s.migrants.filter((m) => m.status === 'accepted' && m.is_naturalized && m.patron_player_id !== null)
    : [];
}

export function tallyProposal(s: GameSnapshot, proposal: AgoraProposal): TallyResult {
  const eligible = eligiblePlayerIds(s, proposal);
  const yesVoters = proposal.votes_yes.filter((id) => eligible.has(id));
  const noVoters = proposal.votes_no.filter((id) => eligible.has(id) && !yesVoters.includes(id));
  let naturalizedYes = 0;
  let naturalizedNo = 0;
  for (const m of naturalizedVoters(s)) {
    if (m.id === proposal.target_migrant_id) continue;
    if (yesVoters.includes(m.patron_player_id!)) naturalizedYes += 1;
    else if (noVoters.includes(m.patron_player_id!)) naturalizedNo += 1;
  }
  const yes = yesVoters.length + naturalizedYes;
  const no = noVoters.length + naturalizedNo;
  const president = activePlayers(s).find((p) => p.role_code === PRESIDENT_ROLE);
  let passed: boolean;
  let tieBrokenByPresident = false;
  if (proposal.required_majority === 'two_thirds') {
    passed = yes >= 2 && yes * 3 >= 2 * (yes + no);
  } else if (yes === no && yes > 0 && president) {
    tieBrokenByPresident = true;
    passed = yesVoters.includes(president.id);
  } else {
    passed = yes > no;
  }
  return { yes, no, yesVoters, noVoters, naturalizedYes, naturalizedNo, passed, tieBrokenByPresident, majority: proposal.required_majority };
}

export interface ProposalCloseResult {
  proposal: AgoraProposal;
  tally: TallyResult;
}

/** Clôture d'un scrutin (séance du dimanche) ; les candidats refusés repartent aussitôt. */
export function closeProposal(s: GameSnapshot, fx: EngineEffects, proposal: AgoraProposal, now: Date): ProposalCloseResult {
  const p: AgoraProposal = { ...proposal };
  const tally = tallyProposal(s, p);
  if (p.status !== 'open') return { proposal: p, tally };
  p.status = tally.passed ? 'passed' : 'rejected';
  p.closed_at = now.toISOString();
  pushEvent(fx, s, {
    event_type: tally.passed ? 'proposal_passed' : 'proposal_rejected',
    title: tally.passed ? 'Adopté à l\'Agora' : 'Rejeté à l\'Agora',
    body: `« ${p.title} » : ${tally.yes} OUI / ${tally.no} NON${tally.tieBrokenByPresident ? ' (voix prépondérante de la Présidente)' : ''}${
      p.required_majority === 'two_thirds' ? ' — majorité des deux tiers requise' : ''
    }.`,
    data: { proposal_id: p.id, yes: tally.yes, no: tally.no },
  });
  if (!tally.passed && p.kind === 'migrant_admission' && p.target_migrant_id) {
    rejectMigrant(s, fx, now, p.target_migrant_id);
  }
  if (!tally.passed && p.kind === 'constitution_article') {
    const article = s.constitution.find((a) => a.article_number === Number(p.payload.article_number));
    if (article && article.status === 'proposed') article.status = 'draft';
  }
  return { proposal: p, tally };
}

export function isReadyForExecution(proposal: AgoraProposal, now: Date): boolean {
  if (proposal.status !== 'passed' || proposal.executed_at !== null || !proposal.closed_at) return false;
  return now.getTime() - new Date(proposal.closed_at).getTime() >= VETO_WINDOW_HOURS * 3_600_000;
}

export interface ExecutionResult {
  proposal: AgoraProposal;
  summary: string;
  /** Initiative libre : l'Edge Function gm-ai-action traduit le détail explicatif en effets bornés. */
  needsAi: boolean;
}

function compileConstitution(s: GameSnapshot): string {
  return s.constitution
    .filter((a) => a.status === 'adopted')
    .sort((a, b) => a.article_number - b.article_number)
    .map((a) => `Article ${a.article_number} — ${a.title}\n${a.body}`)
    .join('\n\n');
}

/** Exécute une décision adoptée (après la fenêtre de veto ou après victoire au Carlage). */
export function executeProposal(s: GameSnapshot, fx: EngineEffects, rng: Rng, proposal: AgoraProposal, now: Date): ExecutionResult {
  const p: AgoraProposal = { ...proposal };
  const v = s.village;
  let summary = '';
  let needsAi = false;
  const tally = tallyProposal(s, p);
  const flag = (value: unknown) => value === true || value === 'true';

  switch (p.kind) {
    case 'initiative':
      needsAi = true;
      summary = 'Initiative adoptée : transmise au Maître du Jeu pour traduction en effets concrets.';
      pushTrigger(fx, { type: 'needs_ai', reason: 'initiative', payload: { proposal_id: p.id, title: p.title, detailed_explanation: p.detailed_explanation } });
      break;
    case 'migrant_admission': {
      const m = p.target_migrant_id
        ? admitMigrant(s, fx, rng, now, {
            migrantId: p.target_migrant_id,
            proposalId: p.id,
            proposerId: p.proposer_id,
            votesYes: tally.yesVoters,
            votesNo: tally.noVoters,
          })
        : null;
      summary = m ? `${m.full_name} est admis(e) au hameau.` : 'Candidat introuvable : admission sans objet.';
      break;
    }
    case 'naturalization': {
      const m = p.target_migrant_id ? naturalizeMigrant(s, fx, p.target_migrant_id) : null;
      summary = m ? `${m.full_name} est naturalisé(e).` : 'Naturalisation impossible.';
      break;
    }
    case 'tribunal': {
      const res = applySentence(s, fx, rng, now, {
        sentence: p.payload.sentence as Sentence,
        targetMigrantId: p.target_migrant_id,
        targetPlayerId: p.target_player_id,
        days: Number(p.payload.days ?? 3),
      });
      summary = res.ok ? res.summary : res.error ?? 'Sentence inapplicable.';
      break;
    }
    case 'collectivization': {
      // 40 % de l'épargne s'évapore vers Andorre, le reste rejoint la caisse commune [GDD §5.1]
      let requisitioned = 0;
      let evaporated = 0;
      for (const player of activePlayers(s)) {
        const wealth = player.private_wealth_eur;
        if (wealth <= 0) continue;
        const lost = money(wealth * COLLECTIVIZATION_EVAPORATION);
        const kept = money(wealth - lost);
        player.private_wealth_eur = 0;
        player.morale_pct = Math.max(0, player.morale_pct - 15);
        requisitioned += kept;
        evaporated += lost;
        pushLedger(fx, s, { account: 'private', player_id: player.id, amount_eur: -wealth, label: 'Réquisition collectiviste', category: 'collectivization' });
      }
      for (const m of s.migrants) {
        m.private_employer_id = null;
        m.private_wage_eur_week = 0;
      }
      v.treasury_eur = money(v.treasury_eur + requisitioned);
      v.andorra_hidden_capital_eur = money(v.andorra_hidden_capital_eur + evaporated);
      v.collectivization_active = true;
      pushLedger(fx, s, { account: 'treasury', amount_eur: requisitioned, label: 'Patrimoines privés réquisitionnés', category: 'collectivization' });
      summary = `Collectivisation : ${requisitioned.toFixed(2)} € versés à la caisse, ${evaporated.toFixed(2)} € évaporés vers Andorre.`;
      break;
    }
    case 'decollectivization':
      v.collectivization_active = false;
      summary = 'Retour de la propriété privée.';
      break;
    case 'prohibition': {
      const active = flag(p.payload.active);
      const target = String(p.payload.target);
      if (target === 'alcohol') v.prohibition_alcohol = active;
      if (target === 'drugs') v.prohibition_drugs = active;
      if (target === 'tomatoes') v.prohibition_tomatoes = active;
      summary = `${active ? 'Prohibition' : 'Levée de la prohibition'} : ${target}.`;
      break;
    }
    case 'rationing':
      v.rationing_active = flag(p.payload.active);
      summary = v.rationing_active ? 'Rationnement instauré (−20 % de consommation).' : 'Fin du rationnement.';
      break;
    case 'ministry_election': {
      const portfolio = String(p.payload.portfolio) as Portfolio;
      const winner = findPlayer(s, p.target_player_id);
      // V5.3 : la motion vaut mandat (et annule l'élection vivante du même portefeuille)
      grantPortfolio(s, portfolio, winner, now, null);
      summary = winner ? `${winner.display_name} reçoit le portefeuille ${portfolio}.` : 'Élection sans titulaire.';
      break;
    }
    case 'constitution_article': {
      const article = s.constitution.find((a) => a.article_number === Number(p.payload.article_number));
      if (article) {
        article.status = 'adopted';
        v.constitution_text = compileConstitution(s);
        v.international_notoriety_pct = gauge(v.international_notoriety_pct + 2);
      }
      summary = article ? `Article ${article.article_number} adopté.` : 'Article introuvable.';
      break;
    }
    case 'independence':
      v.independence_proclaimed = true;
      v.international_notoriety_pct = gauge(v.international_notoriety_pct + 15);
      v.admin_pressure_pct = gauge(v.admin_pressure_pct + 25);
      v.morale_pct = gauge(v.morale_pct + 10);
      summary = 'Proclamation d\'indépendance de la Principauté des Gaulois !';
      pushEvent(fx, s, { event_type: 'independence', title: 'Indépendance', body: summary });
      break;
  }

  if (!needsAi) p.executed_at = now.toISOString();
  p.ai_execution_summary = needsAi ? p.ai_execution_summary : summary;
  return { proposal: p, summary, needsAi };
}

// ---------------------------------------------------------------------------
// Issue d'un duel de Carlage (veto contesté, putsch, sentence bloquée)
// ---------------------------------------------------------------------------
export interface DuelContext {
  context: 'veto' | 'putsch' | 'tribunal' | 'friendly';
  /** Vainqueur du côté du statu quo (veto maintenu, putsch étouffé). */
  defenderWon: boolean;
  proposal?: AgoraProposal | null;
  leaderMigrantId?: string | null;
}

export interface DuelConsequence {
  proposal: AgoraProposal | null;
  summary: string;
}

export function applyDuelConsequences(s: GameSnapshot, fx: EngineEffects, rng: Rng, ctx: DuelContext, now: Date): DuelConsequence {
  const v = s.village;
  if (ctx.context === 'putsch') {
    const leader = s.migrants.find((m) => m.id === ctx.leaderMigrantId);
    if (ctx.defenderWon) {
      if (leader) leader.is_detained_until = new Date(now.getTime() + 24 * 3_600_000).toISOString();
      v.left_wing_ideology_pct = gauge(v.left_wing_ideology_pct - 3);
      v.insecurity_offset = Math.round((v.insecurity_offset - 5) * 100) / 100;
      pushEvent(fx, s, { event_type: 'putsch_failed', title: 'Putsch étouffé', body: 'La Présidente a sorti le meneur du carré. Cachot pour les insurgés.' });
      return { proposal: null, summary: 'Putsch étouffé.' };
    }
    v.collectivization_active = true;
    v.left_wing_ideology_pct = gauge(v.left_wing_ideology_pct + 10);
    v.morale_pct = gauge(v.morale_pct - 10);
    v.admin_pressure_pct = gauge(v.admin_pressure_pct + 5);
    v.strike_until = new Date(now.getTime() + 3 * 24 * 3_600_000).toISOString();
    pushEvent(fx, s, { event_type: 'putsch_success', title: 'Coup d\'État dominical', body: `${leader?.full_name ?? 'La faction'} s'empare de l'Agora et impose la collectivisation.` });
    return { proposal: null, summary: 'Putsch réussi : collectivisation imposée.' };
  }
  if ((ctx.context === 'veto' || ctx.context === 'tribunal') && ctx.proposal) {
    if (ctx.defenderWon) {
      pushEvent(fx, s, { event_type: 'veto_upheld', title: 'Veto maintenu', body: `Le veto sur « ${ctx.proposal.title} » tient bon.` });
      return { proposal: { ...ctx.proposal }, summary: 'Veto maintenu.' };
    }
    const reinstated: AgoraProposal = { ...ctx.proposal, status: 'passed', vetoed_by: null };
    const exec = executeProposal(s, fx, rng, reinstated, now);
    pushEvent(fx, s, { event_type: 'veto_overturned', title: 'Veto renversé au Carlage', body: `« ${ctx.proposal.title} » est rétablie et exécutée.` });
    return { proposal: exec.proposal, summary: exec.summary };
  }
  return { proposal: ctx.proposal ?? null, summary: 'Duel amical : honneur sauf.' };
}

/** Dossier d'admission soumis automatiquement à l'Agora pour un candidat généré par l'IA. */
export function admissionProposalDraft(s: GameSnapshot, migrant: Migrant, now: Date): Omit<AgoraProposal, 'id'> {
  const closes = nextAgoraSession(now);
  return {
    week_number: agoraWeekFor(s, closes, now),
    proposer_id: null,
    kind: 'migrant_admission',
    title: `Admission de ${migrant.full_name} (${migrant.age} ans, ${migrant.origin})`,
    detailed_explanation: `${migrant.value_proposition}\n\nReligion : ${migrant.religion}. Sensibilité politique déclarée : ${migrant.political_leaning}. Spécialité : ${migrant.specialty_code} (niveau ${migrant.specialty_level}). Enfants : ${migrant.children_count}.`,
    category: 'immigration',
    payload: { migrant_id: migrant.id },
    target_migrant_id: migrant.id,
    target_player_id: null,
    required_majority: 'simple',
    votes_yes: [],
    votes_no: [],
    status: 'open',
    vetoed_by: null,
    closes_at: closes.toISOString(),
    ai_execution_summary: null,
    executed_at: null,
    closed_at: null,
  };
}
