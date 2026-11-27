/**
 * Élection vivante d'un portefeuille (V5.3) : candidats et programmes, candidature, débat de la
 * Taverne, bulletin secret. `compact` = accueil ; `full` = Agora ; `debate` = Taverne (hall de l'Agora).
 */
import { useMemo, useState } from 'react';
import { constants as C } from '../engine.ts';
import { electionView } from '../lib/election.ts';
import { navigate } from '../lib/router.ts';
import { useData, useGame, useNow } from '../state/GameContext.tsx';
import { Avatar, Badge, Button, Card, cx, TextArea } from './ui.tsx';

type Mode = 'compact' | 'full' | 'debate';

export function ElectionCard({ mode = 'compact' }: { mode?: Mode }) {
  const data = useData();
  const { api, perform, toast } = useGame();
  const now = useNow(60_000);
  const view = useMemo(() => electionView(data, now), [data, now]);
  const [busy, setBusy] = useState(false);
  const [program, setProgram] = useState('');
  const [speech, setSpeech] = useState('');
  const myAp = data.me.action_points;

  if (!view.election) {
    if (mode !== 'full' || (!view.lastText && view.mandates.length === 0)) return null;
    return (
      <Card title="🗳️ Élections des portefeuilles">
        <div className="space-y-1 text-sm text-ink-soft">
          {view.lastText && <p>Dernière élection — {view.lastText}</p>}
          {view.mandates.map((m) => (
            <p key={m.portfolio}>
              {m.title} : <span className="font-medium text-ink">{m.holder ?? '—'}</span> jusqu'au {m.untilDay.split('-').reverse().slice(0, 2).join('/')}
            </p>
          ))}
        </div>
      </Card>
    );
  }

  async function run(input: Parameters<typeof api.action>[0], fallback: string): Promise<boolean> {
    setBusy(true);
    const r = await perform(
      () => api.action(input),
      (res) => (res.ok ? res.narrative ?? fallback : undefined),
    );
    setBusy(false);
    if (r && !r.ok) toast('error', r.error ?? 'Action refusée.');
    return !!r?.ok;
  }

  const phaseBadge = view.phase === 'candidacy' ? <Badge tone="gold">candidatures</Badge> : view.phase === 'vote' ? <Badge tone="moss">vote ouvert</Badge> : <Badge>dépouillement</Badge>;
  const programLen = program.trim().length;
  const speechLen = speech.trim().length;

  const candidates = (
    <div className="space-y-1.5">
      {view.candidates.length === 0 && <p className="text-sm text-ink-soft">Aucun candidat pour l'instant.</p>}
      {view.candidates.map((c) => (
        <button
          key={c.id}
          type="button"
          disabled={busy || !view.canVote || c.mine || c.myChoice}
          onClick={() => void run({ action_code: 'vote_election', params: { candidate: c.id } }, 'Bulletin déposé.')}
          className={cx(
            'flex min-h-11 w-full items-start gap-2 rounded-xl border px-3 py-2 text-left text-sm',
            c.myChoice ? 'border-moss-500 bg-moss-100' : 'border-parchment-300 bg-parchment-50',
            view.canVote && !c.mine && !c.myChoice && 'active:bg-parchment-200',
          )}
        >
          <Avatar emoji={c.emoji} color={c.color} size="sm" />
          <span className="min-w-0 flex-1">
            <span className="block font-medium text-ink">
              {c.name}
              {c.mine && ' (vous)'}
            </span>
            {mode !== 'compact' && <span className="block text-xs text-ink-soft">« {c.program} »</span>}
          </span>
          {c.speeches > 0 && <Badge tone="river">🎙️ {c.speeches}</Badge>}
          {c.myChoice && <Badge tone="moss">mon vote</Badge>}
        </button>
      ))}
    </div>
  );

  const stand = view.canStand && (
    <div className="space-y-2 border-t border-parchment-200 pt-3">
      <p className="text-xs font-semibold text-ink-soft uppercase">Me présenter</p>
      <TextArea
        value={program}
        maxLength={C.ELECTION_TEXT_MAX}
        rows={3}
        placeholder="Mon programme en une ou deux phrases…"
        onChange={(ev) => setProgram(ev.target.value)}
      />
      <Button
        className="w-full"
        disabled={busy || programLen < C.ELECTION_PROGRAM_MIN || myAp < 1}
        onClick={() => void run({ action_code: 'run_for_office', params: { program } }, 'Candidature déposée.').then((ok) => ok && setProgram(''))}
      >
        {myAp < 1 ? 'Plus de PA aujourd\'hui' : programLen < C.ELECTION_PROGRAM_MIN ? `Programme : ${programLen}/${C.ELECTION_PROGRAM_MIN} caractères min.` : 'Déposer ma candidature (1 PA)'}
      </Button>
    </div>
  );

  const speak = view.canSpeak && (
    <div className="space-y-2">
      <TextArea value={speech} maxLength={C.ELECTION_TEXT_MAX} rows={2} placeholder="Mon intervention au débat…" onChange={(ev) => setSpeech(ev.target.value)} />
      <Button
        className="w-full"
        variant="moss"
        disabled={busy || speechLen < C.ELECTION_SPEECH_MIN || myAp < 1}
        onClick={() => void run({ action_code: 'campaign_speech', params: { text: speech } }, 'Intervention publiée.').then((ok) => ok && setSpeech(''))}
      >
        {myAp < 1 ? 'Plus de PA aujourd\'hui' : 'Prendre la parole (1 PA)'}
      </Button>
    </div>
  );

  const debate = (
    <div className="space-y-2">
      {view.debate.length === 0 && <p className="text-sm text-ink-soft">Le débat n'a pas encore commencé.</p>}
      {view.debate.slice(0, mode === 'debate' ? 30 : 3).map((d) => (
        <div key={`${d.id}-${d.at}`} className={cx('rounded-xl px-3 py-2 text-sm', d.mine ? 'bg-moss-100' : 'bg-parchment-100')}>
          <span className="font-medium text-ink">
            {d.emoji} {d.name}
          </span>{' '}
          <span className="text-ink">{d.text}</span>
        </div>
      ))}
    </div>
  );

  return (
    <Card title={`🗳️ Élection : ${view.title}`} subtitle={view.status} actions={phaseBadge} tone={view.canVote && !view.myVote ? 'river' : 'default'}>
      <div className="space-y-3">
        {mode === 'debate' ? (
          <>
            <p className="text-xs text-ink-soft">Débat des candidats : une intervention par jour chacun. À égalité de voix, le plus présent au débat l'emporte.</p>
            {speak}
            {debate}
          </>
        ) : (
          <>
            {candidates}
            {view.phase === 'vote' && (
              <p className="text-xs text-ink-soft">
                Vote secret : {view.voters}/{view.electors} votant(s). {view.canVote ? (view.myVote ? 'Vous pouvez changer d\'avis jusqu\'au soir.' : 'Touchez un candidat pour voter (pas soi-même).') : ''}
              </p>
            )}
            {stand}
            {mode === 'full' && view.amCandidate && speak}
            {mode === 'full' && view.debate.length > 0 && (
              <div className="space-y-2 border-t border-parchment-200 pt-3">
                <p className="text-xs font-semibold text-ink-soft uppercase">Derniers échanges du débat</p>
                {debate}
              </div>
            )}
            <Button variant="ghost" size="sm" className="w-full" onClick={() => navigate('gazette', 'agora')}>
              🎙️ Débat à la Taverne
            </Button>
            {mode === 'full' && view.lastText && <p className="text-xs text-ink-soft">Dernière élection — {view.lastText}</p>}
          </>
        )}
      </div>
    </Card>
  );
}
