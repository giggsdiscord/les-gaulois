/**
 * Fonds souverain placé sur les marchés (V6.2) : liquidités + ETF qui suivent les cours réels (relevés la
 * nuit ; simulés en démo), variation du jour, parts, valeur, plus-value, courbes, achat / vente par le
 * trésorier. Trésor → Finances. C'est un jeu : aucune vraie transaction.
 */
import { useMemo, useState } from 'react';
import { constants as C } from '../engine.ts';
import { eur } from '../lib/format.ts';
import { buyEstimate, fundView, sparkPoints, type EtfRow } from '../lib/funds.ts';
import { useData, useGame, useNow } from '../state/GameContext.tsx';
import { Badge, Button, Card, Field, Input, Sheet, cx } from './ui.tsx';

type Mode = 'buy' | 'sell' | 'deposit';

function Spark({ values, className }: { values: readonly number[]; className?: string }) {
  const pts = sparkPoints(values, 100, 28);
  if (!pts) return null;
  const up = values[values.length - 1]! >= values[0]!;
  return (
    <svg viewBox="0 0 100 28" preserveAspectRatio="none" className={cx('h-7 w-full', className)} aria-hidden>
      <polyline points={pts} fill="none" strokeWidth={1.5} vectorEffect="non-scaling-stroke" className={up ? 'stroke-moss-600' : 'stroke-ember-600'} />
    </svg>
  );
}

const signed = (n: number) => `${n >= 0 ? '+' : '−'}${eur(Math.abs(n))}`;
const signedPct = (n: number | null) => (n === null ? '—' : `${n >= 0 ? '+' : '−'}${Math.abs(n).toFixed(1).replace('.', ',')} %`);

