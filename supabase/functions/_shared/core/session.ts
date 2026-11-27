/**
 * GameSession — orchestre le moteur déterministe pour une requête d'Edge Function :
 * écoulement du temps, Agora (clôture, veto, exécution), actions métiers, Action Libre IA,
 * verrous, tentations, duels de Carlage, Gazette, migrants, indicateurs cachés.
 * Module pur : l'état est chargé et écrit par runtime/ ; l'IA est injectée (GmPort).
 */
import {
  addHours,
  applyAiDeltas,
  applyMarketQuotes,
  dayKey,
  applyDuelConsequences,
  applyElapsedTime,
  applyIncident,
  applyInjury,
  admissionProposalDraft,
  calendarSeasonOf,
  canFightCarlage,
  closeProposal,
  constants,
  computeHiddenIndicators,
  createCandidate,
  createRng,
  createTemptation,
  decideApproval,
  deepClone,
  emptyEffects,
  executeProposal,
  isFree,
  isReadyForExecution,
  localParts,
  mergeEffects,
  money,
  gauge,
  nextAgoraSession,
  npcMove,
  npcTargetTaps,
  performAction,
  portfolioUnlocked,
  publishScandals,
  pushEvent,
  pushLedger,
  refreshDerived,
  resolveRound,
  respondToTemptation,
  rollCarlageInjuries,
  sanitizeTaps,
  scoreTargetTrial,
  tallyProposal,
  targetWinner,
  type ActionRequest,
  type AgoraProposal,
  type DuelState,
  type EngineEffects,
  type EngineEvent,
  type EngineTrigger,
  type FighterStats,
  type GameSnapshot,
  type Player,
  type Rng,
} from '../engine/index.ts';
import { buildCommitPayload, isTrivialChange } from './changes.ts';
import {
  applyDuelState,
  fighterStats,
  isAbandoned,
  isRoundDue,
  JOIN_WINDOW_SECONDS,
  movesForRound,
  newDuelRow,
  pickChampion,
  rowToDuelState,
} from './duel.ts';
import type { GmContext, PlayerBrief, RecentTemptation } from './gm/prompt.ts';
import type { GmPort } from './gm/runner.ts';
import { pickTemptationTheme, temptationConditions } from './gm/temptationBank.ts';
import type {
  AiCallDraft,
  CarlageDuelRow,
  CommitPayload,
  DuelMode,
  GameState,
  GazetteDraft,
  HiddenIndicatorRow,
  TavernDraft,
  WeatherSnapshot,
} from './types.ts';

export interface SessionOptions {
  now: Date;
  gm: GmPort;
}

export interface OpResult {
  ok: boolean;
  error?: string;
  [key: string]: unknown;
}

/** Titre des petites histoires de résidents (V5.7, événement `resident_story` du moteur). */
const STORY_PREFIX = 'Petite histoire : ';
/** Titre des événements de voisinage (V5.8, `NEIGHBOR_EVENT_PREFIX` du moteur). */
const NEIGHBOR_PREFIX = 'Voisins : ';
/** Titre des événements de visite (V5.9, `VISITOR_EVENT_PREFIX` du moteur). */
const VISITOR_PREFIX = 'Visiteur : ';
/** Titre du bilan hebdomadaire (V6.0, `WEEK_REVIEW_PREFIX` du moteur). */
const WEEK_PREFIX = 'Bilan de la semaine : ';
const fail = (error: string): OpResult => ({ ok: false, error });

const ACTION_INPUT_KEYS = [
  'action_code', 'on_behalf_of_id', 'target_player_id', 'target_migrant_id', 'target_child_id',
  'target_structure_id', 'quantity', 'amount_eur', 'catalog_item_id', 'params', 'free_text',
] as const;

/** Ne garde que les champs autorisés d'une requête client ; l'acteur est imposé par la session. */
export function sanitizeActionInput(input: unknown, actorId: string): ActionRequest | null {
  if (input === null || typeof input !== 'object') return null;
  const raw = input as Record<string, unknown>;
  if (typeof raw.action_code !== 'string' || raw.action_code.length === 0) return null;
  const req: Record<string, unknown> = { actor_id: actorId };
  for (const key of ACTION_INPUT_KEYS) {
    const value = raw[key];
    if (value === undefined || value === null) continue;
    if (key === 'params') {
      if (typeof value === 'object' && !Array.isArray(value)) {
        const { approval_group: _ignored, ...params } = value as Record<string, unknown>;
        req.params = params;
      }
    } else if (key === 'quantity' || key === 'amount_eur') {
      const n = Number(value);
      if (Number.isFinite(n)) req[key] = n;
    } else if (typeof value === 'string') {
      req[key] = key === 'free_text' ? value.slice(0, 1000) : value;
    }
  }
  return req as unknown as ActionRequest;
}

export class GameSession {
  readonly initial: GameState;
  readonly state: GameState;
  readonly now: Date;
  readonly gm: GmPort;
  readonly fx: EngineEffects = emptyEffects();
  readonly tavern: TavernDraft[] = [];
  readonly gazette: GazetteDraft[] = [];
  readonly aiCalls: AiCallDraft[] = [];
  news: string[] = [];
  daysProcessed = 0;
  private seq = 0;

