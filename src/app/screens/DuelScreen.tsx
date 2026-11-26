/** Arène des duels : Carlage 2×2 en direct, ou épreuve de la cible en différé. */
import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent } from 'react';
import { adjacentCells, constants, scoreTargetTrial, targetSequence, type Cell, type RoundLog, type TargetTap, type TargetTrialScore } from '../engine.ts';
import type { DuelRow } from '../api/types.ts';
import { Avatar, Badge, Button, Card, Empty, SectionTitle, cx } from '../components/ui.tsx';
import { countdown, dateTime } from '../lib/format.ts';
import { CARLAGE_MOVE, DUEL_CONTEXT, DUEL_MODE } from '../lib/labels.ts';
import { navigate } from '../lib/router.ts';
import { useData, useGame, useNow } from '../state/GameContext.tsx';

/** Délai de grâce serveur après l'échéance d'une manche (supabase/functions/_shared/core/duel.ts). */
const GRACE_MS = 2_500;
const CELLS: Cell[] = ['TL', 'TR', 'BL', 'BR'];

/** Le moteur raconte avec « A » et « B » : on remet les prénoms. */
function narrate(text: string, names: { a: string; b: string }): string {
  return text.replace(/\b([AB])\b/g, (_, side: string) => (side === 'A' ? names.a : names.b));
}

type Side = 'a' | 'b';

function useFighters(duel: DuelRow) {
  const data = useData();
  return useMemo(() => {
    const player = (id: string | null) => data.players.find((p) => p.id === id);
    const migrant = data.migrants.find((m) => m.id === duel.opponent_migrant_id);
    const a = player(duel.player_a_id);
    const b = player(duel.player_b_id);
    return {
      a: { name: a?.display_name ?? '?', emoji: a?.avatar_emoji ?? '🛡️', color: a?.avatar_color ?? '#8b5a2b' },
      b: b
        ? { name: b.display_name, emoji: b.avatar_emoji, color: b.avatar_color }
        : { name: migrant?.full_name ?? 'Le meneur', emoji: '🏴', color: '#6b2d2d' },
    };
  }, [data.players, data.migrants, duel]);
}

/** Lance la résolution côté serveur une seule fois par échéance. */
function useAutoResolve(duel: DuelRow, enabled: boolean, dueAt: number) {
  const { api, refresh } = useGame();
  const now = useNow(500);
  const attempted = useRef<string | null>(null);
  const key = `${duel.id}:${duel.current_round}:${duel.round_deadline_at}`;
  useEffect(() => {
    if (!enabled || duel.status !== 'active' || now.getTime() < dueAt || attempted.current === key) return;
    attempted.current = key;
    void api
      .resolveDuel(duel.id)
      .catch(() => undefined)
      .then(() => refresh());
  }, [api, refresh, enabled, duel.status, duel.id, now, dueAt, key]);
}

// ---------------------------------------------------------------------------
// Épreuve de la cible
// ---------------------------------------------------------------------------

type Feedback = { text: string; tone: 'good' | 'bad' | 'neutral' } | null;

function storageKey(key: string) {
  return `les-gaulois-target:${key}`;
}
function readStored(key: string): TargetTap[] | null {
  try {
    const raw = localStorage.getItem(storageKey(key));
    return raw ? (JSON.parse(raw) as TargetTap[]) : null;
  } catch {
    return null;
  }
}
function writeStored(key: string, taps: TargetTap[] | null) {
  try {
    if (taps) localStorage.setItem(storageKey(key), JSON.stringify(taps));
    else localStorage.removeItem(storageKey(key));
  } catch {
    /* stockage indisponible : l'épreuve reste jouable */
  }
}

