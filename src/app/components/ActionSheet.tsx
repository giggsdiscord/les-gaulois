/** Formulaire d'exécution d'une action métier (cibles, montants, verrous, Action Libre IA). */
import { useMemo, useState } from 'react';
import { CATALOG, purchaseCost, type ActionDef, type VillageState } from '../engine.ts';
import type { ActionInput, OpResponse } from '../api/types.ts';
import { AMOUNT_ACTIONS, QUANTITY_ACTIONS, STRUCTURE_ACTION_KINDS } from '../lib/game.ts';
import { eur } from '../lib/format.ts';
import { MIGRANT_STATUS, STRUCTURE_STATUS } from '../lib/labels.ts';
import { useData, useGame } from '../state/GameContext.tsx';
import { Badge, Button, Field, Input, Select, Sheet, TextArea } from './ui.tsx';

const LANDSCAPE = ['forest', 'river', 'square', 'track'];

export function LockBadges({ def }: { def: ActionDef }) {
  return (
    <span className="flex flex-wrap gap-1">
      <Badge tone="wood">{def.apCost} PA</Badge>
      {def.requiresPlu && <Badge tone="river">Accord PLU</Badge>}
      {def.cost && <Badge tone="gold">Dépense caisse</Badge>}
      {def.ecoSensitive && <Badge tone="moss">Veto éco.</Badge>}
      {def.sundayOnly && <Badge>Dimanche</Badge>}
      {def.physical && <Badge tone="ember">Effort physique</Badge>}
      {def.minAct && def.minAct > 1 && <Badge>Acte {def.minAct}</Badge>}
    </span>
  );
}