  constructor(state: GameState, options: SessionOptions) {
    this.initial = deepClone(state);
    this.state = deepClone(state);
    this.now = options.now;
    this.gm = options.gm;
  }

  get snapshot(): GameSnapshot {
    return this.state.snapshot;
  }

  private rng(label: string): Rng {
    this.seq += 1;
    const v = this.initial.snapshot.village;
    return createRng(`${v.id}:${v.revision}:${this.now.toISOString()}:${label}:${this.seq}`);
  }

  private player(id: string): Player | undefined {
    return this.snapshot.players.find((p) => p.id === id);
  }

  private refresh(): void {
    const p = localParts(this.now);
    refreshDerived(this.snapshot, this.now, calendarSeasonOf(p.month, p.day), this.fx);
  }

  private absorb(result: EngineEffects & { snapshot: GameSnapshot }): void {
    this.state.snapshot = result.snapshot;
    mergeEffects(this.fx, { events: result.events, ledger: result.ledger, screenings: result.screenings, approvals: result.approvals, triggers: [] });
    this.processTriggers(result.triggers);
  }

  private processTriggers(triggers: readonly EngineTrigger[]): void {
    for (const t of triggers) {
      this.fx.triggers.push(t);
      if (t.type === 'putsch_attempt') this.startPutsch(t.leader_migrant_id);
      if (t.type === 'defeat') this.tavern.push({ channel: 'village_square', content: `☠️ Défaite collective : ${t.reason === 'soviet_collapse' ? 'effondrement soviétique du hameau' : 'extinction démographique'}.` });
      if (t.type === 'act_changed') this.tavern.push({ channel: 'village_square', content: `🏔️ Le hameau entre dans l'Acte ${t.to} !` });
    }
  }

  // -------------------------------------------------------------------------
  // Temps & Agora
  // -------------------------------------------------------------------------
  tick(): void {
    const r = applyElapsedTime(this.snapshot, this.now);
    this.daysProcessed = r.daysProcessed;
    this.absorb(r);
  }

  async maintainAgora(): Promise<void> {
    const proposals = this.state.proposals;
    for (let i = 0; i < proposals.length; i++) {
      const p = proposals[i]!;
      if (p.status !== 'open' || new Date(p.closes_at).getTime() > this.now.getTime()) continue;
      const r = closeProposal(this.snapshot, this.fx, p, this.now);
      proposals[i] = r.proposal;
      this.tavern.push({
        channel: 'agora_hall',
        content: `🗳️ « ${p.title} » : ${r.tally.passed ? 'ADOPTÉ' : 'REJETÉ'} (${r.tally.yes} OUI / ${r.tally.no} NON)${r.tally.passed ? ' — veto possible pendant 6 h.' : '.'}`,
      });
    }
    for (let i = 0; i < proposals.length; i++) {
      const p = proposals[i]!;
      if (!isReadyForExecution(p, this.now)) continue;
      if (p.kind === 'initiative') {
        proposals[i] = await this.executeInitiative(p);
      } else {
        const r = executeProposal(this.snapshot, this.fx, this.rng(`exec:${p.id}`), p, this.now);
        proposals[i] = r.proposal;
        this.tavern.push({ channel: 'agora_hall', content: `⚖️ Exécution de « ${p.title} » : ${r.summary}` });
      }
    }
    this.refresh();
  }

  private async executeInitiative(p: AgoraProposal): Promise<AgoraProposal> {
    const tally = tallyProposal(this.snapshot, p);
    const g = await this.gm.run(
      { kind: 'initiative', proposal: { id: p.id, title: p.title, detailed_explanation: p.detailed_explanation, category: p.category, yes: tally.yes, no: tally.no } },
      this.gmContext(null),
      p.proposer_id,
    );
    this.aiCalls.push(g.aiCall);
    const applied = applyAiDeltas(this.snapshot, g.response.deltas, `Initiative de l'Agora : ${p.title}`, this.now);
    this.absorb(applied);
    if (g.response.triggered_incident) {
      const inc = applyIncident(this.snapshot, g.response.triggered_incident, this.rng(`incident:${p.id}`), this.now);
      this.absorb({ snapshot: inc.snapshot, ...inc.effects });
    }
    pushEvent(this.fx, this.snapshot, {
      event_type: 'initiative_executed',
      title: g.response.gazette_headline || `Initiative appliquée : ${p.title}`,
      body: g.response.narrative_text,
      data: { proposal_id: p.id, deltas: applied.applied, fallback: g.usedFallback },
    });
    this.tavern.push({ channel: 'agora_hall', content: `📜 « ${p.title} » entre en vigueur. ${g.response.narrative_text}`.slice(0, 1990) });
    return {
      ...p,
      executed_at: this.now.toISOString(),
      ai_execution_summary: `${g.response.gazette_headline} — ${g.response.narrative_text}`.slice(0, 4000),
      effects_json: applied.applied,
    } as AgoraProposal;
  }

