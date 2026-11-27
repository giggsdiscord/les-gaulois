/**
 * Fiche d'une parcelle libre (V5.4) : choisir le nouveau bâtiment à y poser. Chaque choix
 * montre son effet, son prix et ses conditions (bord de rivière, électricité) ; le bouton pose le
 * plan (1 PA, prix payé par la caisse), le chantier se fait ensuite depuis la fiche de l'ouvrage.
 */
import { useMemo, useState } from 'react';
import { parcelChoices } from '../lib/buildings.ts';
import { useData, useGame } from '../state/GameContext.tsx';
import { Badge, Button, Card, Sheet, cx } from './ui.tsx';

export function ParcelSheet({ parcelId, onClose }: { parcelId: string; onClose: () => void }) {
  const data = useData();
  const { api, perform, toast } = useGame();
  const view = useMemo(() => parcelChoices(data, parcelId), [data, parcelId]);
  const [open, setOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (!view) return null;
  const { parcel, choices } = view;

  async function plan(variant: string) {
    setBusy(true);
    const r = await perform(
      () => api.action({ action_code: 'plan_building', params: { variant, parcel: parcel.id } }),
      (res) => (res.ok ? res.narrative ?? 'Plan posé.' : undefined),
    );
    setBusy(false);
    if (r && !r.ok) toast('error', r.error ?? 'Action refusée.');
    else if (r?.ok) onClose();
  }

  return (
    <Sheet open onClose={onClose} title={`🟩 Parcelle « ${parcel.name} »`}>
      <div className="space-y-3 pb-4">
        <div className="flex flex-wrap gap-1.5">
          <Badge tone="moss">{view.free ? 'Libre' : 'Occupée'}</Badge>
          {parcel.river && <Badge tone="neutral">🌊 Bord de rivière</Badge>}
        </div>
        <p className="text-sm text-ink-soft">
          Choisissez ce que le hameau bâtit ici : la caisse paie le plan (1 PA), puis le chantier avance par « Rénover / construire » (300 €, 5 pierres, 5 bois par séance, accord PLU de Tiphaine). Un seul bâtiment de chaque sorte, deux projets à la fois.
        </p>
        <Card flush className="divide-y divide-parchment-200">
          {choices.map(({ type, blocker, needsBudget }) => {
            const expanded = open === type.id;
            return (
              <div key={type.id} className={cx(blocker && 'opacity-60')}>
                <button type="button" onClick={() => setOpen(expanded ? null : type.id)} className="flex min-h-14 w-full items-center gap-3 px-3 py-2 text-left active:bg-parchment-100" aria-expanded={expanded}>
                  <span className="text-2xl" aria-hidden>
                    {type.icon}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold text-ink">{type.label}</span>
                    <span className="block truncate text-xs text-ink-soft">{blocker ?? type.effect}</span>
                  </span>
                  <span className="shrink-0 text-sm font-semibold text-wood-700">{type.price_eur} €</span>
                </button>
                {expanded && (
                  <div className="space-y-2 px-3 pb-3">
                    <p className="text-sm text-ink">{type.effect}</p>
                    <div className="flex flex-wrap gap-1.5">
                      {type.power && <Badge tone="gold">⚡ Électricité requise</Badge>}
                      {type.river && <Badge tone="neutral">🌊 Bord de rivière</Badge>}
                      {type.ease > 1 && <Badge tone="moss">Chantier rapide</Badge>}
                      {type.ease < 1 && <Badge tone="ember">Gros chantier</Badge>}
                      {needsBudget && <Badge tone="neutral">Validation de M. Lerme</Badge>}
                    </div>
                    {blocker ? (
                      <p className="text-sm font-semibold text-ember-700">{blocker}</p>
                    ) : (
                      <Button className="w-full" disabled={busy} onClick={() => void plan(type.id)}>
                        Poser le plan ici — 1 PA · {type.price_eur} €
                      </Button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </Card>
      </div>
    </Sheet>
  );
}
