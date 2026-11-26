/**
 * Pipeline commun : charger l'état → écoulement du temps → maintenance de l'Agora → opération →
 * indicateurs cachés → écriture atomique (engine_commit). En cas de conflit de révision
 * (deux joueurs agissent au même instant), tout est recalculé sur l'état frais (3 essais) ;
 * les réponses de l'IA sont mémorisées et ne sont pas refacturées.
 */
import type { GmPort } from '../core/gm/runner.ts';
import { GameSession, type OpResult } from '../core/session.ts';
import { commitChanges, loadGameState, RevisionConflict, type Db } from './db.ts';

export interface PipelineDeps {
  db: Db;
  gm: GmPort;
  clock: () => Date;
}

export interface RunOptions {
  /** N'écrit rien si seules les grandeurs dérivées ont changé (tick, maintenance). */
  skipIfTrivial?: boolean;
  attempts?: number;
  /** Charge l'historique des dilemmes (opérations qui proposent des tentations). */
  temptationHistory?: boolean;
}

export interface RunOutcome<T extends OpResult> {
  result: T;
  revision: number;
  session: GameSession;
  committed: boolean;
}

export async function runGame<T extends OpResult>(
  deps: PipelineDeps,
  operation: (session: GameSession) => Promise<T> | T,
  options: RunOptions = {},
): Promise<RunOutcome<T>> {
  const attempts = options.attempts ?? 3;
  for (let attempt = 1; ; attempt++) {
    const now = deps.clock();
    const state = await loadGameState(deps.db, now, { temptationHistory: options.temptationHistory });
    const session = new GameSession(state, { now, gm: deps.gm });
    session.tick();
    await session.maintainAgora();
    const result = await operation(session);
    const revision = state.snapshot.village.revision;
    if ((options.skipIfTrivial || !result.ok) && session.isTrivial()) {
      return { result, revision, session, committed: false };
    }
    try {
      const newRevision = await commitChanges(deps.db, revision, session.commitPayload());
      return { result, revision: newRevision, session, committed: true };
    } catch (err) {
      if (err instanceof RevisionConflict && attempt < attempts) continue;
      throw err;
    }
  }
}