  // -------------------------------------------------------------------------
  // Actions métiers, Action Libre IA, verrous, tentations
  // -------------------------------------------------------------------------
  async action(playerId: string, input: unknown): Promise<OpResult> {
    const req = sanitizeActionInput(input, playerId);
    if (!req) return fail('Requête d\'action invalide.');
    const out = performAction(this.snapshot, req, this.now);
    if (!out.ok) return fail(out.error ?? 'Action refusée.');
    this.absorb(out);
    let narrative = out.narrative;
    let headline: string | null = null;
    const needsAi = out.triggers.find((t) => t.type === 'needs_ai' && t.reason === 'free_action');
    if (needsAi && needsAi.type === 'needs_ai') {
      const brief = this.brief(playerId);
      const g = await this.gm.run({ kind: 'free_action', player: brief, text: String(needsAi.payload.free_text ?? '') }, this.gmContext(brief), playerId);
      this.aiCalls.push(g.aiCall);
      const applied = applyAiDeltas(this.snapshot, g.response.deltas, `Action libre — ${brief.display_name}`, this.now);
      this.absorb(applied);
      if (g.response.triggered_incident) {
        const inc = applyIncident(this.snapshot, g.response.triggered_incident, this.rng(`incident:${playerId}`), this.now);
        this.absorb({ snapshot: inc.snapshot, ...inc.effects });
      }
      narrative = g.response.narrative_text;
      headline = g.response.gazette_headline;
      pushEvent(this.fx, this.snapshot, {
        event_type: 'free_action_result',
        visibility: 'private',
        player_id: playerId,
        title: headline || 'Action libre',
        body: narrative,
        data: { deltas: applied.applied, incident: g.response.triggered_incident, fallback: g.usedFallback },
      });
    }
    return { ok: true, status: out.status, narrative, headline, ap_spent: out.ap_spent };
  }

  decideApproval(playerId: string, approvalId: string, approve: boolean, reason: string | null): OpResult {
    const d = decideApproval(this.snapshot, this.fx, approvalId, playerId, approve, reason, this.now);
    if (!d.ok) return fail(d.error ?? 'Décision impossible.');
    if (!d.ready) return { ok: true, executed: false };
    const group = String((d.ready.params as Record<string, unknown> | undefined)?.approval_group ?? '');
    const out = performAction(this.snapshot, d.ready, this.now, { executingApprovalGroup: group });
    if (!out.ok) {
      for (const a of this.snapshot.approvals) {
        if ((a.payload.params as Record<string, unknown> | undefined)?.approval_group === group && a.status === 'approved') {
          a.status = 'expired';
          a.reason = `Exécution impossible : ${out.error}`;
        }
      }
      return { ok: true, executed: false, error: out.error ?? undefined };
    }
    this.absorb(out);
    return { ok: true, executed: true, narrative: out.narrative };
  }

  respondTemptation(playerId: string, temptationId: string, yieldToIt: boolean): OpResult {
    const r = respondToTemptation(this.snapshot, this.fx, temptationId, playerId, yieldToIt, this.now);
    if (!r.ok) return fail(r.error ?? 'Réponse impossible.');
    this.refresh();
    return { ok: true, narrative: r.narrative };
  }

  // -------------------------------------------------------------------------
  // Duels : Carlage 2×2 (en direct) ou épreuve de la cible (en différé)
  // -------------------------------------------------------------------------
  private duelName(row: CarlageDuelRow, side: 'a' | 'b' | null): string {
    if (side === 'a') return this.player(row.player_a_id)?.display_name ?? 'A';
    if (row.player_b_id) return this.player(row.player_b_id)?.display_name ?? 'B';
    return this.snapshot.migrants.find((m) => m.id === row.opponent_migrant_id)?.full_name ?? 'le meneur';
  }

  private addDuel(row: CarlageDuelRow): void {
    this.state.duels.push(row);
    const a = this.duelName(row, 'a');
    const b = this.duelName(row, 'b');
    const when = new Date(row.round_deadline_at).toLocaleString('fr-FR', { timeZone: 'Europe/Madrid', weekday: 'long', hour: '2-digit', minute: '2-digit' });
    const target = row.mode === 'target';
    pushEvent(this.fx, this.snapshot, {
      event_type: 'carlage_started',
      title: target ? 'Épreuve de la cible' : 'Duel au Carlage',
      body: target ? `${a} affronte ${b} à l'épreuve de la cible (5 cibles, à jouer avant ${when}).` : `${a} affronte ${b} sur la grille 2×2.`,
      data: { duel_id: row.id, context: row.context, mode: row.mode },
    });
    this.tavern.push({
      channel: 'village_square',
      content: target
        ? `🎯 Épreuve de la cible : ${a} contre ${b} — chacun joue ses 5 cibles avant ${when}.`
        : `🥋 Carlage : ${a} contre ${b} — rendez-vous dans l'arène (1re manche avant ${when}).`,
    });
  }

  /** Joueur libre le plus en forme (épreuve de la cible : aucun effort physique requis). */
  private pickFree(excludeIds: readonly string[]): Player | undefined {
    return this.snapshot.players
      .filter((p) => !excludeIds.includes(p.id) && isFree(p, this.now))
      .sort((x, y) => y.health_pct + y.mental_health_pct - (x.health_pct + x.mental_health_pct) || x.slot_number - y.slot_number)[0];
  }