function TargetArena({ duel, storeKey, onFinished }: { duel: DuelRow; storeKey: string; onFinished: (taps: TargetTap[]) => void }) {
  const seq = useMemo(() => targetSequence(duel.id), [duel.id]);
  const arena = useRef<HTMLDivElement>(null);
  const taps = useRef<TargetTap[]>([]);
  const timers = useRef<number[]>([]);
  const expectedAt = useRef(0);
  const shownAt = useRef<number | null>(null);
  const locked = useRef(true);
  const [index, setIndex] = useState(0);
  const [visible, setVisible] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [marks, setMarks] = useState<{ x: number; y: number }[]>([]);
  // Le parent se re-rend chaque seconde (comptes à rebours) : le rappel est lu via une référence
  // pour que la séquence ne redémarre jamais en cours d'épreuve.
  const finish = useRef(onFinished);
  useEffect(() => {
    finish.current = onFinished;
  }, [onFinished]);

  const clearTimers = () => {
    timers.current.forEach((t) => window.clearTimeout(t));
    timers.current = [];
  };

  const start = useCallback(
    (i: number) => {
      clearTimers();
      if (i >= seq.length) {
        locked.current = true;
        finish.current(taps.current);
        return;
      }
      setIndex(i);
      setVisible(false);
      shownAt.current = null;
      locked.current = false;
      expectedAt.current = performance.now() + seq[i]!.delay_ms;
      timers.current.push(
        window.setTimeout(() => {
          shownAt.current = performance.now();
          setVisible(true);
          timers.current.push(
            window.setTimeout(() => {
              locked.current = true;
              setVisible(false);
              setFeedback({ text: 'Trop tard !', tone: 'bad' });
              timers.current.push(window.setTimeout(() => start(i + 1), 700));
            }, constants.TARGET_TIMEOUT_MS),
          );
        }, seq[i]!.delay_ms),
      );
    },
    [seq],
  );

  useEffect(() => {
    const t = window.setTimeout(() => start(0), 600);
    return () => {
      window.clearTimeout(t);
      clearTimers();
    };
  }, [start]);

  const onTap = (e: PointerEvent<HTMLDivElement>) => {
    if (locked.current || !arena.current) return;
    e.preventDefault();
    const now = performance.now();
    const rect = arena.current.getBoundingClientRect();
    const x = Math.round(((e.clientX - rect.left) / rect.width) * 1000) / 1000;
    const y = Math.round(((e.clientY - rect.top) / rect.height) * 1000) / 1000;
    const reaction = Math.round(now - (shownAt.current ?? expectedAt.current));
    locked.current = true;
    clearTimers();
    taps.current = [...taps.current, { index, x, y, reaction_ms: reaction }];
    writeStored(storeKey, taps.current);
    setMarks((m) => [...m, { x, y }]);
    setVisible(false);
    if (shownAt.current === null || reaction < constants.TARGET_FALSE_START_MS) {
      setFeedback({ text: 'Faux départ !', tone: 'bad' });
    } else {
      const target = seq[index]!;
      const d = Math.hypot(x - target.x, y - target.y);
      setFeedback(
        d <= target.radius * 0.4
          ? { text: `Dans le mille ! ${reaction} ms`, tone: 'good' }
          : d <= target.radius
            ? { text: `Touché · ${reaction} ms`, tone: 'good' }
            : { text: `À côté · ${reaction} ms`, tone: 'neutral' },
      );
    }
    timers.current.push(window.setTimeout(() => start(index + 1), 700));
  };

  const target = seq[index]!;
  return (
    <div>
      <div className="mb-2 flex items-center justify-between text-sm">
        <span className="font-semibold">
          Cible {Math.min(index + 1, seq.length)} / {seq.length}
        </span>
        <span className={cx('font-semibold', feedback?.tone === 'good' ? 'text-moss-700' : feedback?.tone === 'bad' ? 'text-ember-600' : 'text-ink-soft')}>
          {feedback?.text ?? 'Attendez la cible…'}
        </span>
      </div>
      <div
        ref={arena}
        onPointerDown={onTap}
        className="relative mx-auto aspect-square w-full max-w-md touch-none select-none overflow-hidden rounded-2xl border-4 border-wood-700 bg-[radial-gradient(circle_at_50%_50%,#e9dcc0,#cdb68a)]"
      >
        {marks.map((m, i) => (
          <span key={i} className="absolute h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-ink/40" style={{ left: `${m.x * 100}%`, top: `${m.y * 100}%` }} />
        ))}
        {visible && (
          <span
            className="target-pop absolute -translate-x-1/2 -translate-y-1/2 rounded-full border-4 border-white bg-[radial-gradient(circle,#b91c1c_0_18%,#fff_19%_38%,#b91c1c_39%_58%,#fff_59%_78%,#b91c1c_79%)] shadow-lg"
            style={{ left: `${target.x * 100}%`, top: `${target.y * 100}%`, width: `${target.radius * 200}%`, height: `${target.radius * 200}%` }}
          />
        )}
      </div>
    </div>
  );
}

