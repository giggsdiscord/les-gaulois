/** Écran 4 — Trésorerie, réserves, catalogue fournisseurs et registres comptables. */
import { useMemo, useState } from 'react';
import { CATALOG, constants, getAction, purchaseCost, type CatalogItem, type VillageState } from '../engine.ts';
import { ActionSheet } from '../components/ActionSheet.tsx';
import { IncomeCard } from '../components/IncomeCard.tsx';
import { Badge, Button, Card, Empty, Gauge, SectionTitle, Sheet, Stat, Tabs, cx } from '../components/ui.tsx';
import { eur, num, dateTime } from '../lib/format.ts';
import { ACCOUNT_LABEL, ACT_LABEL, ENERGY_LABEL } from '../lib/labels.ts';
import { playerName } from '../lib/game.ts';
import { reserveReport, type ReserveLine, type ReserveSource } from '../lib/reserves.ts';
import { useData, useNow } from '../state/GameContext.tsx';

type Tab = 'finances' | 'fournisseurs' | 'registre';

function AutonomyCard() {
  const v = useData().village;
  const { act2, act3 } = constants.ACT_THRESHOLDS;
  const next = v.act_number === 1 ? act2 : v.act_number === 2 ? act3 : null;
  return (
    <Card title={ACT_LABEL[v.act_number]} subtitle={next ? `Prochain acte à ${next} % d'autonomie` : 'Dernier acte atteint'}>
      <div className="relative mb-1 h-4 overflow-hidden rounded-full bg-parchment-200">
        <div className="h-full rounded-full bg-gradient-to-r from-wood-500 to-moss-600 transition-all" style={{ width: `${Math.min(100, v.autonomy_pct)}%` }} />
        {[act2, act3].map((t) => (
          <span key={t} className="absolute top-0 h-full w-0.5 bg-ink/60" style={{ left: `${t}%` }} />
        ))}
      </div>
      <div className="flex justify-between text-xs text-ink-soft">
        <span>0 %</span>
        <span className="font-semibold text-ink">Autonomie {Math.round(v.autonomy_pct)} %</span>
        <span>100 %</span>
      </div>
      <p className="mt-2 text-xs text-ink-soft">
        Énergie : {ENERGY_LABEL[v.energy_tier]} (palier {v.energy_tier}/5){v.dam_progress_pct > 0 ? ` · barrage ${Math.round(v.dam_progress_pct)} %` : ''}.
      </p>
    </Card>
  );
}