  private startPutsch(leaderMigrantId: string): void {
    const president = this.snapshot.players.find((p) => p.role_code === 'mayor_agri' && p.is_active_slot);
    const fighter = president && isFree(president, this.now) ? president : this.pickFree([]);
    if (!fighter) {
      applyDuelConsequences(this.snapshot, this.fx, this.rng('putsch'), { context: 'putsch', defenderWon: false, leaderMigrantId }, this.now);
      return;
    }
    // Le meneur est un PNJ : épreuve de la cible, jouable jusqu'à l'ouverture de l'Agora + 6 h (17:00)
    const session = nextAgoraSession(this.now);
    const agora = session.getTime() - this.now.getTime() < 12 * 3_600_000 ? session : this.now;
    this.addDuel(
      newDuelRow({
        id: this.rng('duel').uuid(),
        context: 'putsch',
        mode: 'target',
        proposalId: null,
        playerAId: fighter.id,
        playerBId: null,
        opponentMigrantId: leaderMigrantId,
        defenderSide: 'a',
        firstDeadline: new Date(agora.getTime() + constants.PUTSCH_TRIAL_HOURS_AFTER_AGORA * 3_600_000),
        now: this.now,
      }),
    );
  }

  challengeDuel(
    playerId: string,
    input: { proposalId?: string | null; targetPlayerId?: string | null; championPlayerId?: string | null; mode?: string | null },
  ): OpResult {
    const me = this.player(playerId);
    if (!me || !isFree(me, this.now)) return fail('Vous ne pouvez pas lancer de duel.');
    const mode: DuelMode = input.mode === 'target' ? 'target' : 'carlage';
    const eligible = (p: Player | undefined): p is Player =>
      p !== undefined && (mode === 'target' ? isFree(p, this.now) : canFightCarlage(p, this.now));
    const deadline =
      mode === 'target'
        ? new Date(this.now.getTime() + constants.TARGET_TRIAL_HOURS * 3_600_000)
        : new Date(this.now.getTime() + JOIN_WINDOW_SECONDS * 1000);
    const whyNot = mode === 'target' ? 'n\'est pas libre de jouer' : 'n\'est pas en état de combattre (conditions des 3 PA)';
    const youNot = mode === 'target' ? 'Vous n\'êtes pas libre de jouer' : 'Vous n\'êtes pas en état de combattre (conditions des 3 PA)';

    if (input.proposalId) {
      const idx = this.state.proposals.findIndex((p) => p.id === input.proposalId);
      const proposal = this.state.proposals[idx];
      if (!proposal || proposal.status !== 'vetoed' || !proposal.vetoed_by) return fail('Aucun veto à contester sur cette proposition.');
      if (proposal.proposer_id !== playerId) return fail('Seul le porteur de la proposition peut contester le veto.');
      if (this.state.duels.some((d) => d.proposal_id === proposal.id && d.status === 'active')) return fail('Un duel est déjà en cours pour ce veto.');
      const vetoer = this.player(proposal.vetoed_by);
      let challenger: Player | undefined = eligible(me) ? me : undefined;
      if (!challenger) {
        const champion = this.player(input.championPlayerId ?? '');
        if (!eligible(champion) || champion.id === proposal.vetoed_by) return fail(`${youNot} : désignez un champion.`);
        challenger = champion;
      }
      const context = proposal.kind === 'tribunal' ? 'tribunal' : 'veto';
      const defender = eligible(vetoer)
        ? vetoer
        : mode === 'target'
          ? this.pickFree([challenger.id, me.id, proposal.vetoed_by])
          : pickChampion(this.snapshot, this.now, [challenger.id, me.id, proposal.vetoed_by]);
      if (!defender) {
        const res = applyDuelConsequences(this.snapshot, this.fx, this.rng('forfeit'), { context, defenderWon: false, proposal }, this.now);
        if (res.proposal) this.state.proposals[idx] = res.proposal;
        return { ok: true, forfeit: true, summary: `Personne ne peut défendre le veto : ${res.summary}` };
      }
      const row = newDuelRow({
        id: this.rng('duel').uuid(),
        context,
        mode,
        proposalId: proposal.id,
        playerAId: challenger.id,
        playerBId: defender.id,
        opponentMigrantId: null,
        defenderSide: 'b',
        firstDeadline: deadline,
        now: this.now,
      });
      this.addDuel(row);
      return { ok: true, duel_id: row.id, mode };
    }

    const target = this.player(input.targetPlayerId ?? '');
    if (!target || target.id === me.id) return fail('Adversaire invalide.');
    const targetName = target.display_name;
    if (!eligible(me)) return fail(`${youNot}.`);
    if (!eligible(target)) return fail(`${targetName} ${whyNot}.`);
    const row = newDuelRow({
      id: this.rng('duel').uuid(),
      context: 'friendly',
      mode,
      proposalId: null,
      playerAId: me.id,
      playerBId: target.id,
      opponentMigrantId: null,
      defenderSide: 'b',
      firstDeadline: deadline,
      now: this.now,
    });
    this.addDuel(row);
    return { ok: true, duel_id: row.id, mode };
  }

