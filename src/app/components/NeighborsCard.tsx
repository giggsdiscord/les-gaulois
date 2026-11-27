/**
 * Relations avec les voisins (V5.8) : trois jauges (Organyà, mairie, Mossos) et la demande en cours,
 * avec le bouton « Donner un coup de main ». Accueil (compact) et Agora (complet : effets des jauges).
 */
import { useMemo, useState } from 'react';
import { constants as C } from '../engine.ts';
import { neighborsView } from '../lib/neighbors.ts';
import { useData, useGame, useNow } from '../state/GameContext.tsx';
import { Badge, Button, Card, cx } from './ui.tsx';

const BAR = { good: 'bg-moss-500', neutral: 'bg-gold-500', bad: 'bg-ember-600' } as const;

export function NeighborsCard({ full = false }: { full?: boolean }) {
  const data = useData();
  const { api, perform, toast } = useGame();
  const now = useNow(60_000);
  const view = useMemo(() => neighborsView(data, now), [data, now]);
  const [busy, setBusy] = useState(false);
  const m = view.mission;
  const myAp = data.me.action_points;

  async function help() {
    setBusy(true);
    const r = await perform(
      () => api.action({ action_code: 'help_neighbors' }),
      (res) => (res.ok ? res.narrative ?? 'Coup de main donné.' : undefined),
    );
    setBusy(false);
    if (r && !r.ok) toast('error', r.error ?? 'Action refusée.');
  }

  return (
    <Card title="🤝 Les voisins" subtitle={m ? `${m.from.short} demande : ${m.def.title.toLowerCase()}` : undefined} tone={m && m.daysLeft <= 1 ? 'warning' : 'default'}>
      <div className="space-y-3">
        <ul className="space-y-1.5" aria-label="Relations avec les voisins">
          {view.gauges.map((g) => (
            <li key={g.def.id} data-neighbor={g.def.id}>
              <div className="flex items-center gap-2 text-sm">
                <span aria-hidden>{g.def.icon}</span>
                <span className="w-16 shrink-0 text-ink">{g.def.short}</span>
                <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-parchment-200" role="meter" aria-label={g.def.label} aria-valuenow={g.value} aria-valuemin={0} aria-valuemax={100}>
                  <div className={cx('h-full rounded-full', BAR[g.standing])} style={{ width: `${g.value}%` }} />
                </div>
                <span className="w-8 text-right text-xs tabular-nums text-ink-soft">{g.value}</span>
              </div>
              {g.effect && <p className={cx('ml-7 text-xs', g.standing === 'good' ? 'text-moss-700' : 'text-ember-600')}>{g.effect}</p>}
              {full && !g.effect && (
                <p className="ml-7 text-xs text-ink-soft">
                  ≥ {C.NEIGHBOR_GOOD} : {g.def.good} · ≤ {C.NEIGHBOR_BAD} : {g.def.bad}
                </p>
              )}
            </li>
          ))}
        </ul>
        {m ? (
          <div className="space-y-2 border-t border-parchment-200 pt-3">
            <p className="text-sm text-ink">
              <span aria-hidden>{m.def.icon} </span>
              {m.def.ask}
            </p>
            <div className="flex flex-wrap items-center gap-1.5 text-xs">
              <Badge tone={m.daysLeft <= 1 ? 'ember' : 'neutral'}>{m.deadline}</Badge>
              <Badge tone="moss">+{m.def.reward} · {m.def.bonus}</Badge>
              <Badge tone="ember">sinon −{m.def.penalty}</Badge>
            </div>
            <div>
              <div className="mb-1 flex items-baseline justify-between text-sm">
                <span className="font-semibold text-ink">
                  {m.done} / {m.steps} coups de main
                </span>
                {m.cost && <span className="text-xs text-ink-soft">chacun : 1 PA + {m.cost}</span>}
              </div>
              <div className="h-3 overflow-hidden rounded-full bg-parchment-200" role="progressbar" aria-valuenow={m.pct} aria-valuemin={0} aria-valuemax={100}>
                <div className="h-full rounded-full bg-river-600 transition-[width]" style={{ width: `${m.pct}%` }} />
              </div>
            </div>
            {m.helpers.length > 0 && <p className="text-xs text-ink-soft">{m.helpers.map((h) => `${h.name} ${h.count}`).join(' · ')}</p>}
            <Button className="w-full" variant="moss" disabled={busy || myAp < 1 || !!m.blocked || data.village.is_defeated} onClick={() => void help()}>
              {m.blocked ?? (myAp < 1 ? 'Plus de PA aujourd’hui' : 'Donner un coup de main (1 PA)')}
            </Button>
          </div>
        ) : (
          <p className="text-sm text-ink-soft">{view.idle}</p>
        )}
        {(full || !m) && view.last && <p className="text-xs text-ink-soft">Dernière demande — {view.last}</p>}
      </div>
    </Card>
  );
}
