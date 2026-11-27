/**
 * Fenêtre d'une action métier (cibles, montants, verrous, Action Libre IA). V4.4 : raison de blocage
 * affichée avant de jouer, explications des verrous en clair, choix au pouce (joueurs, quantités),
 * bouton collé en bas et résultat affiché dans la fenêtre (avec « Refaire »).
 */
import { useMemo, useState } from 'react';
import { buildingTypeOf, CATALOG, constants, findCollectiveProject, freeParcels, lifeOf, planBlocker, marketQuote, purchaseCost, type ActionDef, type VillageState } from '../engine.ts';
import type { ActionInput, OpResponse } from '../api/types.ts';
import { actionBlockReason, lockNotes, situationFor } from '../lib/actionHints.ts';
import { AMOUNT_ACTIONS, QUANTITY_ACTIONS, STRUCTURE_ACTION_KINDS } from '../lib/game.ts';
import { eur } from '../lib/format.ts';
import { MIGRANT_STATUS, SPECIALTY_LABEL, STRUCTURE_STATUS } from '../lib/labels.ts';
import { useData, useGame, useNow } from '../state/GameContext.tsx';
import { Avatar, Badge, Button, Field, Input, Segmented, Select, Sheet, Stepper, TextArea, cx } from './ui.tsx';

const LANDSCAPE = ['forest', 'river', 'square', 'track'];

/** Pastilles des verrous ; `ap` ajoute le coût en PA. */
export function LockBadges({ def, ap = true }: { def: ActionDef; ap?: boolean }) {
  return (
    <span className="flex flex-wrap gap-1">
      {ap && <Badge tone="wood">{def.apCost === 0 ? 'Gratuit' : `${def.apCost} PA`}</Badge>}
      {def.requiresPlu && <Badge tone="river">Accord PLU</Badge>}
      {def.cost && <Badge tone="gold">Caisse</Badge>}
      {def.ecoSensitive && <Badge tone="moss">🐸 Veto éco.</Badge>}
      {def.sundayOnly && <Badge>Dimanche</Badge>}
      {def.physical && <Badge tone="ember">Physique</Badge>}
    </span>
  );
}

/** Pastille de coût en PA (droite des lignes d'action). */
export function ApPill({ cost, dim }: { cost: number; dim?: boolean }) {
  return (
    <span className={cx('shrink-0 rounded-full px-2.5 py-1 text-xs font-bold tabular-nums', dim ? 'bg-parchment-200 text-ink-soft' : cost === 0 ? 'bg-moss-100 text-moss-700' : 'bg-gold-100 text-wood-700')}>
      {cost === 0 ? 'Gratuit' : `${cost} PA`}
    </span>
  );
}

/** Ligne d'action touchable (menu Métier, recherche, carte). */
export function ActionRow({ def, reason, onClick }: { def: ActionDef; reason: string | null; onClick: () => void }) {
  return (
    <button onClick={onClick} className="flex w-full items-center gap-3 px-4 py-3 text-left active:bg-parchment-100">
      <span className={cx('min-w-0 flex-1', reason && 'opacity-60')}>
        <span className="block font-semibold leading-snug text-ink">{def.label}</span>
        <span className="mt-0.5 line-clamp-2 block text-sm leading-snug text-ink-soft">{def.description}</span>
        {reason ? (
          <span className="mt-1 block text-xs font-semibold text-ember-600">⛔ {reason}</span>
        ) : (
          <span className="mt-1.5 block">
            <LockBadges def={def} ap={false} />
          </span>
        )}
      </span>
      <ApPill cost={def.apCost} dim={reason !== null} />
    </button>
  );
}

interface Outcome {
  pending: boolean;
  headline: string | null;
  text: string;
}