  /** Vrai si les deux résultats de l'épreuve de la cible sont déposés (le PNJ joue d'office). */
  private targetAllIn(row: CarlageDuelRow): boolean {
    const results = this.state.targetResults.filter((r) => r.duel_id === row.id);
    return results.some((r) => r.side === 'a') && (row.opponent_migrant_id !== null || results.some((r) => r.side === 'b'));
  }

  /** Résout la manche courante (Carlage) ou l'épreuve de la cible si elle est complète ou échue. */
  resolveDuel(duelId: string, mode: 'player' | 'maintenance' = 'player'): OpResult {
    const idx = this.state.duels.findIndex((d) => d.id === duelId);
    let row = this.state.duels[idx];
    if (!row) return fail('Duel introuvable.');
    if (row.status !== 'active') return { ok: true, duel: row };
    if (row.mode === 'target') {
      row = this.resolveTargetTrial(row);
      this.state.duels[idx] = row;
      return { ok: true, duel: row };
    }
    const abandoned = mode === 'maintenance' && isAbandoned(row, this.now);
    for (let guard = 0; guard < 5 && row.status === 'active'; guard++) {
      const moves = movesForRound(this.state.moves, row.id, row.current_round);
      const npc = row.opponent_migrant_id !== null;
      const allIn = moves.a !== null && (npc || moves.b !== null);
      if (!allIn && !isRoundDue(row, this.now) && !abandoned) break;
      const state = rowToDuelState(row);
      const stats = fighterStats(this.snapshot, row);
      const rng = createRng(`${row.id}:round:${row.current_round}`);
      const bMove = npc ? npcMove(state, 'b', rng.fork('npc')) : moves.b ?? { move: null };
      const next = resolveRound(state, moves.a ?? { move: null }, bMove, stats, rng);
      row = applyDuelState(row, next, this.now);
      if (next.finished) row = this.finishCarlage(row, next, stats);
      if (!abandoned) break;
    }
    this.state.duels[idx] = row;
    return { ok: true, duel: row };
  }

  private resolveTargetTrial(row: CarlageDuelRow): CarlageDuelRow {
    const due = this.now.getTime() >= new Date(row.round_deadline_at).getTime();
    if (!this.targetAllIn(row) && !due) return row;
    const results = this.state.targetResults.filter((r) => r.duel_id === row.id);
    const tapsOf = (side: 'a' | 'b') => sanitizeTaps(results.find((r) => r.side === side)?.taps) ?? [];
    const scoreA = scoreTargetTrial(row.id, tapsOf('a'));
    const scoreB = scoreTargetTrial(row.id, row.opponent_migrant_id ? npcTargetTaps(row.id) : tapsOf('b'));
    const winner = targetWinner(scoreA.total, scoreB.total, row.defender_side);
    const finished: CarlageDuelRow = {
      ...row,
      status: 'finished',
      winner_side: winner,
      winner_id: winner === 'a' ? row.player_a_id : row.player_b_id,
      finished_at: this.now.toISOString(),
      result_json: { a: scoreA, b: scoreB },
    };
    return this.concludeDuel(
      finished,
      winner,
      `Scores : ${this.duelName(row, 'a')} ${scoreA.total} pts, ${this.duelName(row, 'b')} ${scoreB.total} pts.`,
      [],
    );
  }

  private finishCarlage(row: CarlageDuelRow, state: DuelState, stats: { a: FighterStats; b: FighterStats }): CarlageDuelRow {
    const v = this.snapshot.village;
    const injuries = rollCarlageInjuries(state, stats, createRng(`${row.id}:injuries`));
    for (const inj of injuries) {
      if (!inj.injured) continue;
      const playerId = inj.side === 'a' ? row.player_a_id : row.player_b_id;
      const p = playerId ? this.player(playerId) : undefined;
      if (p) {
        applyInjury(p, 'muscular', this.now);
        p.health_pct = Math.max(0, p.health_pct - 10);
        const fee = money(Math.min(v.carlage_injury_fee_eur, p.private_wealth_eur));
        if (fee > 0) {
          p.private_wealth_eur = money(p.private_wealth_eur - fee);
          v.treasury_eur = money(v.treasury_eur + fee);
          pushLedger(this.fx, this.snapshot, { account: 'private', player_id: p.id, amount_eur: -fee, label: 'Franchise Carlage', category: 'carlage' });
          pushLedger(this.fx, this.snapshot, { account: 'treasury', amount_eur: fee, label: `Franchise Carlage — ${p.display_name}`, category: 'carlage' });
        }
      } else if (inj.side === 'b' && row.opponent_migrant_id) {
        const m = this.snapshot.migrants.find((x) => x.id === row.opponent_migrant_id);
        if (m) m.injury_type = 'muscular';
      }
    }
    const injured = injuries.filter((i) => i.injured).map((i) => this.duelName(row, i.side));
    const winner = state.winner_side ?? row.defender_side;
    return this.concludeDuel(
      { ...row, injuries_json: injuries, result_json: { a_balance: state.a_balance, b_balance: state.b_balance } },
      winner,
      injured.length > 0 ? `Blessé(s) : ${injured.join(', ')} (Franchise Carlage due).` : '',
      injuries,
    );
  }