export function FundCard() {
  const data = useData();
  const { api, perform, toast } = useGame();
  const now = useNow(60_000);
  const view = useMemo(() => fundView(data.village, now), [data.village, now]);
  const keeper = data.me.role_code === 'treasurer_physio';
  const [trade, setTrade] = useState<{ mode: Mode; row: EtfRow | null } | null>(null);
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);

  function open(mode: Mode, row: EtfRow | null) {
    setAmount(mode === 'sell' ? '' : String(mode === 'buy' ? Math.min(500, Math.max(C.ETF_MIN_ORDER_EUR, Math.floor(view.cash))) : 500));
    setTrade({ mode, row });
  }

  async function submit() {
    if (!trade) return;
    const value = Number(amount.replace(',', '.')) || 0;
    const code = trade.mode === 'buy' ? 'buy_etf' : trade.mode === 'sell' ? 'sell_etf' : 'transfer_sovereign_fund';
    setBusy(true);
    const r = await perform(
      () => api.action({ action_code: code, params: trade.row ? { etf: trade.row.def.id } : {}, amount_eur: trade.mode === 'sell' && value <= 0 ? null : value }),
      (res) => (res.ok ? res.narrative ?? 'C’est fait.' : undefined),
    );
    setBusy(false);
    if (r && !r.ok) toast('error', r.error ?? 'Ordre refusé.');
    else setTrade(null);
  }

  const amt = Number(amount.replace(',', '.')) || 0;
  const est = trade?.mode === 'buy' && trade.row?.quote ? buyEstimate(trade.row.quote.price, amt) : null;

  return (
    <Card
      title="📈 Fonds souverain en Bourse"
      subtitle={view.noQuotes ? 'Premiers cours relevés cette nuit' : `Cours du ${view.asOf?.split('-').reverse().join('/') ?? '—'}${view.demo ? ' · simulés (démo)' : ' · marchés réels'}`}
    >
      <div className="space-y-3">
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="rounded-lg bg-parchment-100 p-2">
            <p className="text-[11px] uppercase tracking-wide text-ink-soft">Total</p>
            <p className="text-sm font-bold text-ink">{eur(view.total)}</p>
          </div>
          <div className="rounded-lg bg-parchment-100 p-2">
            <p className="text-[11px] uppercase tracking-wide text-ink-soft">Liquidités</p>
            <p className="text-sm font-bold text-ink">{eur(view.cash)}</p>
          </div>
          <div className="rounded-lg bg-parchment-100 p-2">
            <p className="text-[11px] uppercase tracking-wide text-ink-soft">En ETF</p>
            <p className="text-sm font-bold text-ink">{eur(view.invested)}</p>
          </div>
        </div>
        {(view.invested > 0 || view.realized !== 0) && (
          <p className="text-xs text-ink-soft">
            Plus-value latente <span className={cx('font-semibold', view.latent >= 0 ? 'text-moss-700' : 'text-ember-600')}>{signed(view.latent)}</span>
            {view.realized !== 0 && (
              <>
                {' '}· réalisée <span className={cx('font-semibold', view.realized >= 0 ? 'text-moss-700' : 'text-ember-600')}>{signed(view.realized)}</span>
              </>
            )}
          </p>
        )}
        {view.valueHistory.length >= 2 && (
          <div>
            <p className="text-xs text-ink-soft">Valeur des ETF du fonds, nuit après nuit</p>
            <Spark values={view.valueHistory.map((p) => p.value)} />
          </div>
        )}

        <ul className="space-y-2" aria-label="ETF">
          {view.rows.map((r) => (
            <li key={r.def.id} data-etf={r.def.id} className={cx('rounded-lg border p-2', r.shares > 0 ? 'border-moss-500/40 bg-moss-100/40' : 'border-parchment-200')}>
              <div className="flex items-start gap-2">
                <span aria-hidden className="text-lg">{r.def.icon}</span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-ink">{r.def.label}</p>
                  <p className="text-xs text-ink-soft">
                    {r.quote ? (
                      <>
                        {r.quote.price.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} € <span className={cx('font-semibold', (r.changePct ?? 0) >= 0 ? 'text-moss-700' : 'text-ember-600')}>{signedPct(r.changePct)}</span>
                        {r.stale && <span className="text-ember-600"> · cours ancien</span>}
                      </>
                    ) : (
                      'pas encore de cours'
                    )}
                  </p>
                  {r.shares > 0 && (
                    <p className="text-xs text-ink">
                      {r.shares.toLocaleString('fr-FR')} parts · {eur(r.value)} <span className={cx('font-semibold', r.gain >= 0 ? 'text-moss-700' : 'text-ember-600')}>({signed(r.gain)}, {signedPct(r.gainPct)})</span>
                    </p>
                  )}
                </div>
                <div className="w-20 shrink-0">{r.quote && <Spark values={r.quote.history} />}</div>
              </div>
              {keeper && r.quote && (
                <div className="mt-2 flex gap-2">
                  <Button size="sm" variant="moss" disabled={busy || view.cash < C.ETF_MIN_ORDER_EUR} onClick={() => open('buy', r)}>
                    Acheter
                  </Button>
                  {r.shares > 0 && (
                    <Button size="sm" variant="secondary" disabled={busy} onClick={() => open('sell', r)}>
                      Vendre
                    </Button>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>

        {keeper ? (
          <Button size="sm" variant="secondary" className="w-full" disabled={busy} onClick={() => open('deposit', null)}>
            Abonder ou rapatrier les liquidités du fonds
          </Button>
        ) : (
          <p className="text-xs text-ink-soft">Seul le trésorier, gardien du fonds souverain, passe les ordres.</p>
        )}
        <p className="text-[11px] leading-snug text-ink-soft">
          Les cours suivent de vrais ETF ({C.ETFS.map((e) => e.fund).join(', ')}) relevés chaque nuit ; frais {C.ETF_FEE_PCT.toString().replace('.', ',')} % (min. {C.ETF_FEE_MIN_EUR} €). C’est un jeu : ni vraie transaction, ni conseil financier.
        </p>
      </div>

      <Sheet
        open={!!trade}
        onClose={() => setTrade(null)}
        title={trade?.mode === 'buy' ? `Acheter — ${trade.row?.def.label}` : trade?.mode === 'sell' ? `Vendre — ${trade.row?.def.label}` : 'Liquidités du fonds souverain'}
        footer={
          <Button className="w-full" disabled={busy} onClick={() => void submit()}>
            {trade?.mode === 'buy' ? 'Passer l’ordre d’achat' : trade?.mode === 'sell' ? (amt > 0 ? 'Vendre ce montant' : 'Tout vendre') : 'Valider le mouvement'}
          </Button>
        }
      >
        {trade && (
          <div className="space-y-3">
            {trade.row?.quote && (
              <p className="text-sm text-ink">
                Cours : <strong>{trade.row.quote.price.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €</strong> {trade.row.quote.demo && <Badge tone="gold">démo</Badge>}
              </p>
            )}
            <Field
              label={trade.mode === 'buy' ? 'Montant à placer (€)' : trade.mode === 'sell' ? 'Montant à vendre (€) — vide pour tout vendre' : 'Montant (€) — négatif pour rapatrier vers la caisse'}
              hint={
                trade.mode === 'buy'
                  ? `Liquidités du fonds : ${eur(view.cash)}${est ? ` · ≈ ${est.shares} parts, frais ${eur(est.fee)}` : ''}`
                  : trade.mode === 'sell'
                    ? `Position : ${eur(trade.row?.value ?? 0)} (${trade.row?.shares ?? 0} parts)`
                    : `Caisse : ${eur(data.village.treasury_eur)} · fonds : ${eur(view.cash)}`
              }
            >
              <Input inputMode={trade.mode === 'deposit' ? 'text' : 'decimal'} value={amount} onChange={(e) => setAmount(e.target.value)} placeholder={trade.mode === 'sell' ? 'tout' : '500'} />
            </Field>
          </div>
        )}
      </Sheet>
    </Card>
  );
}
