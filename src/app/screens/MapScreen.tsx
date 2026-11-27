/**
 * Écran 1 — Le hameau : « Aujourd'hui » (ce qui vous attend, V4.4), « À faire en priorité »
 * (ce qui fait avancer le village et pourquoi, V4.6) puis carte interactive illustrée (V4.7 :
 * calques, pastilles, mode « Explorer » plein écran, fiche d'ouvrage avec la prochaine étape).
 */
import { useMemo, useState } from 'react';
import type { ActionDef } from '../engine.ts';
import type { Structure } from '../api/types.ts';
import { ActionSheet } from '../components/ActionSheet.tsx';
import { TEMPTATION_REOPEN_EVENT } from '../components/Modals.tsx';
import { CollectiveCard } from '../components/CollectiveCard.tsx';
import { ElectionCard } from '../components/ElectionCard.tsx';
import { PriorityCard } from '../components/PriorityCard.tsx';
import { ParcelSheet } from '../components/ParcelSheet.tsx';
import { StructureSheet } from '../components/StructureSheet.tsx';
import { Card, Stat, cx } from '../components/ui.tsx';
import { VillageMap } from '../components/VillageMap.tsx';
import { countdown } from '../lib/format.ts';
import { population } from '../lib/game.ts';
import { ACT_LABEL, ENERGY_LABEL } from '../lib/labels.ts';
import { structurePreset } from '../lib/mapView.ts';
import { priorityPlan } from '../lib/priorities.ts';
import { navigate } from '../lib/router.ts';
import { nextAgora, todoItems, type TodoItem } from '../lib/todo.ts';
import { useData, useNow } from '../state/GameContext.tsx';
import { useUnread } from '../state/UnreadContext.tsx';

/** Carte « Aujourd'hui » : tout ce qui attend le joueur, un appui pour y aller. */
function TodayCard() {
  const data = useData();
  const now = useNow(30_000);
  const { counts } = useUnread();
  const items = todoItems(data, now, counts);
  const v = data.village;
  const open = (item: TodoItem) => (item.route === 'tentation' ? window.dispatchEvent(new Event(TEMPTATION_REOPEN_EVENT)) : navigate(item.route, item.param));
  const agora = nextAgora(now);
  return (
    <Card flush>
      <div className="flex items-baseline justify-between gap-2 px-4 pt-3">
        <h2 className="font-serif text-lg text-ink">Aujourd'hui</h2>
        <span className="text-xs text-ink-soft">Autonomie {Math.round(v.autonomy_pct)} %</span>
      </div>
      <p className="px-4 text-xs text-ink-soft">
        {ACT_LABEL[v.act_number] ?? `Acte ${v.act_number}`} · Agora dans {countdown(agora.toISOString(), now)}
      </p>
      {items.length === 0 ? (
        <p className="px-4 py-3 text-sm text-ink-soft">Rien ne vous attend : profitez du calme du hameau. 🌿</p>
      ) : (
        <ul className="mt-2 divide-y divide-parchment-200 border-t border-parchment-200">
          {items.map((item) => (
            <li key={item.key}>
              <button onClick={() => open(item)} className="flex min-h-12 w-full items-center gap-3 px-4 py-2 text-left active:bg-parchment-100">
                <span className="w-7 shrink-0 text-center text-xl" aria-hidden="true">
                  {item.emoji}
                </span>
                <span className={cx('min-w-0 flex-1 text-sm', item.tone === 'urgent' ? 'font-semibold text-ink' : item.tone === 'info' ? 'text-ink-soft' : 'text-ink')}>{item.text}</span>
                {item.tone === 'urgent' && <span className="h-2 w-2 shrink-0 rounded-full bg-ember-600" aria-hidden="true" />}
                <span className="shrink-0 text-lg text-wood-500" aria-hidden="true">
                  ›
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

export function MapScreen() {
  const data = useData();
  const now = useNow(60_000);
  const [selected, setSelected] = useState<Structure | null>(null);
  const [parcel, setParcel] = useState<string | null>(null);
  const [action, setAction] = useState<ActionDef | null>(null);
  const v = data.village;
  const pop = population(data);
  const plan = useMemo(() => priorityPlan(data, now), [data, now]);
  const priorityIds = useMemo(
    () => new Set(plan.items.slice(0, 5).map((i) => i.preset?.target_structure_id).filter((x): x is string => typeof x === 'string')),
    [plan],
  );
  // La fiche suit les données fraîches (après une action, l'ouvrage a changé)
  const current = selected ? data.structures.find((s) => s.id === selected.id) ?? selected : null;

  return (
    <div className="space-y-4">
      <TodayCard />
      <PriorityCard />
      <CollectiveCard />
      <ElectionCard />
      <div className="grid grid-cols-2 gap-2">
        <Stat label="Habitants" value={pop.total} sub={`${v.housing_capacity} lits PLU`} tone={pop.total > v.housing_capacity ? 'ember' : undefined} />
        <Stat label="Eau" value={`${v.water_capacity_l_day} L/j`} sub={`besoin ≈ ${pop.total * 150} L + potager`} tone={v.water_capacity_l_day < pop.total * 150 ? 'ember' : undefined} />
        <Stat label="Énergie" value={ENERGY_LABEL[v.energy_tier]} sub={`palier ${v.energy_tier}/5`} />
        <Stat label="Piste" value={`${Math.round(v.track_condition_pct)} %`} sub={v.track_condition_pct < 40 ? 'surcoût +40 %' : 'praticable'} tone={v.track_condition_pct < 40 ? 'ember' : 'moss'} />
      </div>

      <VillageMap structures={data.structures} village={v} priorityIds={priorityIds} selectedId={current?.id ?? null} onSelect={setSelected} onParcel={setParcel} />

      <Card title="Météo réelle" subtitle={v.real_news_headline ?? undefined}>
        <p className="text-sm text-ink">{v.real_weather_summary}</p>
      </Card>

      {parcel && <ParcelSheet parcelId={parcel} onClose={() => setParcel(null)} />}
      {current && !action && <StructureSheet structure={current} onClose={() => setSelected(null)} onAct={setAction} />}
      {current && action && (
        <ActionSheet
          def={action}
          holderId={null}
          preset={structurePreset(action, current, data.structures)}
          onClose={() => {
            setAction(null);
            setSelected(null);
          }}
        />
      )}
    </div>
  );
}