/** Détail d'une réserve : d'où elle vient, où elle part, combien de temps elle tient, comment en avoir. */
function ReserveSheet({ line, onClose, onAct }: { line: ReserveLine; onClose: () => void; onAct: (source: ReserveSource) => void }) {
  return (
    <Sheet open onClose={onClose} title={`${line.emoji} ${line.label} : ${line.display}`}>
      <div className="space-y-4 pb-4 text-sm leading-relaxed text-ink">
        <div>
          <h3 className="font-semibold">Chaque jour</h3>
          <ul className="mt-1 list-disc space-y-1 pl-5 text-ink-soft">
            {line.daily.map((d) => (
              <li key={d}>{d}</li>
            ))}
          </ul>
        </div>
        <div>
          <h3 className="font-semibold">À quoi ça sert</h3>
          <ul className="mt-1 list-disc space-y-1 pl-5 text-ink-soft">
            {line.uses.map((d) => (
              <li key={d}>{d}</li>
            ))}
          </ul>
        </div>
        <div>
          <h3 className="font-semibold">Comment s'en procurer</h3>
          <ul className="mt-1 space-y-2">
            {line.sources.map((src) => (
              <li key={src.label} className="rounded-xl bg-parchment-100 px-3 py-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-semibold leading-snug">{src.label}</p>
                    <p className="text-ink-soft">{src.detail}</p>
                    <p className="text-xs text-ink-soft">{src.mine ? 'Vous pouvez le faire' : `Qui : ${src.who}`}</p>
                  </div>
                  {src.actionCode && src.mine && (
                    <Button size="sm" className="shrink-0" onClick={() => onAct(src)}>
                      {src.actionCode === 'buy_supplies' ? 'Commander' : 'Faire'}
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </Sheet>
  );
}

/** « Réserves du hameau » : quantité, rythme de consommation, et le détail en un appui (V4.6). */
function ReservesCard() {
  const data = useData();
  const now = useNow(60_000);
  const lines = useMemo(() => reserveReport(data, now), [data, now]);
  const [open, setOpen] = useState<ReserveLine | null>(null);
  const [action, setAction] = useState<ReserveSource | null>(null);
  const def = action?.actionCode ? getAction(action.actionCode) : undefined;
  return (
    <Card title="Réserves du hameau" subtitle="Touchez une réserve : rythme, durée, comment en avoir.">
      <div className="grid grid-cols-3 gap-2">
        {lines.map((l) => (
          <button
            key={l.key}
            onClick={() => setOpen(l)}
            className={cx('rounded-xl px-1.5 py-2 text-center active:brightness-95', l.low ? 'bg-ember-100' : 'bg-parchment-100')}
          >
            <p className="text-lg leading-none">{l.emoji}</p>
            <p className="mt-1 font-semibold tabular-nums">{l.display}</p>
            <p className="text-[11px] text-ink-soft">{l.label}</p>
            <p className={cx('mt-0.5 text-[10px] leading-tight', l.perDay !== null && l.perDay < 0 ? 'text-ember-700' : 'text-ink-soft')}>{l.rate}</p>
            {l.daysLeft !== null && l.key !== 'tools' && <p className="text-[10px] font-semibold leading-tight text-ink">≈ {l.daysLeft} j</p>}
          </button>
        ))}
      </div>
      {open && !action && <ReserveSheet line={open} onClose={() => setOpen(null)} onAct={(src) => setAction(src)} />}
      {action && def && (
        <ActionSheet
          def={def}
          holderId={null}
          preset={action.preset}
          onClose={() => {
            setAction(null);
            setOpen(null);
          }}
        />
      )}
    </Card>
  );
}

function Finances() {
  const data = useData();
  const v = data.village;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="Caisse commune" value={eur(v.treasury_eur)} tone={v.treasury_eur < 0 ? 'ember' : 'moss'} />
        <Stat label="Dette foncière" value={eur(v.land_debt_eur)} sub={v.missed_loan_payments > 0 ? `${v.missed_loan_payments} échéance(s) manquée(s)` : 'échéances à jour'} tone={v.missed_loan_payments > 0 ? 'ember' : undefined} />
        <Stat label="Fonds souverain" value={eur(v.sovereign_fund_eur)} />
        <Stat label="Réserves crypto" value={eur(v.crypto_reserves_eur)} sub={v.crypto_mining_active ? 'minage actif' : 'minage à l\'arrêt'} />
      </div>
      {v.collectivization_active && <Card tone="danger">Collectivisation en vigueur : les comptes privés sont réquisitionnés au profit de la caisse commune.</Card>}
      <AutonomyCard />
      <ReservesCard />
      <IncomeCard />
      <Card title="Indicateurs économiques">
        <div className="grid gap-3 sm:grid-cols-2">
          <Gauge label="Productivité" value={Math.round(v.productivity_modifier_pct)} good="neutral" max={150} />
          <Gauge label="Pression administrative" value={Math.round(v.admin_pressure_pct)} good="low" />
          <Gauge label="Notoriété internationale" value={Math.round(v.international_notoriety_pct)} />
          <Gauge label="Espagnol courant" value={Math.round(v.spanish_fluency_pct)} />
        </div>
        <p className="mt-3 text-xs text-ink-soft">
          Franchise Carlage : {eur(v.carlage_injury_fee_eur)} par blessure · Gîte {v.gite_open ? 'ouvert' : 'fermé'} · {v.rationing_active ? 'Rationnement en vigueur' : 'Pas de rationnement'}
        </p>
      </Card>
    </div>
  );
}

function Suppliers() {
  const data = useData();
  const [item, setItem] = useState<CatalogItem | null>(null);
  const def = getAction('buy_supplies');
  const v = data.village as unknown as VillageState;
  const groups = useMemo(() => {
    const map = new Map<string, CatalogItem[]>();
    for (const c of CATALOG) map.set(c.supplier, [...(map.get(c.supplier) ?? []), c]);
    return [...map.entries()];
  }, []);
  const budget = data.approvals.filter((a) => a.kind === 'budget' && a.status === 'pending');
  return (
    <div className="space-y-4">
      {data.village.track_condition_pct < 40 && <Card tone="warning">Piste dégradée ({Math.round(data.village.track_condition_pct)} %) : livraisons majorées de 40 %.</Card>}
      {budget.length > 0 && (
        <Card title="Dépenses en attente de M. Lerme" tone="river">
          <ul className="space-y-1 text-sm">
            {budget.map((a) => (
              <li key={a.id}>
                {eur(a.amount_eur ?? 0)} — demandé par {playerName(data.players, a.requested_by)} le {dateTime(a.created_at)}
              </li>
            ))}
          </ul>
        </Card>
      )}
      <p className="text-sm text-ink-soft">Toute commande coûte 1 PA. Au-delà de 500 €, elle attend la validation du Trésorier.</p>
      {groups.map(([supplier, items]) => (
        <section key={supplier}>
          <SectionTitle>{supplier}</SectionTitle>
          <div className="space-y-2">
            {items.map((c) => {
              const price = purchaseCost(c, 1, v);
              return (
                <Card key={c.id}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-semibold leading-snug">{c.label}</p>
                      <p className="text-xs text-ink-soft">
                        {c.kind === 'rental' ? 'Location' : 'Achat'} · {c.unit}
                        {c.customs_sensitive && ' · attention à la douane'}
                      </p>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {Object.entries(c.effects).map(([k, val]) => (
                          <Badge key={k} tone="moss">
                            {k.replace(/_(stock|pct|l|days)$/, '').replace(/_/g, ' ')} {Number(val) > 0 ? '+' : ''}
                            {String(val)}
                          </Badge>
                        ))}
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="font-serif text-lg tabular-nums">{eur(price)}</p>
                      {price !== c.price_eur && <p className="text-xs text-ink-soft line-through">{eur(c.price_eur)}</p>}
                      <Button size="sm" className="mt-1" onClick={() => setItem(c)}>
                        Commander
                      </Button>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        </section>
      ))}
      {item && def && <ActionSheet def={def} holderId={null} preset={{ catalog_item_id: item.id }} onClose={() => setItem(null)} />}
    </div>
  );
}

function Ledger() {
  const data = useData();
  const [account, setAccount] = useState<string>('all');
  const accounts = useMemo(() => ['all', ...new Set(data.ledger.map((l) => l.account))], [data.ledger]);
  const rows = data.ledger.filter((l) => account === 'all' || l.account === account);
  const priv = data.privateLedger;
  return (
    <div className="space-y-4">
      <Card title="Registre public">
        <div className="no-scrollbar mb-3 flex gap-1.5 overflow-x-auto">
          {accounts.map((a) => (
            <button key={a} onClick={() => setAccount(a)} className={cx('shrink-0 rounded-full px-3 py-1 text-xs font-semibold', account === a ? 'bg-wood-700 text-parchment-50' : 'bg-parchment-200 text-ink')}>
              {a === 'all' ? 'Tout' : ACCOUNT_LABEL[a] ?? a}
            </button>
          ))}
        </div>
        {rows.length === 0 ? (
          <Empty>Aucune écriture.</Empty>
        ) : (
          <ul className="divide-y divide-parchment-200">
            {rows.slice(0, 80).map((l) => (
              <li key={l.id} className="flex items-start justify-between gap-3 py-2 text-sm">
                <span className="min-w-0">
                  <span className="block leading-snug">{l.label}</span>
                  <span className="text-xs text-ink-soft">
                    {dateTime(l.created_at)} · {ACCOUNT_LABEL[l.account] ?? l.account}
                    {l.supplier ? ` · ${l.supplier}` : ''}
                    {l.player_id ? ` · ${playerName(data.players, l.player_id)}` : ''}
                  </span>
                </span>
                <span className={cx('shrink-0 font-semibold tabular-nums', l.amount_eur < 0 ? 'text-ember-600' : 'text-moss-700')}>{eur(l.amount_eur, true)}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <Card title="🔒 Comptes privés" subtitle={priv.wealth.length > 1 ? 'Vue du Trésorier : tous les patrimoines.' : 'Visible de vous seul (et du Trésorier).'}>
        <ul className="mb-3 space-y-1 text-sm">
          {priv.wealth.map((w) => (
            <li key={w.player_id} className="flex justify-between">
              <span>{w.display_name}</span>
              <span className="tabular-nums">
                {eur(w.private_wealth_eur)} <span className="text-xs text-ink-soft">· {num(w.power_kwh_used)} kWh</span>
              </span>
            </li>
          ))}
        </ul>
        {priv.entries.length > 0 && (
          <ul className="divide-y divide-parchment-200 text-sm">
            {priv.entries.slice(0, 40).map((l) => (
              <li key={l.id} className="flex justify-between gap-3 py-1.5">
                <span className="min-w-0">
                  {l.label} <span className="text-xs text-ink-soft">· {dateTime(l.created_at)}</span>
                </span>
                <span className={cx('shrink-0 tabular-nums', l.amount_eur < 0 ? 'text-ember-600' : 'text-moss-700')}>{eur(l.amount_eur, true)}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

export function TreasuryScreen() {
  const [tab, setTab] = useState<Tab>('finances');
  return (
    <div>
      <Tabs<Tab>
        value={tab}
        onChange={setTab}
        tabs={[
          { id: 'finances', label: 'Finances' },
          { id: 'fournisseurs', label: 'Fournisseurs' },
          { id: 'registre', label: 'Registres' },
        ]}
      />
      {tab === 'finances' && <Finances />}
      {tab === 'fournisseurs' && <Suppliers />}
      {tab === 'registre' && <Ledger />}
    </div>
  );
}