  /** Conséquences communes : veto, Tribunal, putsch ; annonce à La Gazette et à La Taverne. */
  private concludeDuel(row: CarlageDuelRow, winner: 'a' | 'b', details: string, injuries: unknown[]): CarlageDuelRow {
    const pIdx = row.proposal_id ? this.state.proposals.findIndex((p) => p.id === row.proposal_id) : -1;
    const res = applyDuelConsequences(
      this.snapshot,
      this.fx,
      createRng(`${row.id}:consequences`),
      {
        context: row.context,
        defenderWon: winner === row.defender_side,
        proposal: pIdx >= 0 ? this.state.proposals[pIdx] : null,
        leaderMigrantId: row.opponent_migrant_id,
      },
      this.now,
    );
    if (pIdx >= 0 && res.proposal) this.state.proposals[pIdx] = res.proposal;
    const label = row.mode === 'target' ? 'Épreuve de la cible' : 'Carlage';
    pushEvent(this.fx, this.snapshot, {
      event_type: 'carlage_result',
      title: `${label} : ${this.duelName(row, winner)} l'emporte`,
      body: `${res.summary}${details ? ` ${details}` : ''}`,
      data: { duel_id: row.id, mode: row.mode, winner_side: winner, injuries, result: row.result_json },
    });
    this.tavern.push({
      channel: 'village_square',
      content: `🏆 ${label} : ${this.duelName(row, winner)} l'emporte. ${res.summary}${details ? ` ${details}` : ''}`.slice(0, 1990),
    });
    this.refresh();
    return row;
  }

  /** Maintenance : épreuves échues ou complètes, manches de Carlage échues (joueurs absents). */
  expireDuels(): number {
    let n = 0;
    for (const d of [...this.state.duels]) {
      if (d.status !== 'active') continue;
      const due =
        d.mode === 'target'
          ? this.targetAllIn(d) || this.now.getTime() >= new Date(d.round_deadline_at).getTime()
          : isRoundDue(d, this.now);
      if (due) {
        this.resolveDuel(d.id, 'maintenance');
        n += 1;
      }
    }
    return n;
  }

  /** Le pôle Défense / Sécurité Intérieure réprime le putsch avant le duel [GDD §4.3]. */
  repressPutsch(playerId: string, duelId: string): OpResult {
    const me = this.player(playerId);
    const act = this.snapshot.village.act_number;
    const allowed = me?.ministerial_portfolios.some((p) => (p === 'defense' || p === 'interior') && portfolioUnlocked(act, p));
    if (!me || !allowed || !isFree(me, this.now)) return fail('Seul le pôle Défense ou Sécurité Intérieure peut réprimer un putsch.');
    if (me.action_points < 1) return fail('Points d\'Action insuffisants.');
    const idx = this.state.duels.findIndex((d) => d.id === duelId);
    const row = this.state.duels[idx];
    if (!row || row.context !== 'putsch' || row.status !== 'active') return fail('Aucun putsch en cours.');
    me.action_points -= 1;
    const leader = this.snapshot.migrants.find((m) => m.id === row.opponent_migrant_id);
    if (leader) leader.is_detained_until = addHours(this.now, 24).toISOString();
    const v = this.snapshot.village;
    v.left_wing_ideology_pct = gauge(v.left_wing_ideology_pct - 3);
    v.insecurity_offset = Math.round((v.insecurity_offset - 5) * 100) / 100;
    this.state.duels[idx] = { ...row, status: 'cancelled', finished_at: this.now.toISOString() };
    pushEvent(this.fx, this.snapshot, {
      event_type: 'putsch_repressed',
      title: 'Putsch réprimé',
      body: `${me.display_name} fait encercler la Plaça del Poble : ${leader?.full_name ?? 'le meneur'} passe 24 h au cachot.`,
    });
    this.tavern.push({ channel: 'agora_hall', content: `🛡️ Putsch réprimé par ${me.display_name}.` });
    this.refresh();
    return { ok: true };
  }

  // -------------------------------------------------------------------------
  // Monde réel, Gazette, migrants, tentations (daily-world-sync)
  // -------------------------------------------------------------------------
  /** Monde réel de la nuit ; `quotes` = cours des ETF du fonds souverain (V6.2), absent = derniers cours gardés. */
  applyWorld(weather: WeatherSnapshot | null, headlines: string[], quotes: unknown = null): void {
    const v = this.snapshot.village;
    if (quotes) applyMarketQuotes(this.snapshot, quotes, dayKey(this.now));
    if (weather) {
      v.real_weather_summary = weather.summary;
      v.real_temp_c = weather.temp_max_c;
      v.real_temp_min_c = weather.temp_min_c;
      v.real_precip_mm = weather.precip_mm;
      v.real_snow_cm = weather.snow_cm;
    }
    if (headlines.length > 0) {
      this.news = headlines;
      v.real_news_headline = headlines[0] ?? v.real_news_headline;
    }
  }

  publishScandals(): string[] {
    return publishScandals(this.snapshot, this.fx).map((t) => {
      const p = this.player(t.player_id);
      return `${p?.display_name ?? 'Un habitant'} : ${t.title}`;
    });
  }

