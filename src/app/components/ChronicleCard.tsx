/**
 * Bilan de la semaine & frise du hameau (V6.0), dans l'onglet Gazette :
 * classement de la semaine en cours, dernier bilan (habitant de la semaine), records, frise datée.
 */
import { useMemo, useState } from 'react';
import { chronicleView, type WeekLine } from '../lib/chronicle.ts';
import { dateLong } from '../lib/format.ts';
import { useData } from '../state/GameContext.tsx';
import { Badge, Button, Card, Sheet, cx } from './ui.tsx';

const MEDAL = ['🥇', '🥈', '🥉'];
const TIMELINE_PREVIEW = 6;

function Rank({ l }: { l: WeekLine }) {
  return (
    <li className={cx('flex items-center gap-2 px-1 py-1.5 text-sm', l.me && 'rounded-lg bg-gold-100/70')}>
      <span className="w-6 text-center">{MEDAL[l.rank - 1] ?? `${l.rank}.`}</span>
      <span className="min-w-0 flex-1">
        <span className="font-semibold">{l.me ? `${l.name} (vous)` : l.name}</span>
        <span className="block truncate text-xs text-ink-soft">
          {l.actions} action{l.actions > 1 ? 's' : ''} · {l.ap} PA{l.missions ? ` · ${l.missions} mission${l.missions > 1 ? 's' : ''}` : ''}{l.helps ? ` · ${l.helps} coup${l.helps > 1 ? 's' : ''} de main` : ''}
          {l.favorite ? ` · surtout : ${l.favorite}` : ''}
        </span>
      </span>
      <Badge tone="wood">{l.score} pts</Badge>
    </li>
  );
}

export function WeekReviewCard() {
  const data = useData();
  const view = useMemo(() => chronicleView(data), [data]);
  const [help, setHelp] = useState(false);
  const last = view.last;
  return (
    <Card
      title="🏆 Bilan de la semaine"
      subtitle={view.since ? `Depuis le ${dateLong(view.since)} · bilan publié lundi à minuit` : 'Bilan publié lundi à minuit'}
      actions={
        <Button size="sm" variant="ghost" onClick={() => setHelp(true)} aria-label="Comment est calculé le score">
          ?
        </Button>
      }
    >
      {view.live.length === 0 ? (
        <p className="text-sm text-ink-soft">Personne n’a encore agi cette semaine : la première place est à prendre.</p>
      ) : (
        <>
          <p className="mb-1 text-sm">{view.myRank ? `Vous êtes ${view.myRank === 1 ? '1er' : `${view.myRank}e`} pour l’instant.` : 'Vous n’avez encore rien fait cette semaine.'}</p>
          <ul>{view.live.slice(0, 7).map((l) => <Rank key={l.id} l={l} />)}</ul>
        </>
      )}
      {last && (
        <div className="mt-3 rounded-xl bg-parchment-100/80 p-3 text-sm" data-testid="week-last">
          <p className="font-semibold">
            Semaine {last.week} : {last.hero ? `${last.heroIsMe ? 'vous êtes' : `${last.hero},`} habitant de la semaine` : 'semaine calme'}
          </p>
          <p className="text-xs text-ink-soft">
            Du {dateLong(last.from)} au {dateLong(last.to)} · {last.totalActions} actions, {last.totalAp} PA
          </p>
          {last.podium.length > 0 && <ul className="mt-1">{last.podium.map((l) => <Rank key={l.id} l={l} />)}</ul>}
          {last.records.map((r) => (
            <p key={r} className="mt-1 text-xs text-wood-700">🎉 {r}</p>
          ))}
        </div>
      )}
      <Sheet open={help} onClose={() => setHelp(false)} title="Score de la semaine">
        <div className="space-y-3 text-sm">
          <p>Chaque action réussie compte : {view.scoring}.</p>
          <p>Lundi à minuit, le premier devient l’habitant de la semaine ({view.heroReward}). Égalité : le plus de PA dépensés l’emporte.</p>
          {view.records.length > 0 && (
            <div>
              <p className="font-semibold">Records du hameau</p>
              <ul className="mt-1 space-y-1">
                {view.records.map((r) => (
                  <li key={r.label}>
                    {r.icon} {r.label} : {r.value}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </Sheet>
    </Card>
  );
}

export function TimelineCard() {
  const data = useData();
  const view = useMemo(() => chronicleView(data), [data]);
  const [all, setAll] = useState(false);
  const list = (items: typeof view.timeline) => (
    <ol className="relative ml-2 border-l-2 border-parchment-300">
      {items.map((e, i) => (
        <li key={`${e.day}-${i}`} className="relative py-1.5 pl-5">
          <span className="absolute -left-[13px] top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-parchment-100 text-sm">{e.icon}</span>
          <p className="text-xs text-ink-soft">{dateLong(e.day)}</p>
          <p className="text-sm leading-snug">{e.title}</p>
        </li>
      ))}
    </ol>
  );
  return (
    <Card title="📜 Frise du hameau" subtitle="Les grandes étapes, datées">
      {view.timeline.length === 0 ? (
        <p className="text-sm text-ink-soft">Aucune grande étape pour l’instant : le premier chantier livré ouvrira la frise.</p>
      ) : (
        <>
          {list(view.timeline.slice(0, TIMELINE_PREVIEW))}
          {view.timeline.length > TIMELINE_PREVIEW && (
            <Button size="sm" variant="ghost" className="mt-1 w-full" onClick={() => setAll(true)}>
              Toute la frise ({view.timeline.length} étapes)
            </Button>
          )}
        </>
      )}
      <Sheet open={all} onClose={() => setAll(false)} title="Frise du hameau">
        {list(view.timeline)}
      </Sheet>
    </Card>
  );
}
