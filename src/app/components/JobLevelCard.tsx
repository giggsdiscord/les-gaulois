/**
 * Niveau de métier, mission du jour et binômes (V5.2) : en tête du menu « Agir » de l'écran Métier.
 * Un appui sur la mission ou sur un binôme ouvre directement l'action correspondante.
 */
import { useMemo } from 'react';
import type { ActionDef } from '../engine.ts';
import { DUO_REWARD_TEXT, jobView } from '../lib/jobLevel.ts';
import { useData, useNow } from '../state/GameContext.tsx';
import { Badge, Card, cx } from './ui.tsx';

export function JobLevelCard({ onAction }: { onAction: (def: ActionDef) => void }) {
  const data = useData();
  const now = useNow(60_000);
  const view = useMemo(() => jobView(data, now), [data, now]);
  const { progress, mission } = view;

  return (
    <Card className="space-y-3 p-3!">
      <div>
        <div className="flex items-center justify-between gap-2">
          <p className="font-semibold">
            🎖️ Niveau {progress.level} <span className="text-sm font-normal text-ink-soft">de métier</span>
          </p>
          <span className="text-xs tabular-nums text-ink-soft">
            {progress.xp}
            {progress.next !== null ? ` / ${progress.next}` : ''} XP
          </span>
        </div>
        <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-parchment-200" role="progressbar" aria-valuenow={progress.pct} aria-valuemin={0} aria-valuemax={100} aria-label="Vers le niveau suivant">
          <div className="h-full rounded-full bg-gold-500" style={{ width: `${progress.pct}%` }} />
        </div>
        <p className="mt-1 text-xs leading-snug text-ink-soft">
          {view.perk}
          {view.nextPerk && <> Niveau {progress.level + 1} : {view.nextPerk.charAt(0).toLowerCase() + view.nextPerk.slice(1)}</>}
        </p>
      </div>

      {mission && (
        <button
          type="button"
          disabled={mission.done}
          onClick={() => onAction(mission.def)}
          className={cx(
            'flex min-h-12 w-full items-center gap-3 rounded-xl border px-3 py-2 text-left',
            mission.done ? 'border-moss-500/30 bg-moss-100' : 'border-gold-500/40 bg-gold-100 active:brightness-95',
          )}
        >
          <span className="text-xl" aria-hidden="true">
            {mission.done ? '✅' : '🎯'}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-xs font-semibold text-ink-soft uppercase">Mission du jour</span>
            <span className="block font-semibold leading-snug">{mission.def.label}</span>
            <span className="block text-xs text-ink-soft">{mission.done ? 'Faite : à demain pour la suivante.' : mission.reward}</span>
          </span>
          {!mission.done && <span className="text-lg text-wood-700">›</span>}
        </button>
      )}

      {view.duos.map((d) => (
        <button
          key={d.group.id}
          type="button"
          disabled={d.formed || !d.action}
          onClick={() => d.action && onAction(d.action)}
          className={cx('flex min-h-11 w-full items-center gap-3 rounded-xl border px-3 py-2 text-left text-sm', d.formed ? 'border-moss-500/30 bg-moss-100' : 'border-river-600/30 bg-river-100 active:brightness-95')}
        >
          <span className="text-xl" aria-hidden="true">
            {d.group.icon}
          </span>
          <span className="min-w-0 flex-1 leading-snug">
            {d.formed ? (
              <>
                Binôme « {d.group.label} » formé avec {d.partners.join(' et ')} <Badge tone="moss">✓</Badge>
              </>
            ) : (
              <>
                <b>{d.partners.join(' et ')}</b> {d.partners.length > 1 ? 'ont' : 'a'} agi aujourd'hui ({d.group.label.toLowerCase()}) : faites « {d.action?.label} » pour former un binôme ({DUO_REWARD_TEXT}).
              </>
            )}
          </span>
        </button>
      ))}
    </Card>
  );
}