export function ActionSheet({
  def,
  holderId,
  preset,
  onClose,
  onSuccess,
}: {
  def: ActionDef;
  holderId: string | null;
  preset?: Partial<ActionInput>;
  onClose: () => void;
  /** Appelé après une action réussie (actions récentes). */
  onSuccess?: (code: string) => void;
}) {
  const data = useData();
  const { api, perform, toast } = useGame();
  const now = useNow(30_000);
  const [target, setTarget] = useState<string>(
    preset?.target_structure_id ?? preset?.target_player_id ?? (preset?.target_migrant_id ? `m:${preset.target_migrant_id}` : ''),
  );
  const [catalogId, setCatalogId] = useState(preset?.catalog_item_id ?? CATALOG[0]!.id);
  const [marketId, setMarketId] = useState(preset?.catalog_item_id && def.target === 'market' ? preset.catalog_item_id : constants.MARKET_ITEMS[0]!.id);
  const [quantity, setQuantity] = useState(1);
  const amountConf = AMOUNT_ACTIONS[def.code];
  const isTransfer = def.code === 'transfer_sovereign_fund';
  const [amount, setAmount] = useState(amountConf?.initial ?? 0);
  const [direction, setDirection] = useState<'in' | 'out'>('in');
  const [reason, setReason] = useState('');
  const [workPost, setWorkPost] = useState(typeof preset?.params?.post === 'string' ? preset.params.post : constants.WORK_POSTS[0]!.code);
  const [voteProject, setVoteProject] = useState(typeof preset?.params?.project === 'string' ? preset.params.project : '');
  const parcels = freeParcels(data);
  const [buildVariant, setBuildVariant] = useState(typeof preset?.params?.variant === 'string' ? preset.params.variant : '');
  const [buildParcel, setBuildParcel] = useState(typeof preset?.params?.parcel === 'string' ? preset.params.parcel : '');
  const voteChoices = (lifeOf(data.village).collective_candidates ?? []).map((id) => findCollectiveProject(id)).filter((p) => p !== undefined);
  const [freeText, setFreeText] = useState('');
  const [partnerA, setPartnerA] = useState('');
  const [partnerB, setPartnerB] = useState('');
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<Outcome | null>(null);

  const situation = situationFor(data, holderId, now);
  const blocked = actionBlockReason(def, situation);
  const notes = lockNotes(def, situation.holder.role_code);
  const players = data.players.filter((p) => p.is_active_slot && (p.status === 'active' || p.status === 'forced_labor'));
  const residents = data.migrants.filter((m) => m.status === 'accepted' || m.status === 'forced_labor');
  const candidates = data.migrants.filter((m) => m.status === 'candidate');
  const structures = useMemo(() => {
    const kinds = STRUCTURE_ACTION_KINDS[def.code];
    return data.structures.filter(
      (s) => (kinds ? kinds.includes(s.kind) : !LANDSCAPE.includes(s.kind)) && s.status !== 'demolished' && !(def.code === 'improve_own_housing' && buildingTypeOf(s)),
    );
  }, [data.structures, def.code]);
  const item = CATALOG.find((c) => c.id === catalogId);
  const cost = item ? purchaseCost(item, quantity, data.village as unknown as VillageState) : 0;
  const quote = def.target === 'market' ? marketQuote(data.village as unknown as VillageState, marketId, quantity, now) : null;

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
      case 'market':
        input.catalog_item_id = marketId;
        input.quantity = quantity;
        break;
      case 'none':
        break;
    }
    if (amountConf) input.amount_eur = isTransfer && direction === 'out' ? -amount : amount;
    if (QUANTITY_ACTIONS[def.code] && def.target !== 'catalog' && def.target !== 'market') input.quantity = quantity;
    if (def.code === 'eco_veto' || def.code === 'forest_ban') {
      if (reason.trim().length < 10) return def.code === 'eco_veto' ? 'Motivez votre veto (10 caractères minimum).' : 'Motivez l\'interdiction (10 caractères minimum).';
      input.params = { reason: reason.trim() };
    }
    if (def.code === 'assign_work_post') input.params = { post: workPost };
    if (def.code === 'vote_collective_project') {
      const choice = voteProject || voteChoices[0]?.id;
      if (!choice) return 'Aucun projet à voter pour l\'instant.';
      input.params = { project: choice };
    }
    if (def.code === 'plan_building') {
      const why = planBlocker(data, buildVariant, buildParcel);
      if (why) return buildVariant && buildParcel ? why : 'Choisissez un bâtiment et une parcelle libre.';
      input.params = { variant: buildVariant, parcel: buildParcel };
    }
    if (def.code === 'celebrate_marriage') {
      if (!partnerA || !partnerB) return 'Désignez les deux époux.';
      const side = (v: string, key: 'a' | 'b') => (v.startsWith('m:') ? { [`${key}_migrant`]: v.slice(2) } : { [`${key}_player`]: v });
      input.params = { ...side(partnerA, 'a'), ...side(partnerB, 'b') };
    }
    return input;
  }

  async function submit() {
    let r: OpResponse | undefined;
    if (def.code === 'free_ai_action') {
      if (freeText.trim().length < 10) return toast('error', 'Décrivez votre action (10 caractères minimum).');
      setBusy(true);
      r = await perform(() => api.freeAction(freeText.trim(), holderId));
    } else {
      const input = buildInput();
      if (typeof input === 'string') return toast('error', input);
      setBusy(true);
      r = await perform(() => api.action(input));
    }
    setBusy(false);
    if (!r) return;
    onSuccess?.(def.code);
    const pending = r.status === 'pending_approval';
    setOutcome({ pending, headline: r.headline ?? null, text: String(r.narrative ?? (pending ? 'Validation demandée.' : 'Action effectuée.')) });
  }

  const again = () => {
    setOutcome(null);
    setFreeText('');
  };

  if (outcome) {
    const canAgain = !outcome.pending && actionBlockReason(def, situation) === null;
    return (
      <Sheet
        open
        onClose={onClose}
        title={def.label}
        footer={
          <div className={cx('grid gap-2', canAgain && 'grid-cols-2')}>
            {canAgain && (
              <Button variant="secondary" onClick={again}>
                Refaire ({def.apCost === 0 ? 'gratuit' : `${def.apCost} PA`})
              </Button>
            )}
            <Button onClick={onClose}>Fermer</Button>
          </div>
        }
      >
        <div className="pb-4 text-center">
          <p className="text-4xl" aria-hidden="true">
            {outcome.pending ? '⏳' : '✅'}
          </p>
          <p className="mt-1 font-serif text-lg">{outcome.headline ?? (outcome.pending ? 'En attente de validation' : 'Action réussie')}</p>
          <p className="mt-3 whitespace-pre-line text-left text-[15px] leading-relaxed text-ink">{outcome.text}</p>
          <p className="mt-4 rounded-xl bg-parchment-100 px-3 py-2 text-sm font-semibold tabular-nums">
            ⚡ {situation.viaDelegation ? `Il reste ${situation.holder.action_points} PA au poste de ${situation.holder.display_name}` : `Il vous reste ${situation.holder.action_points} PA aujourd'hui`}
          </p>
        </div>
      </Sheet>
    );
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

  const submitLabel = busy ? 'En cours…' : blocked ? blocked : `Agir (${def.apCost === 0 ? 'gratuit' : `${def.apCost} PA`})`;

  return (
    <Sheet
      open
      onClose={onClose}
      title={def.label}
      footer={
        <Button className="w-full" size="lg" disabled={busy || blocked !== null} onClick={() => void submit()}>
          {submitLabel}
        </Button>
      }
    >
      <p className="mb-2 text-sm text-ink-soft">{def.description}</p>
      <div className="mb-3">
        <LockBadges def={def} />
      </div>
      {blocked && <p className="mb-3 rounded-xl bg-ember-100 px-3 py-2 text-sm font-semibold text-ember-600">⛔ {blocked}</p>}
      {situation.viaDelegation && (
        <p className="mb-3 rounded-xl bg-gold-100 px-3 py-2 text-sm">
          Vous agissez pour le poste de <strong>{situation.holder.display_name}</strong> (ses PA).
        </p>
      )}
      <div className="space-y-4 pb-4">
        {def.target === 'player' && (
          <Field label="Joueur ciblé">
            <div className="grid grid-cols-2 gap-2">
              {players.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setTarget(p.id)}
                  aria-pressed={target === p.id}
                  className={cx('flex min-h-12 items-center gap-2 rounded-xl border px-2.5 py-2 text-left text-sm', target === p.id ? 'border-wood-600 bg-wood-600/10 font-semibold' : 'border-parchment-300 bg-white')}
                >
                  <Avatar emoji={p.avatar_emoji} color={p.avatar_color} size="sm" />
                  <span className="min-w-0 truncate">{p.display_name}</span>
                </button>
              ))}
            </div>
          </Field>
        )}
        {def.target === 'migrant' && (
          <Field label={def.code === 'assign_work_post' ? 'Résident' : 'Résident ou candidat'}>
            <Select value={target} onChange={(e) => setTarget(e.target.value)}>
              <option value="">— Choisir —</option>
              {[...(def.code === 'assign_work_post' ? [] : candidates), ...residents].map((m) => (
                <option key={m.id} value={`m:${m.id}`}>
                  {m.full_name} — {def.code === 'assign_work_post' ? `${SPECIALTY_LABEL[m.specialty_code]} ${m.specialty_level}` : MIGRANT_STATUS[m.status]}
                </option>
              ))}
            </Select>
          </Field>
        )}
        {def.code === 'plan_building' && (
          <>
            <Field label="Bâtiment" hint={constants.BUILDING_TYPES.find((b) => b.id === buildVariant)?.effect}>
              <Select value={buildVariant} onChange={(e) => setBuildVariant(e.target.value)}>
                <option value="">— Choisir —</option>
                {constants.BUILDING_TYPES.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.icon} {b.label} — {b.price_eur} €{b.river ? ' (bord de rivière)' : ''}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Parcelle libre" hint={buildVariant && buildParcel ? planBlocker(data, buildVariant, buildParcel) ?? 'Possible.' : 'Les parcelles libres sont aussi sur la carte (« + »).'}>
              <Select value={buildParcel} onChange={(e) => setBuildParcel(e.target.value)}>
                <option value="">— Choisir —</option>
                {parcels.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}{p.river ? ' 🌊' : ''}
                  </option>
                ))}
              </Select>
            </Field>
          </>
        )}
        {def.code === 'vote_collective_project' && voteChoices.length > 0 && (
          <Field label="Projet pour la semaine prochaine" hint={voteChoices.find((p) => p.id === (voteProject || voteChoices[0]!.id))?.summary}>
            <Select value={voteProject || voteChoices[0]!.id} onChange={(e) => setVoteProject(e.target.value)}>
              {voteChoices.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.icon} {p.label}
                </option>
              ))}
            </Select>
          </Field>
        )}
        {def.code === 'assign_work_post' && (
          <Field label="Poste" hint={constants.WORK_POSTS.find((p) => p.code === workPost)?.summary}>
            <Select value={workPost} onChange={(e) => setWorkPost(e.target.value as typeof workPost)}>
              {constants.WORK_POSTS.map((p) => (
                <option key={p.code} value={p.code}>
                  {p.icon} {p.label}
                </option>
              ))}
              <option value="none">Aucun poste</option>
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
                  {s.eco_veto_active ? ' 🐸' : ''}
                </option>
              ))}
            </Select>
          </Field>
        )}
        {def.target === 'catalog' && (
          <Field label="Article">
            <Select value={catalogId} onChange={(e) => setCatalogId(e.target.value)}>
              {CATALOG.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.supplier} — {c.label} ({eur(c.price_eur)})
                </option>
              ))}
            </Select>
          </Field>
        )}
        {def.target === 'market' && quote && (
          <>
            <Field label="Produit">
              <Select value={marketId} onChange={(e) => setMarketId(e.target.value)}>
                {constants.MARKET_ITEMS.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label} — lot de {m.lot} {m.unit} (réserve : {Math.floor(Number(data.village[m.stock]))})
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={`Nombre de lots de ${quote.item.lot} ${quote.item.unit}`}>
              <Stepper value={quantity} onChange={setQuantity} min={1} max={20} />
            </Field>
            <p className="rounded-xl bg-parchment-100 px-3 py-2 text-sm text-ink-soft">
              {quote.units} {quote.item.unit} à {eur(quote.unitPrice, true)} : <strong className="text-ink">+{eur(quote.total, true)}</strong> pour la caisse
              {quote.saturday ? ' — jour de marché, +30 %' : ' — +30 % le samedi, jour de marché'}. Le marché en prendra encore {quote.remaining} {quote.item.unit} cette semaine.
              {quote.units > quote.available && <span className="block font-semibold text-ember-600">Réserve insuffisante : {quote.available} {quote.item.unit}.</span>}
              {quote.units > quote.remaining && <span className="block font-semibold text-ember-600">C'est plus que ce que le marché prendra cette semaine.</span>}
            </p>
          </>
        )}
        {(QUANTITY_ACTIONS[def.code] || def.target === 'catalog') && (
          <Field label={QUANTITY_ACTIONS[def.code]?.label ?? 'Quantité'}>
            <Stepper value={quantity} onChange={setQuantity} min={1} max={QUANTITY_ACTIONS[def.code]?.max ?? 20} />
          </Field>
        )}
        {def.target === 'catalog' && (
          <p className="rounded-xl bg-parchment-100 px-3 py-2 text-sm text-ink-soft">
            Total : <strong className="text-ink">{eur(cost, true)}</strong>
            {cost > 500 && ' — validation de M. Lerme requise au-delà de 500 €'}
            {data.village.track_condition_pct < 40 && ' — surcoût de 40 % (piste dégradée)'}
          </p>
        )}
        {isTransfer && (
          <Segmented<'in' | 'out'>
            value={direction}
            onChange={setDirection}
            options={[
              { id: 'in', label: 'Caisse → fonds' },
              { id: 'out', label: 'Fonds → caisse' },
            ]}
          />
        )}
        {amountConf && (
          <Field label={isTransfer ? 'Montant (€)' : amountConf.label}>
            <Input
              type="number"
              inputMode="numeric"
              min={isTransfer ? amountConf.step : amountConf.min}
              max={amountConf.max}
              step={amountConf.step}
              value={amount}
              onChange={(e) => setAmount(Math.abs(Number(e.target.value)) || 0)}
            />
          </Field>
        )}
        {def.code === 'eco_veto' && (
          <Field label="Motif du veto" hint="Ex. : famille de grenouilles protégées sur le tracé.">
            <TextArea value={reason} onChange={(e) => setReason(e.target.value)} />
          </Field>
        )}
        {def.code === 'forest_ban' && (
          <Field label="Motif de l'interdiction" hint="Ex. : trop de souches cette semaine, la forêt doit se reposer.">
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
          <Field label="Décrivez votre action" hint={`${freeText.trim().length}/1000 — le Maître du Jeu arbitre dans les bornes du moteur (réalisme strict, verrous respectés).`}>
            <TextArea maxLength={1000} value={freeText} onChange={(e) => setFreeText(e.target.value)} placeholder="Ex. : je descends à Organyà négocier un tarif de groupe sur le ciment avec le dépôt BigMat." />
          </Field>
        )}
        {notes.length > 0 && (
          <div className="rounded-xl border border-parchment-200 bg-white/70 px-3 py-2">
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-ink-soft">Bon à savoir</p>
            <ul className="space-y-1 text-sm text-ink-soft">
              {notes.map((n) => (
                <li key={n}>• {n}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Sheet>
  );
}