function ScoreTable({ score, title }: { score: TargetTrialScore; title: string }) {
  const foul = { false_start: 'faux départ', too_late: 'trop tard', missing: 'manquée' } as const;
  return (
    <div>
      <p className="mb-1 text-sm font-semibold">
        {title} — <span className="font-serif text-lg">{score.total} pts</span>
      </p>
      <table className="w-full text-xs tabular-nums">
        <thead className="text-ink-soft">
          <tr>
            <th className="text-left font-normal">Cible</th>
            <th className="text-right font-normal">Écart</th>
            <th className="text-right font-normal">Réaction</th>
            <th className="text-right font-normal">Points</th>
          </tr>
        </thead>
        <tbody>
          {score.lines.map((l) => (
            <tr key={l.index} className="border-t border-parchment-200">
              <td>#{l.index + 1}</td>
              <td className="text-right">{l.foul === 'missing' ? '—' : `${Math.round(l.distance * 100)} %`}</td>
              <td className="text-right">{l.reaction_ms === null ? '—' : `${l.reaction_ms} ms`}</td>
              <td className="text-right font-semibold">{l.foul ? <span className="text-ember-600">{foul[l.foul]}</span> : l.points}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TargetDuel({ duel, mySide }: { duel: DuelRow; mySide: Side | null }) {
  const data = useData();
  const { api, perform, toast } = useGame();
  const now = useNow(1000);
  const [phase, setPhase] = useState<'intro' | 'playing' | 'sending' | 'sent'>('intro');
  const [local, setLocal] = useState<TargetTrialScore | null>(null);
  const submitted = mySide !== null && data.targetResults.some((r) => r.duel_id === duel.id && r.side === mySide);
  // Clé par joueur : plusieurs personnages peuvent partager le même appareil.
  const storeKey = `${duel.id}:${data.me.id}`;
  const deadline = new Date(duel.round_deadline_at).getTime();
  useAutoResolve(duel, mySide !== null && (submitted || phase === 'sent'), deadline);

  const submit = useCallback(
    async (taps: TargetTap[], partial: boolean) => {
      setPhase('sending');
      setLocal(scoreTargetTrial(duel.id, taps));
      const r = await perform(() => api.submitTargetTaps(duel.id, taps), partial ? 'Épreuve interrompue : votre résultat partiel est envoyé.' : 'Résultat envoyé.');
      writeStored(storeKey, null);
      setPhase('sent');
      if (r?.both_submitted) await perform(() => api.resolveDuel(duel.id));
    },
    [api, perform, duel.id, storeKey],
  );

  // Une épreuve commencée puis quittée (rechargement, fermeture) est envoyée telle quelle : pas de seconde chance.
  useEffect(() => {
    if (mySide && !submitted && phase === 'intro' && duel.status === 'active') {
      const stored = readStored(storeKey);
      if (stored) void submit(stored, true);
    }
  }, [mySide, submitted, phase, duel.status, storeKey, submit]);

  if (duel.status !== 'active') return null;
  if (!mySide) {
    return (
      <Card>
        <p className="text-sm">Les deux adversaires jouent chacun de leur côté avant le {dateTime(duel.round_deadline_at)}. Résultat dès que les deux ont joué, ou à l'échéance.</p>
      </Card>
    );
  }
  if (submitted || phase === 'sent' || phase === 'sending') {
    return (
      <Card tone="moss">
        <p className="text-sm font-semibold">Votre épreuve est jouée.</p>
        {local && (
          <div className="mt-2">
            <ScoreTable score={local} title="Votre score" />
          </div>
        )}
        <p className="mt-2 text-sm text-ink-soft">En attente de l'adversaire (au plus tard {dateTime(duel.round_deadline_at)}, dans {countdown(duel.round_deadline_at, now)}).</p>
      </Card>
    );
  }
  if (phase === 'playing') {
    return (
      <Card>
        <TargetArena duel={duel} storeKey={storeKey} onFinished={(taps) => void submit(taps, false)} />
      </Card>
    );
  }
  return (
    <Card title="Épreuve de la cible" subtitle={`À jouer avant le ${dateTime(duel.round_deadline_at)} (${countdown(duel.round_deadline_at, now)})`}>
      <ul className="mb-3 list-disc space-y-1 pl-5 text-sm">
        <li>5 cibles apparaissent l'une après l'autre, après un délai aléatoire.</li>
        <li>Tapez le plus près possible du centre et le plus vite possible : 50 % précision, 50 % rapidité.</li>
        <li>Taper avant l'apparition = faux départ (0 point). Plus de 3 s = cible manquée.</li>
        <li>Une seule tentative : quitter l'écran en cours de route envoie votre score partiel.</li>
      </ul>
      <Button
        size="lg"
        className="w-full"
        onClick={() => {
          writeStored(storeKey, []);
          setPhase('playing');
          toast('info', 'Concentrez-vous…');
        }}
      >
        🎯 Je suis prêt
      </Button>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Carlage 2×2
// ---------------------------------------------------------------------------

function Balance({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div>
      <div className="flex justify-between text-xs">
        <span className="font-semibold">{label}</span>
        <span className="tabular-nums">{Math.max(0, Math.round(value))} / {constants.CARLAGE_START_BALANCE}</span>
      </div>
      <div className="h-2.5 overflow-hidden rounded-full bg-parchment-200">
        <div className="h-full rounded-full transition-all duration-700" style={{ width: `${Math.max(0, Math.min(100, (value / constants.CARLAGE_START_BALANCE) * 100))}%`, background: color }} />
      </div>
    </div>
  );
}

function RoundLine({ log, names }: { log: RoundLog; names: { a: string; b: string } }) {
  return (
    <li className="rounded-xl bg-parchment-100 px-3 py-2 text-sm">
      <p className="text-xs font-semibold text-wood-700">
        Manche {log.round} · {names.a} : {CARLAGE_MOVE[log.a_move]}
        {log.a_slip ? ' (glissade)' : ''} — {names.b} : {CARLAGE_MOVE[log.b_move]}
        {log.b_slip ? ' (glissade)' : ''}
      </p>
      <p>{narrate(log.narrative, names)}</p>
    </li>
  );
}

function CarlageDuel({ duel, mySide }: { duel: DuelRow; mySide: Side | null }) {
  const data = useData();
  const { api, perform } = useGame();
  const now = useNow(250);
  const fighters = useFighters(duel);
  const [pivoting, setPivoting] = useState(false);
  const myMove = mySide ? data.moves.find((m) => m.duel_id === duel.id && m.round === duel.current_round && m.side === mySide) : undefined;
  const deadline = new Date(duel.round_deadline_at).getTime();
  const remaining = Math.max(0, Math.ceil((deadline - now.getTime()) / 1000));
  const firstRound = duel.current_round === 1 && duel.round_log.length === 0;
  useAutoResolve(duel, mySide !== null, deadline + GRACE_MS);

  const ownCell = mySide === 'a' ? duel.player_a_pos : duel.player_b_pos;
  const otherCell = mySide === 'a' ? duel.player_b_pos : duel.player_a_pos;
  const pivotTargets = mySide ? adjacentCells(ownCell).filter((c) => c !== otherCell) : [];

  const play = async (move: string, pivot: Cell | null = null) => {
    setPivoting(false);
    const r = await perform(() => api.submitMove(duel.id, move, pivot), `Coup joué : ${CARLAGE_MOVE[move]}.`);
    if (r?.both_submitted) await perform(() => api.resolveDuel(duel.id));
  };

  const last = duel.round_log[duel.round_log.length - 1];
  return (
    <div className="space-y-3">
      <Card>
        <div className="mb-3 grid grid-cols-2 gap-3">
          <Balance label={fighters.a.name} value={duel.player_a_balance} color={fighters.a.color} />
          <Balance label={fighters.b.name} value={duel.player_b_balance} color={fighters.b.color} />
        </div>
        {duel.status === 'active' && (
          <p className="mb-3 text-center text-sm">
            Manche <strong>{duel.current_round}</strong> / {constants.CARLAGE_ROUNDS} ·{' '}
            <span className={cx('font-semibold tabular-nums', remaining <= 3 ? 'text-ember-600' : 'text-wood-700')}>{remaining} s</span>
            {firstRound && <span className="block text-xs text-ink-soft">Première manche : 2 minutes pour rejoindre l'arène.</span>}
          </p>
        )}
        <div className="mx-auto grid aspect-square w-full max-w-xs grid-cols-2 gap-2 rounded-2xl bg-stone-wall p-2 shadow-inner">
          {CELLS.map((cell) => {
            const hasA = duel.player_a_pos === cell;
            const hasB = duel.player_b_pos === cell;
            const target = pivoting && pivotTargets.includes(cell);
            return (
              <button
                key={cell}
                disabled={!target}
                onClick={() => void play('pivot', cell)}
                className={cx(
                  'flex items-center justify-center gap-1 rounded-xl border-2 text-3xl transition',
                  target ? 'animate-pulse border-gold-500 bg-gold-100' : 'border-wood-700/40 bg-parchment-200',
                )}
              >
                {hasA && <Avatar emoji={fighters.a.emoji} color={fighters.a.color} size="lg" />}
                {hasB && <Avatar emoji={fighters.b.emoji} color={fighters.b.color} size="lg" />}
              </button>
            );
          })}
        </div>
        {last && (
          <p className="mt-3 rounded-xl bg-gold-100 px-3 py-2 text-center text-sm">
            <strong>Manche {last.round} :</strong> {narrate(last.narrative, { a: fighters.a.name, b: fighters.b.name })}
          </p>
        )}
      </Card>

      {duel.status === 'active' && mySide && (
        <Card title={myMove ? `Coup envoyé : ${CARLAGE_MOVE[myMove.move]}` : 'Votre coup'} subtitle={myMove ? "En attente de l'adversaire ou de la fin de la manche." : 'Coups secrets, révélés simultanément.'}>
          {!myMove && (
            <div className="grid grid-cols-2 gap-2">
              <Button onClick={() => void play('push')}>💪 Pousser</Button>
              <Button variant="secondary" disabled={pivotTargets.length === 0} onClick={() => setPivoting(!pivoting)}>
                🔄 {pivoting ? 'Choisir un carreau…' : 'Pivoter'}
              </Button>
              <Button variant="moss" onClick={() => void play('anchor')}>
                ⚓ Ancrer
              </Button>
              <Button variant="danger" onClick={() => void play('shoulder')}>
                🐂 Épaule
              </Button>
            </div>
          )}
          <ul className="mt-3 space-y-0.5 text-xs text-ink-soft">
            <li>Pousser contre Pivoter : poussée dans le vide (−30). Pousser contre Ancrer : contre-poussée (−20 pour qui pousse).</li>
            <li>L'Épaule projette hors du carré qui pousse ou s'ancre… sauf si elle glisse (35 %). Pivoter l'esquive (−30 pour l'épaule).</li>
            <li>Ancrer récupère +10 d'équilibre. Aucun coup avant la fin du chrono = figé, sans défense.</li>
          </ul>
        </Card>
      )}
      {duel.status === 'active' && !mySide && <Card>Vous regardez le duel en direct.</Card>}

      {duel.round_log.length > 0 && (
        <>
          <SectionTitle>Déroulé</SectionTitle>
          <ul className="space-y-2">
            {[...duel.round_log].reverse().map((l) => (
              <RoundLine key={l.round} log={l} names={{ a: fighters.a.name, b: fighters.b.name }} />
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Écran
// ---------------------------------------------------------------------------

function Result({ duel }: { duel: DuelRow }) {
  const fighters = useFighters(duel);
  const winner = duel.winner_side === 'a' ? fighters.a : duel.winner_side === 'b' ? fighters.b : null;
  const result = duel.result_json as { a?: TargetTrialScore; b?: TargetTrialScore } | null;
  const injuries = (Array.isArray(duel.injuries_json) ? duel.injuries_json : []) as { side: Side; injured: boolean }[];
  return (
    <Card tone="moss">
      <p className="text-center text-4xl">🏆</p>
      <p className="text-center font-serif text-xl">{winner ? `${winner.name} l'emporte` : 'Duel annulé'}</p>
      {duel.finished_at && <p className="mb-3 text-center text-xs text-ink-soft">{dateTime(duel.finished_at)}</p>}
      {duel.mode === 'target' && result?.a && result.b && (
        <div className="grid gap-4 sm:grid-cols-2">
          <ScoreTable score={result.a} title={fighters.a.name} />
          <ScoreTable score={result.b} title={fighters.b.name} />
        </div>
      )}
      {injuries.filter((i) => i.injured).map((i) => (
        <p key={i.side} className="mt-2 text-sm text-ember-600">
          🩹 {i.side === 'a' ? fighters.a.name : fighters.b.name} se blesse (Franchise Carlage due).
        </p>
      ))}
    </Card>
  );
}

export function DuelScreen({ duelId }: { duelId: string | null }) {
  const data = useData();
  const { api, perform } = useGame();
  const duel = data.duels.find((d) => d.id === duelId);
  if (!duel) {
    return (
      <div className="space-y-3">
        <Empty>Ce duel est introuvable (terminé depuis longtemps ou annulé).</Empty>
        <Button variant="secondary" className="w-full" onClick={() => navigate('agora')}>
          Retour à l'Agora
        </Button>
      </div>
    );
  }
  return <DuelView duel={duel} me={data.me.id} onRepress={() => void perform(() => api.repressPutsch(duel.id), 'Putsch réprimé.')} canRepress={duel.context === 'putsch' && data.me.ministerial_portfolios.some((p) => p === 'defense' || p === 'interior') && data.village.act_number >= 2} />;
}

function DuelView({ duel, me, onRepress, canRepress }: { duel: DuelRow; me: string; onRepress: () => void; canRepress: boolean }) {
  const fighters = useFighters(duel);
  const mySide: Side | null = duel.player_a_id === me ? 'a' : duel.player_b_id === me ? 'b' : null;
  return (
    <div className="space-y-3">
      <button className="text-sm font-semibold text-wood-600" onClick={() => navigate('agora')}>
        ← Agora
      </button>
      <Card>
        <div className="mb-2 flex flex-wrap gap-1.5">
          <Badge tone="wood">{DUEL_MODE[duel.mode]}</Badge>
          <Badge>{DUEL_CONTEXT[duel.context]}</Badge>
          {duel.status === 'active' ? <Badge tone="gold">En cours</Badge> : <Badge tone="moss">Terminé</Badge>}
        </div>
        <div className="flex items-center justify-around gap-2 text-center">
          <div>
            <Avatar emoji={fighters.a.emoji} color={fighters.a.color} size="lg" />
            <p className="mt-1 text-sm font-semibold">{fighters.a.name}</p>
            {duel.defender_side === 'a' && <p className="text-[11px] text-ink-soft">statu quo</p>}
          </div>
          <span className="font-serif text-2xl text-wood-700">contre</span>
          <div>
            <Avatar emoji={fighters.b.emoji} color={fighters.b.color} size="lg" />
            <p className="mt-1 text-sm font-semibold">{fighters.b.name}</p>
            {duel.defender_side === 'b' && <p className="text-[11px] text-ink-soft">statu quo</p>}
          </div>
        </div>
        {canRepress && duel.status === 'active' && (
          <Button variant="danger" className="mt-3 w-full" onClick={onRepress}>
            Réprimer le putsch (1 PA)
          </Button>
        )}
      </Card>
      {duel.status !== 'active' && <Result duel={duel} />}
      {duel.mode === 'target' ? <TargetDuel duel={duel} mySide={mySide} /> : <CarlageDuel duel={duel} mySide={mySide} />}
    </div>
  );
}
