/** Carte d'un scrutin de l'Agora : vote nominatif OUI/NON, veto, contestation en duel. */
import { useState } from 'react';
import type { Proposal } from '../api/types.ts';
import { canFight, isDetained, PILLAR_ROLES, playerName } from '../lib/game.ts';
import { countdown, dateTime } from '../lib/format.ts';
import { CATEGORY_LABEL, DUEL_MODE, PROPOSAL_KIND, PROPOSAL_STATUS, SENTENCE_LABEL } from '../lib/labels.ts';
import { navigate } from '../lib/router.ts';
import { useData, useGame, useNow } from '../state/GameContext.tsx';
import { Badge, Button, Card, Field, Select, cx } from './ui.tsx';

export function ProposalCard({ p }: { p: Proposal }) {
  const data = useData();
  const { api, perform } = useGame();
  const now = useNow(1000);
  const [expanded, setExpanded] = useState(false);
  const [mode, setMode] = useState<'carlage' | 'target'>('target');
  const [champion, setChampion] = useState('');
  const me = data.me;
  const open = p.status === 'open' && new Date(p.closes_at).getTime() > now.getTime();
  const myVote = p.votes_yes.includes(me.id) ? 'yes' : p.votes_no.includes(me.id) ? 'no' : null;
  const canVote = open && me.is_active_slot && (me.status === 'active' || me.status === 'forced_labor') && !isDetained(me, now) && p.target_player_id !== me.id;
  const vetoWindow = p.status === 'passed' && !p.executed_at && p.closed_at && now.getTime() - new Date(p.closed_at).getTime() < 6 * 3_600_000;
  const canVeto = vetoWindow && PILLAR_ROLES.includes(me.role_code) && me.veto_tokens > 0;
  const duel = data.duels.find((d) => d.proposal_id === p.id && d.status === 'active');
  const canChallenge = p.status === 'vetoed' && p.proposer_id === me.id && !duel;
  const needsChampion = mode === 'carlage' && !canFight(me, now);
  const migrant = data.migrants.find((m) => m.id === p.target_migrant_id);
  const sentence = typeof p.payload?.sentence === 'string' ? p.payload.sentence : null;
  const statusTone = p.status === 'passed' ? 'moss' : p.status === 'rejected' ? 'ember' : p.status === 'vetoed' ? 'ember' : 'gold';

  return (
    <Card className={cx(open && 'border-gold-500/50')}>
      <div className="mb-2 flex flex-wrap items-center gap-1.5">
        <Badge tone="wood">{PROPOSAL_KIND[p.kind] ?? p.kind}</Badge>
        <Badge>{CATEGORY_LABEL[p.category] ?? p.category}</Badge>
        <Badge tone={statusTone}>{PROPOSAL_STATUS[p.status] ?? p.status}</Badge>
        {p.required_majority === 'two_thirds' && <Badge tone="ember">Majorité des 2/3</Badge>}
        {open && <span className="ml-auto text-xs font-semibold tabular-nums text-wood-700">⏳ {countdown(p.closes_at, now)}</span>}
      </div>
      <h3 className="font-serif text-lg leading-snug">{p.title}</h3>
      <p className="mb-2 text-xs text-ink-soft">
        {p.proposer_id ? `Porté par ${playerName(data.players, p.proposer_id)}` : 'Motion du Maître du Jeu'} · séance du {dateTime(p.closes_at)}
      </p>
      {(migrant || p.target_player_id || sentence) && (
        <p className="mb-2 text-sm">
          {migrant && <>Concerne <strong>{migrant.full_name}</strong>. </>}
          {p.target_player_id && <>Accusé : <strong>{playerName(data.players, p.target_player_id)}</strong>. </>}
          {sentence && (
            <>
              Peine : <strong>{SENTENCE_LABEL[sentence]}</strong>
              {sentence === 'forced_labor' ? ` (${String(p.payload.days ?? 3)} jours)` : ''}.
            </>
          )}
        </p>
      )}
      <p className={cx('whitespace-pre-line text-sm text-ink', !expanded && 'line-clamp-4')}>{p.detailed_explanation}</p>
      {p.detailed_explanation.length > 220 && (
        <button className="mt-1 text-xs font-semibold text-wood-600" onClick={() => setExpanded(!expanded)}>
          {expanded ? 'Réduire' : 'Lire tout'}
        </button>
      )}

      <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
        <div className="rounded-lg bg-moss-100 px-2 py-1.5">
          <p className="font-bold text-moss-700">OUI · {p.votes_yes.length}</p>
          <p className="text-ink-soft">{p.votes_yes.map((id) => playerName(data.players, id)).join(', ') || '—'}</p>
        </div>
        <div className="rounded-lg bg-ember-100 px-2 py-1.5">
          <p className="font-bold text-ember-600">NON · {p.votes_no.length}</p>
          <p className="text-ink-soft">{p.votes_no.map((id) => playerName(data.players, id)).join(', ') || '—'}</p>
        </div>
      </div>

      {canVote && (
        <div className="mt-3 grid grid-cols-2 gap-2">
          <Button variant={myVote === 'yes' ? 'moss' : 'secondary'} onClick={() => void perform(() => api.vote(p.id, true), 'Vote OUI enregistré.')}>
            OUI
          </Button>
          <Button variant={myVote === 'no' ? 'danger' : 'secondary'} onClick={() => void perform(() => api.vote(p.id, false), 'Vote NON enregistré.')}>
            NON
          </Button>
        </div>
      )}
      {canVeto && (
        <Button variant="danger" className="mt-3 w-full" onClick={() => window.confirm('Utiliser votre jeton de veto de la saison ?') && void perform(() => api.veto(p.id), 'Veto posé.')}>
          🛑 Opposer mon veto ({countdown(new Date(new Date(p.closed_at!).getTime() + 6 * 3_600_000).toISOString(), now)})
        </Button>
      )}
      {p.status === 'vetoed' && <p className="mt-3 text-sm text-ember-600">Veto de {playerName(data.players, p.vetoed_by)}.</p>}
      {canChallenge && (
        <div className="mt-3 space-y-2 rounded-xl border border-ember-600/30 bg-ember-100 p-3">
          <p className="text-sm font-semibold">Contester le veto en duel</p>
          <Field label="Épreuve">
            <Select value={mode} onChange={(e) => setMode(e.target.value as 'carlage' | 'target')}>
              <option value="target">{DUEL_MODE.target}</option>
              <option value="carlage">{DUEL_MODE.carlage}</option>
            </Select>
          </Field>
          {needsChampion && (
            <Field label="Champion (vous n'êtes pas en état de combattre)">
              <Select value={champion} onChange={(e) => setChampion(e.target.value)}>
                <option value="">— Choisir —</option>
                {data.players
                  .filter((x) => x.is_active_slot && x.status === 'active' && x.id !== me.id && x.id !== p.vetoed_by && !x.injury_type && x.health_pct >= 60)
                  .map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.display_name}
                    </option>
                  ))}
              </Select>
            </Field>
          )}
          <Button
            className="w-full"
            disabled={needsChampion && !champion}
            onClick={() =>
              void perform(
                () => api.challengeDuel({ proposalId: p.id, mode, championPlayerId: needsChampion ? champion : null }),
                (r) => (r.forfeit ? String(r.summary) : 'Duel lancé !'),
              ).then((r) => r?.duel_id && navigate('duel', String(r.duel_id)))
            }
          >
            Lancer le duel
          </Button>
        </div>
      )}
      {duel && (
        <Button variant="secondary" className="mt-3 w-full" onClick={() => navigate('duel', duel.id)}>
          Suivre le duel en cours →
        </Button>
      )}
      {p.ai_execution_summary && <p className="mt-3 rounded-xl bg-parchment-100 px-3 py-2 text-sm italic text-ink">{p.ai_execution_summary}</p>}
    </Card>
  );
}