  async writeGazette(date: string, scandals: string[]): Promise<GazetteDraft> {
    const seen = new Set<string>();
    const events: { title: string; body: string }[] = [];
    const candidates = [
      ...this.state.recentEvents.map((e) => ({ title: e.title, body: e.body })),
      ...this.fx.events.filter((e) => e.visibility === 'public').map((e) => ({ title: e.title, body: e.body })),
    ];
    for (const e of candidates) {
      const key = `${e.title}|${e.body}`;
      if (seen.has(key) || e.title === 'Action') continue;
      seen.add(key);
      events.push(e);
    }
    const g = await this.gm.run({ kind: 'gazette', date, events: events.slice(-20), scandals }, this.gmContext(null));
    this.aiCalls.push(g.aiCall);
    const applied = applyAiDeltas(this.snapshot, g.response.deltas, `La Gazette du ${date}`, this.now);
    this.absorb(applied);
    const v = this.snapshot.village;
    const draft: GazetteDraft = {
      edition_date: date,
      headline: g.response.gazette_headline || 'La Gazette du hameau',
      body_markdown: g.response.narrative_text,
      sections: [
        // Bilan de la semaine (V6.0) : publié dans la Gazette de la nuit du dimanche au lundi
        { title: 'Bilan de la semaine', items: events.filter((e) => e.title.startsWith(WEEK_PREFIX)).slice(-1).flatMap((e) => [e.title.slice(WEEK_PREFIX.length).replace(/^./, (c) => c.toUpperCase()), e.body]) },
        { title: 'Faits du jour', items: events.slice(-12).map((e) => e.title) },
        // Petite histoire des résidents (V5.7) : écrite par le moteur, publiée même sans IA
        { title: 'Petite histoire du hameau', items: events.filter((e) => e.title.startsWith(STORY_PREFIX)).slice(-1).map((e) => `${e.title.slice(STORY_PREFIX.length)} — ${e.body}`) },
        // Relations avec les voisins (V5.8) : demandes ouvertes, remplies ou manquées
        { title: 'Chez les voisins', items: events.filter((e) => e.title.startsWith(NEIGHBOR_PREFIX)).slice(-2).map((e) => `${e.title.slice(NEIGHBOR_PREFIX.length).replace(/^./, (c) => c.toUpperCase())} — ${e.body}`) },
        // Visiteurs imprévus (V5.9) : arrivées, réponses, visites ignorées
        { title: 'Visiteurs de passage', items: events.filter((e) => e.title.startsWith(VISITOR_PREFIX)).slice(-2).map((e) => `${e.title.slice(VISITOR_PREFIX.length).replace(/^./, (c) => c.toUpperCase())} — ${e.body}`) },
        { title: 'Météo réelle', items: [v.real_weather_summary] },
        { title: 'Actualité réelle', items: this.news.slice(0, 5) },
        { title: 'Scandales', items: scandals },
      ].filter((s) => s.items.length > 0),
      generated_by: g.usedFallback ? 'fallback' : 'ai',
    };
    this.gazette.push(draft);
    this.tavern.push({ channel: 'village_square', content: `📰 La Gazette du ${date} : ${draft.headline}` });
    return draft;
  }

  async generateMigrants(count: number): Promise<string[]> {
    const created: string[] = [];
    for (let i = 0; i < count; i++) {
      const g = await this.gm.run({ kind: 'migrant', index: i }, this.gmContext(null));
      this.aiCalls.push(g.aiCall);
      const draft = g.response.new_migrant_candidate;
      if (!draft) continue;
      const rng = this.rng(`migrant:${i}`);
      const m = createCandidate(this.snapshot, draft, rng, this.now, g.usedFallback ? 'fallback' : 'ai');
      const proposal = { id: rng.uuid(), ...admissionProposalDraft(this.snapshot, m, this.now) } as AgoraProposal;
      m.admission_proposal_id = proposal.id;
      this.state.proposals.push(proposal);
      pushEvent(this.fx, this.snapshot, {
        event_type: 'migrant_candidate',
        title: 'Nouveau dossier au Bureau de l\'Immigration',
        body: `${m.full_name}, ${m.age} ans (${m.origin}) se présente sur la piste forestière.`,
        data: { migrant_id: m.id, proposal_id: proposal.id },
      });
      this.tavern.push({ channel: 'agora_hall', content: `🧳 Nouveau dossier : ${m.full_name}, ${m.age} ans (${m.origin}). Vote dimanche à l'Agora.` });
      created.push(m.id);
    }
    return created;
  }

  async generateTemptations(chancePct: number): Promise<string[]> {
    const created: string[] = [];
    for (const p of this.snapshot.players) {
      if (!isFree(p, this.now)) continue;
      if (this.snapshot.temptations.some((t) => t.player_id === p.id && t.choice === 'pending')) continue;
      if (!this.rng(`temptation:${p.id}`).chance(chancePct)) continue;
      const id = await this.offerTemptation(p.id);
      if (id) created.push(id);
    }
    return created;
  }

