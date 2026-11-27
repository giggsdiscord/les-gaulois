/**
 * Fiche d'un ouvrage de la carte (V4.7) : état en clair, prochaine étape (quoi faire, qui peut le
 * faire, bouton pour agir), chiffres clés (lits, état, avancement, courant, PLU) et les actions du
 * joueur qui portent sur cet ouvrage.
 */
import type { ActionDef } from '../engine.ts';
import { getAction } from '../engine.ts';
import type { Structure } from '../api/types.ts';
import { actionBlockReason, situationFor } from '../lib/actionHints.ts';
import { availableActions, STRUCTURE_ACTION_KINDS } from '../lib/game.ts';
import { STRUCTURE_STATUS } from '../lib/labels.ts';
import { buildingTypeOf, needsPower } from '../engine.ts';
import { nextStepFor, structureIcon, structureLabel } from '../lib/mapView.ts';
import { useData, useNow } from '../state/GameContext.tsx';
import { ActionRow } from './ActionSheet.tsx';
import { Badge, Button, Card, Sheet } from './ui.tsx';

function Fact({ label, value, tone }: { label: string; value: string; tone?: 'ember' | 'moss' }) {
  return (
    <div className="rounded-xl bg-parchment-100 px-3 py-2">
      <p className="text-[11px] uppercase tracking-wide text-ink-soft">{label}</p>
      <p className={tone === 'ember' ? 'font-semibold text-ember-700' : tone === 'moss' ? 'font-semibold text-moss-700' : 'font-semibold text-ink'}>{value}</p>
    </div>
  );
}

function Bar({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div>
      <div className="mb-1 flex justify-between text-xs text-ink-soft">
        <span>{label}</span>
        <span className="font-semibold text-ink">{Math.round(value)} %</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-parchment-200">
        <div className="h-full rounded-full" style={{ width: `${Math.max(0, Math.min(100, value))}%`, background: color }} />
      </div>
    </div>
  );
}

const LANDSCAPE = ['forest', 'river', 'track', 'square'];
const BUILDING_KINDS = ['building', 'gite', 'school', 'jail', 'lab', 'church', 'forge', 'border_post'];

export function StructureSheet({ structure: s, onClose, onAct }: { structure: Structure; onClose: () => void; onAct: (def: ActionDef) => void }) {
  const data = useData();
  const now = useNow(30_000);
  const v = data.village;
  const step = nextStepFor(s, data);
  const stepDef = step.actionCode && step.mine ? getAction(step.actionCode) : undefined;
  const situation = situationFor(data, null, now);
  const mine = availableActions(data.me, v.act_number).filter((a) => {
    if (a.target !== 'structure') return false;
    if (a.code === 'improve_own_housing' && buildingTypeOf(s)) return false;
    const kinds = STRUCTURE_ACTION_KINDS[a.code];
    return kinds ? kinds.includes(s.kind) : !['forest', 'river', 'square'].includes(s.kind);
  });
  const isBuilding = BUILDING_KINDS.includes(s.kind);
  const condition = s.kind === 'track' ? v.track_condition_pct : s.kind === 'pipe' ? v.water_network_condition_pct : s.condition_pct;

  return (
    <Sheet open onClose={onClose} title={`${structureIcon(s)} ${s.name}`}>
      <div className="space-y-4 pb-4">
        <div className="flex flex-wrap gap-1.5">
          <Badge tone="wood">{structureLabel(s)}</Badge>
          {!LANDSCAPE.includes(s.kind) && (
            <Badge tone={s.status === 'operational' ? 'moss' : s.status === 'ruin' || s.status === 'planned' ? 'neutral' : s.status === 'damaged' ? 'ember' : 'gold'}>{STRUCTURE_STATUS[s.status] ?? s.status}</Badge>
          )}
          {s.eco_veto_active && <Badge tone="moss">🐸 Veto écologique</Badge>}
          {s.leak_alert && <Badge tone="ember">💧 Fuite</Badge>}
        </div>

        <Card tone="moss" className="p-3!">
          <p className="text-xs font-bold uppercase tracking-wide text-moss-700">Prochaine étape</p>
          <p className="mt-1 text-sm leading-snug text-ink">{step.text}</p>
          {step.who && <p className="mt-1 text-xs text-ink-soft">{step.mine ? 'Vous pouvez le faire.' : `Qui : ${step.who}.`}</p>}
          {stepDef && (
            <Button className="mt-2 w-full" onClick={() => onAct(stepDef)}>
              {stepDef.label}
            </Button>
          )}
        </Card>

        {(isBuilding || ['pipe', 'track', 'livestock_pen', 'generator', 'solar', 'dam', 'power_line', 'watchtower', 'gate', 'mining_farm'].includes(s.kind)) && (
          <div className="grid grid-cols-2 gap-2">
            {s.beds_capacity > 0 && <Fact label={s.kind === 'gite' ? 'Lits du gîte' : 'Lits'} value={`${s.beds_capacity}`} />}
            {isBuilding && <Fact label="Courant" value={buildingTypeOf(s) && !needsPower(s) ? 'Pas besoin' : s.is_power_connected ? '⚡ Raccordée' : v.energy_tier >= 2 ? 'Non raccordée' : 'Pas d\'électricité'} tone={s.status === 'awaiting_power' ? 'ember' : s.is_power_connected ? 'moss' : undefined} />}
            {isBuilding && <Fact label="Permis (PLU)" value={s.plu_approved ? 'Accordé' : 'À obtenir'} tone={s.plu_approved ? 'moss' : undefined} />}
            {s.kind === 'gite' && <Fact label="Gîte" value={v.gite_open ? 'Ouvert' : 'Fermé'} tone={v.gite_open ? 'moss' : undefined} />}
          </div>
        )}

        <div className="space-y-3">
          {!['forest', 'river', 'square'].includes(s.kind) && <Bar label="État" value={condition} color={condition >= 60 ? '#4d7c0f' : condition >= 40 ? '#c8962e' : '#b3452c'} />}
          {s.status !== 'operational' && s.status !== 'awaiting_power' && !LANDSCAPE.includes(s.kind) && s.kind !== 'pipe' && <Bar label="Avancement du chantier" value={s.progress_pct} color="#c8962e" />}
        </div>

        {s.notes && <p className="text-sm text-ink-soft">{s.notes}</p>}

        {mine.length > 0 ? (
          <div>
            <p className="mb-2 text-sm font-semibold text-ink">Vos actions sur cet ouvrage</p>
            <Card flush className="divide-y divide-parchment-200">
              {mine.map((a) => (
                <ActionRow key={a.code} def={a} reason={actionBlockReason(a, situation)} onClick={() => onAct(a)} />
              ))}
            </Card>
          </div>
        ) : (
          <p className="text-sm text-ink-soft">Aucune de vos actions ne porte directement sur cet ouvrage.</p>
        )}
      </div>
    </Sheet>
  );
}