export function ActionSheet({ def, holderId, preset, onClose }: { def: ActionDef; holderId: string | null; preset?: Partial<ActionInput>; onClose: () => void }) {
  const data = useData();
  const { api, perform, toast } = useGame();
  const [target, setTarget] = useState<string>(
    preset?.target_structure_id ?? preset?.target_player_id ?? (preset?.target_migrant_id ? `m:${preset.target_migrant_id}` : ''),
  );
  const [catalogId, setCatalogId] = useState(preset?.catalog_item_id ?? CATALOG[0]!.id);
  const [quantity, setQuantity] = useState(1);
  const [amount, setAmount] = useState(AMOUNT_ACTIONS[def.code]?.initial ?? 0);
  const [reason, setReason] = useState('');
  const [freeText, setFreeText] = useState('');
  const [partnerA, setPartnerA] = useState('');
  const [partnerB, setPartnerB] = useState('');
  const [busy, setBusy] = useState(false);

  const players = data.players.filter((p) => p.is_active_slot && (p.status === 'active' || p.status === 'forced_labor'));
  const residents = data.migrants.filter((m) => m.status === 'accepted' || m.status === 'forced_labor');
  const candidates = data.migrants.filter((m) => m.status === 'candidate');
  const structures = useMemo(() => {
    const kinds = STRUCTURE_ACTION_KINDS[def.code];
    return data.structures.filter((s) => (kinds ? kinds.includes(s.kind) : !LANDSCAPE.includes(s.kind)) && s.status !== 'demolished');
  }, [data.structures, def.code]);
  const item = CATALOG.find((c) => c.id === catalogId);
  const cost = item ? purchaseCost(item, quantity, data.village as unknown as VillageState) : 0;

  function buildInput(): ActionInput | string {
    const input: ActionInput = { action_code: def.code, on_behalf_of_id: holderId };
    switch (def.target) {
      case 'player':
        if (!target) return 'Choisissez un joueur.';
        input.target_player_id = target;
        break;
      case 'migrant':
        if (!target) return 'Choisissez un résident ou un candidat.';
        input.target_migrant_id = target.replace(/^m:/, '');
        break;
      case 'person':
        if (!target) return 'Choisissez une personne.';
        if (target.startsWith('m:')) input.target_migrant_id = target.slice(2);
        else input.target_player_id = target;
        break;
      case 'child':
        if (!target) return 'Choisissez un enfant.';
        input.target_child_id = target;
        break;
      case 'structure':
        if (!target) return 'Choisissez un ouvrage sur la carte.';
        input.target_structure_id = target;
        break;
      case 'catalog':
        input.catalog_item_id = catalogId;
        input.quantity = quantity;
        break;
      case 'none':
        break;
    }
    if (AMOUNT_ACTIONS[def.code]) input.amount_eur = amount;
    if (QUANTITY_ACTIONS[def.code] && def.target !== 'catalog') input.quantity = quantity;
    if (def.code === 'eco_veto') {
      if (reason.trim().length < 10) return 'Motivez votre veto (10 caractères minimum).';
      input.params = { reason: reason.trim() };
    }
    if (def.code === 'celebrate_marriage') {
      if (!partnerA || !partnerB) return 'Désignez les deux époux.';
      const side = (v: string, key: 'a' | 'b') => (v.startsWith('m:') ? { [`${key}_migrant`]: v.slice(2) } : { [`${key}_player`]: v });
      input.params = { ...side(partnerA, 'a'), ...side(partnerB, 'b') };
    }
    return input;
  }

  async function submit() {
    if (def.code === 'free_ai_action') {
      if (freeText.trim().length < 10) return toast('error', 'Décrivez votre action (10 caractères minimum).');
      setBusy(true);
      const r = await perform(() => api.freeAction(freeText.trim(), holderId), (res: OpResponse) => res.headline ?? 'Le Maître du Jeu a tranché.');
      setBusy(false);
      if (r) {
        toast('info', String(r.narrative ?? ''));
        onClose();
      }
      return;
    }
    const input = buildInput();
    if (typeof input === 'string') return toast('error', input);
    setBusy(true);
    const r = await perform(() => api.action(input), (res: OpResponse) => (res.status === 'pending_approval' ? undefined : String(res.narrative ?? 'Action effectuée.')));
    setBusy(false);
    if (r) {
      if (r.status === 'pending_approval') toast('info', String(r.narrative ?? 'Validation demandée.'));
      onClose();
    }
  }

  const personOptions = (
    <>
      <optgroup label="Fondateurs">
        {players.map((p) => (
          <option key={p.id} value={p.id}>
            {p.display_name} ({p.character_name})
          </option>
        ))}
      </optgroup>
      {residents.length > 0 && (
        <optgroup label="Résidents">
          {residents.map((m) => (
            <option key={m.id} value={`m:${m.id}`}>
              {m.full_name}
            </option>
          ))}
        </optgroup>
      )}
    </>
  );

  return (
    <Sheet open onClose={onClose} title={def.label}>
      <p className="mb-2 text-sm text-ink-soft">{def.description}</p>
      <div className="mb-4">
        <LockBadges def={def} />
      </div>
      <div className="space-y-3">
        {def.target === 'player' && (
          <Field label="Joueur ciblé">
            <Select value={target} onChange={(e) => setTarget(e.target.value)}>
              <option value="">— Choisir —</option>
              {players.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.display_name} ({p.character_name})
                </option>
              ))}
            </Select>
          </Field>
        )}
        {def.target === 'migrant' && (
          <Field label="Résident ou candidat">
            <Select value={target} onChange={(e) => setTarget(e.target.value)}>
              <option value="">— Choisir —</option>
              {[...candidates, ...residents].map((m) => (
                <option key={m.id} value={m.id}>
                  {m.full_name} — {MIGRANT_STATUS[m.status]}
                </option>
              ))}
            </Select>
          </Field>
        )}
        {def.target === 'person' && (
          <Field label="Personne ciblée">
            <Select value={target} onChange={(e) => setTarget(e.target.value)}>
              <option value="">— Choisir —</option>
              {personOptions}
            </Select>
          </Field>
        )}
        {def.target === 'child' && (
          <Field label="Enfant">
            <Select value={target} onChange={(e) => setTarget(e.target.value)}>
              <option value="">— Choisir —</option>
              {data.children.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.full_name} ({c.age_years} ans)
                </option>
              ))}
            </Select>
          </Field>
        )}
        {def.target === 'structure' && (
          <Field label="Ouvrage">
            <Select value={target} onChange={(e) => setTarget(e.target.value)}>
              <option value="">— Choisir —</option>
              {structures.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} — {STRUCTURE_STATUS[s.status]}
                  {s.progress_pct > 0 && s.progress_pct < 100 ? ` (${s.progress_pct} %)` : ''}
                </option>
              ))}
            </Select>
          </Field>
        )}
        {def.target === 'catalog' && (
          <>
            <Field label="Article">
              <Select value={catalogId} onChange={(e) => setCatalogId(e.target.value)}>
                {CATALOG.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.supplier} — {c.label} ({eur(c.price_eur)})
                  </option>
                ))}
              </Select>
            </Field>
            <p className="text-sm text-ink-soft">
              Total : <strong className="text-ink">{eur(cost, true)}</strong>
              {cost > 500 && ' — validation de M. Lerme requise au-delà de 500 €'}
              {data.village.track_condition_pct < 40 && ' — surcoût de 40 % (piste dégradée)'}
            </p>
          </>
        )}
        {(QUANTITY_ACTIONS[def.code] || def.target === 'catalog') && (
          <Field label={QUANTITY_ACTIONS[def.code]?.label ?? 'Quantité'}>
            <Input type="number" min={1} max={QUANTITY_ACTIONS[def.code]?.max ?? 20} value={quantity} onChange={(e) => setQuantity(Math.max(1, Number(e.target.value) || 1))} />
          </Field>
        )}
        {AMOUNT_ACTIONS[def.code] && (
          <Field label={AMOUNT_ACTIONS[def.code]!.label}>
            <Input type="number" min={AMOUNT_ACTIONS[def.code]!.min} max={AMOUNT_ACTIONS[def.code]!.max} step={AMOUNT_ACTIONS[def.code]!.step} value={amount} onChange={(e) => setAmount(Number(e.target.value))} />
          </Field>
        )}
        {def.code === 'eco_veto' && (
          <Field label="Motif du veto" hint="Ex. : famille de grenouilles protégées sur le tracé.">
            <TextArea value={reason} onChange={(e) => setReason(e.target.value)} />
          </Field>
        )}
        {def.code === 'celebrate_marriage' && (
          <>
            <Field label="Premier époux">
              <Select value={partnerA} onChange={(e) => setPartnerA(e.target.value)}>
                <option value="">— Choisir —</option>
                {personOptions}
              </Select>
            </Field>
            <Field label="Second époux">
              <Select value={partnerB} onChange={(e) => setPartnerB(e.target.value)}>
                <option value="">— Choisir —</option>
                {personOptions}
              </Select>
            </Field>
          </>
        )}
        {def.code === 'free_ai_action' && (
          <Field label="Décrivez votre action" hint="Le Maître du Jeu arbitre dans les bornes du moteur (réalisme strict, verrous respectés).">
            <TextArea maxLength={1000} value={freeText} onChange={(e) => setFreeText(e.target.value)} placeholder="Ex. : je descends à Organyà négocier un tarif de groupe sur le ciment avec le dépôt BigMat." />
          </Field>
        )}
        <Button className="w-full" size="lg" disabled={busy} onClick={() => void submit()}>
          {busy ? 'En cours…' : `Agir (${def.apCost} PA)`}
        </Button>
      </div>
    </Sheet>
  );
}
