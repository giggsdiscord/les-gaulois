/**
 * Chantier collectif de la semaine (V5.0) : barre de progression commune, bouton « Y mettre 1 PA »,
 * participants et vote pour le projet de la semaine suivante. Accueil (compact) et Agora (complet).
 */
import { useMemo, useState } from 'react';
import { collectiveView } from '../lib/collective.ts';
import { useData, useGame, useNow } from '../state/GameContext.tsx';
import { Badge, Button, Card, cx } from './ui.tsx';

export function CollectiveCard({ full = false }: { full?: boolean }) {
  const data = useData();
  const { api, perform, toast } = useGame();
  const now = useNow(60_000);
  const view = useMemo(() => collectiveView(data, now), [data, now]);
  const [busy, setBusy] = useState(false);
  const { project, def } = view;
  const myAp = data.me.action_points;

  async function run(input: Parameters<typeof api.action>[0], fallback: string) {
    setBusy(true);
    const r = await perform(
      () => api.action(input),
      (res) => (res.ok ? res.narrative ?? fallback : undefined),
    );
    setBusy(false);
    if (r && !r.ok) toast('error', r.error ?? 'Action refusée.');
  }

  const vote = view.candidates.length > 0 && (
    <div className={cx('space-y-2', project && 'border-t border-parchment-200 pt-3')}>
      <p className="text-xs font-semibold text-ink-soft uppercase">Chantier de la semaine prochaine — votre voix</p>
      <div className="space-y-1.5">
        {view.candidates.map((c) => (
          <button
            key={c.def.id}
            type="button"
            disabled={busy || c.mine}
            onClick={() => void run({ action_code: 'vote_collective_project', params: { project: c.def.id } }, 'Voix enregistrée.')}
            className={cx(
              'flex min-h-11 w-full items-center gap-2 rounded-xl border px-3 py-2 text-left text-sm',
              c.mine ? 'border-moss-500 bg-moss-100' : 'border-parchment-300 bg-parchment-50 active:bg-parchment-200',
            )}
          >
            <span className="text-lg" aria-hidden>
              {c.def.icon}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-medium text-ink">{c.def.label}</span>
              {full && <span className="block text-xs text-ink-soft">{c.def.summary}</span>}
            </span>
            {c.proposed && <Badge tone="gold">proposé</Badge>}
            <Badge tone={c.leading ? 'moss' : 'neutral'}>{c.votes}</Badge>
          </button>
        ))}
      </div>
      <p className="text-xs text-ink-soft">Choix fait lundi à minuit ; sans vote, le hameau retient sa proposition.</p>
    </div>
  );

  return (
    <Card title={def ? `${def.icon} Chantier de la semaine` : '🤝 Chantier de la semaine'} subtitle={def ? def.label : undefined} tone={view.done ? 'moss' : 'default'}>
      <div className="space-y-3">
        {project && def ? (
          <>
            <p className="text-sm text-ink-soft">{def.summary}</p>
            <div>
              <div className="mb-1 flex items-baseline justify-between text-sm">
                <span className="font-semibold text-ink">
                  {project.points} / {project.goal} points
                </span>
                <span className="text-xs text-ink-soft">{view.pct} %</span>
              </div>
              <div className="h-3 overflow-hidden rounded-full bg-parchment-200" role="progressbar" aria-valuenow={view.pct} aria-valuemin={0} aria-valuemax={100}>
                <div className={cx('h-full rounded-full transition-[width]', view.done ? 'bg-moss-500' : 'bg-gold-500')} style={{ width: `${view.pct}%` }} />
              </div>
            </div>
            <p className={cx('text-sm', view.done ? 'text-moss-700' : view.daysBeforeSunday === 0 ? 'text-ember-600' : 'text-ink')}>{view.status}</p>
            {view.contributors.length > 0 && (
              <p className="text-xs text-ink-soft">
                {view.contributors.map((c) => `${c.name} ${c.points}`).join(' · ')}
              </p>
            )}
            {!view.done && (
              <Button
                className="w-full"
                variant="moss"
                disabled={busy || myAp < 1 || data.village.is_defeated}
                onClick={() => void run({ action_code: 'contribute_collective' }, 'Contribution enregistrée.')}
              >
                {myAp < 1 ? 'Plus de PA aujourd\'hui' : `Y mettre 1 PA (+${view.myPoints} point${view.myPoints > 1 ? 's' : ''})`}
              </Button>
            )}
            {view.myPoints > 1 && !view.done && <p className="-mt-1 text-xs text-moss-700">C'est votre métier : chaque PA compte double.</p>}
          </>
        ) : (
          <p className="text-sm text-ink-soft">{view.status}</p>
        )}
        {(full || !project || view.done) && vote}
        {full && view.last && view.lastDef && (
          <p className="text-xs text-ink-soft">
            Semaine dernière : {view.lastDef.icon} {view.lastDef.label} — {view.last.completed_at ? (view.last.early ? 'achevé avant dimanche ✓' : 'achevé le dimanche') : `inachevé (${view.last.points}/${view.last.goal})`}.
          </p>
        )}
      </div>
    </Card>
  );
}