  /** Soumet un dilemme privé à un joueur (nuit, ou à la demande de l'administrateur). */
  async offerTemptation(playerId: string): Promise<string | null> {
    const p = this.player(playerId);
    if (!p || !isFree(p, this.now)) return null;
    const brief = this.brief(p.id);
    const recent = this.temptationHistory(p.id);
    const theme = pickTemptationTheme(this.rng(`temptation-theme:${p.id}`), brief, recent, temptationConditions(this.snapshot.village));
    const g = await this.gm.run({ kind: 'temptation', player: brief, recent, theme }, this.gmContext(brief), p.id);
    this.aiCalls.push(g.aiCall);
    const t = g.response.private_temptation;
    if (!t) return null;
    const temptation = createTemptation(
      this.snapshot,
      p.id,
      { category: t.category, title: t.title, prompt_text: t.prompt_text, yield_effects: t.yield_effects, resist_effects: t.resist_effects },
      this.rng(`temptation-id:${p.id}`),
      this.now,
      g.usedFallback ? 'fallback' : 'ai',
    );
    pushEvent(this.fx, this.snapshot, {
      event_type: 'temptation_offered',
      visibility: 'private',
      player_id: p.id,
      title: 'Une tentation vous attend',
      body: temptation.title,
      data: { temptation_id: temptation.id },
    });
    return temptation.id;
  }

  /**
   * Dilemmes déjà reçus par un joueur, du plus récent au plus ancien : historique chargé par
   * runtime/ (tous statuts) + dilemmes de l'instantané (dont ceux créés pendant cette session).
   */
  temptationHistory(playerId: string): RecentTemptation[] {
    const rows = new Map<string, { title: string; category: string; prompt_text: string | null; created_at: string }>();
    for (const t of [...(this.state.recentTemptations ?? []), ...this.snapshot.temptations]) {
      if (t.player_id === playerId && !rows.has(t.id)) rows.set(t.id, t);
    }
    return [...rows.values()]
      .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))
      .slice(0, constants.TEMPTATION_NO_REPEAT_WINDOW)
      .map((t) => ({ title: t.title, category: t.category, prompt_text: t.prompt_text, created_at: t.created_at }));
  }

  // -------------------------------------------------------------------------
  // Contexte IA, indicateurs cachés, écriture
  // -------------------------------------------------------------------------
  brief(playerId: string): PlayerBrief {
    const p = this.player(playerId);
    if (!p) throw new Error('Joueur introuvable');
    return {
      id: p.id,
      display_name: p.display_name,
      character_name: p.character_name,
      role_code: p.role_code,
      role_title: p.role_title,
      ministerial_portfolios: p.ministerial_portfolios,
      action_points: p.action_points,
      health_pct: p.health_pct,
      mental_health_pct: p.mental_health_pct,
      addiction_level_pct: p.addiction_level_pct,
      private_wealth_eur: p.private_wealth_eur,
    };
  }

  gmContext(player: PlayerBrief | null): GmContext {
    const v = this.snapshot.village;
    return {
      village: v as unknown as Record<string, unknown>,
      residents: this.snapshot.migrants
        .filter((m) => m.status === 'accepted' || m.status === 'forced_labor' || m.status === 'candidate')
        .map((m) => ({
          nom: m.full_name,
          age: m.age,
          origine: m.origin,
          religion: m.religion,
          sensibilite: m.political_leaning,
          specialite: `${m.specialty_code} ${m.specialty_level}`,
          enfants: m.children_count,
          statut: m.status,
          naturalise: m.is_naturalized,
        })),
      childrenCount: this.snapshot.children.filter((c) => c.status !== 'departed').length,
      openProposals: this.state.proposals.filter((p) => p.status === 'open').map((p) => ({ title: p.title, kind: p.kind, closes_at: p.closes_at })),
      chat: this.state.chat.map((c) => ({ sender: c.sender, content: c.content })),
      weather: v.real_weather_summary,
      news: this.news.length > 0 ? this.news : v.real_news_headline ? [v.real_news_headline] : [],
      player,
    };
  }

  hiddenRows(): HiddenIndicatorRow[] {
    const computedAt = this.now.toISOString();
    return Object.entries(computeHiddenIndicators(this.snapshot, this.now)).map(([role_code, payload]) => ({ role_code, payload, computed_at: computedAt }));
  }

  private extras() {
    return { fx: this.fx, tavern: this.tavern, gazette: this.gazette, aiCalls: this.aiCalls, hidden: this.hiddenRows() };
  }

  commitPayload(): CommitPayload {
    return buildCommitPayload(this.initial, this.state, this.extras());
  }

  isTrivial(): boolean {
    return isTrivialChange(this.initial, this.state, this.extras());
  }

  /** Événements de la requête visibles par un joueur (public, privés, de son rôle / portefeuilles). */
  visibleEvents(playerId: string | null): EngineEvent[] {
    const p = playerId ? this.player(playerId) : undefined;
    const roles = new Set<string>(p ? [p.role_code, ...p.ministerial_portfolios.map((x) => `portfolio:${x}`)] : []);
    return this.fx.events.filter(
      (e) => e.visibility === 'public' || (e.visibility === 'private' && e.player_id === playerId) || (e.visibility === 'role' && roles.has(e.role_code ?? '')),
    );
  }
}
