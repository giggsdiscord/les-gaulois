/**
 * Revenus automatiques (V6.1) : installations par Acte (paysan → modernisation → micro-État),
 * commandes régulières de la semaine et services payants, avec l'estimation de la nuit et les charges
 * du lundi. Trésor → Finances.
 */
import { useMemo, useState } from 'react';
import { constants as C } from '../engine.ts';
import { eur } from '../lib/format.ts';
import { incomeView, type InstallView } from '../lib/income.ts';
import { useData, useGame, useNow } from '../state/GameContext.tsx';
import { Badge, Button, Card, ConfirmButton, cx } from './ui.tsx';

const ACT_TITLE: Record<number, string> = { 1: 'Acte 1 — le hameau paysan', 2: 'Acte 2 — la modernisation', 3: 'Acte 3 — le micro-État' };

export function IncomeCard() {
  const data = useData();
  const { api, perform, toast } = useGame();
  const now = useNow(60_000);
  const view = useMemo(() => incomeView(data, now), [data, now]);
  const [busy, setBusy] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const myAp = data.me.action_points;
  const act = data.village.act_number ?? 1;

  async function run(action_code: string, params: Record<string, string>, ok: string) {
    setBusy(true);
    const r = await perform(
      () => api.action({ action_code, params }),
      (res) => (res.ok ? res.narrative ?? ok : undefined),
    );
    setBusy(false);
    if (r && !r.ok) toast('error', r.error ?? 'Action refusée.');
  }

  const visible = view.installs.filter((i) => showAll || i.state !== 'off' || i.def.act <= act);
  const hidden = view.installs.length - visible.length;
  const activeOrders = view.orders.filter((o) => o.active).length;

  return (
    <Card
      title="💶 Revenus automatiques"
      subtitle={`Cette nuit : ≈ ${eur(view.tonightEur)} · lundi : −${eur(view.weeklyEur)} de charges`}
      tone={view.chargesAtRisk || view.orders.some((o) => o.short) ? 'warning' : 'default'}
    >
      <div className="space-y-4">
        {view.chargesAtRisk && <p className="text-sm text-ember-600">La caisse ne couvre pas les charges du lundi : les installations impayées seront suspendues.</p>}

        <section aria-label="Installations">
          <h3 className="mb-1 text-sm font-semibold text-ink">Installations</h3>
          <p className="mb-2 text-xs text-ink-soft">Elles tournent seules chaque nuit ; une charge est prélevée chaque lundi.</p>
          {[1, 2, 3].map((a) => {
            const rows = visible.filter((i) => i.def.act === a);
            if (rows.length === 0) return null;
            return (
              <div key={a} className="mb-3">
                <p className={cx('mb-1 text-xs font-semibold uppercase tracking-wide', a <= act ? 'text-wood-700' : 'text-ink-soft')}>{ACT_TITLE[a]}</p>
                <ul className="space-y-2">
                  {rows.map((i) => (
                    <InstallRow key={i.def.id} i={i} busy={busy} myAp={myAp} onSetup={() => void run('setup_install', { install: i.def.id }, 'Installation en place.')} onStop={() => void run('stop_install', { install: i.def.id }, 'Installation arrêtée.')} />
                  ))}
                </ul>
              </div>
            );
          })}
          {hidden > 0 && (
            <button type="button" className="text-xs font-semibold text-river-600 underline" onClick={() => setShowAll(true)}>
              Voir les {hidden} installations des Actes suivants
            </button>
          )}
        </section>

        <section aria-label="Commandes régulières" className="border-t border-parchment-200 pt-3">
          <h3 className="mb-1 text-sm font-semibold text-ink">
            Commandes de la semaine <span className="font-normal text-ink-soft">({activeOrders}/{C.ORDER_MAX_ACTIVE})</span>
          </h3>
          <p className="mb-2 text-xs text-ink-soft">Livrées chaque nuit jusqu’à lundi, mieux payées qu’au marché. {C.ORDER_MAX_MISSED} livraisons manquées et le client rompt.</p>
          <ul className="space-y-2">
            {view.orders.map((o) => (
              <li key={o.def.id} data-order={o.def.id} className={cx('rounded-lg border p-2', o.short ? 'border-ember-600/40 bg-ember-100' : o.active ? 'border-moss-500/40 bg-moss-100/60' : 'border-parchment-200')}>
                <div className="flex items-start gap-2">
                  <span aria-hidden className="text-lg">{o.def.icon}</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-ink">{o.def.client}</p>
                    <p className="text-xs text-ink-soft">{o.text}</p>
                    {o.active && (
                      <p className="text-xs text-moss-700">
                        {o.active.delivered} livrée{o.active.delivered > 1 ? 's' : ''} · {eur(o.active.earned_eur)}
                        {o.active.missed > 0 && <span className="text-ember-600"> · {o.active.missed} manquée</span>}
                      </p>
                    )}
                    {o.short && <p className="text-xs font-semibold text-ember-600">Stock insuffisant pour la livraison de cette nuit.</p>}
                  </div>
                  {!o.active && (
                    <Button size="sm" variant="secondary" disabled={busy || myAp < 1 || !!o.blocked} title={o.blocked ?? undefined} onClick={() => void run('sign_order', { order: o.def.id }, 'Commande signée.')}>
                      Signer
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </section>

        <section aria-label="Services payants" className="border-t border-parchment-200 pt-3">
          <h3 className="mb-2 text-sm font-semibold text-ink">Services payants <span className="font-normal text-ink-soft">(1 PA, payé comptant)</span></h3>
          <ul className="space-y-2">
            {view.services.map((sv) => (
              <li key={sv.def.id} data-service={sv.def.id} className="flex items-center gap-2">
                <span aria-hidden className="text-lg">{sv.def.icon}</span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-ink">
                    {sv.def.label} <span className="font-semibold text-moss-700">+{sv.def.eur} €</span>
                  </p>
                  <p className="text-xs text-ink-soft">
                    {sv.done}/{sv.def.weekly_cap} cette semaine · {sv.def.extra}
                  </p>
                </div>
                <Button size="sm" variant="moss" disabled={busy || myAp < 1 || !!sv.blocked} onClick={() => void run('paid_service', { service: sv.def.id }, 'Service rendu.')}>
                  Rendre
                </Button>
              </li>
            ))}
          </ul>
        </section>

        {view.last && view.last.lines.length > 0 && (
          <details className="border-t border-parchment-200 pt-3 text-sm">
            <summary className="cursor-pointer font-semibold text-ink">Nuit dernière : +{eur(view.last.eur)}</summary>
            <ul className="mt-2 space-y-1 text-xs">
              {view.last.lines.map((l) => (
                <li key={l.id} className={l.idle ? 'text-ink-soft' : 'text-ink'}>
                  {l.icon} {l.label} : {l.idle ?? `${l.eur > 0 ? `+${eur(l.eur)}` : ''}${l.goods ? `${l.eur > 0 ? ' · ' : ''}${l.goods}` : ''}`}
                </li>
              ))}
            </ul>
          </details>
        )}
      </div>
    </Card>
  );
}

function InstallRow({ i, busy, myAp, onSetup, onStop }: { i: InstallView; busy: boolean; myAp: number; onSetup: () => void; onStop: () => void }) {
  const t = i.tonight;
  return (
    <li data-install={i.def.id} className={cx('rounded-lg border p-2', i.state === 'on' ? 'border-moss-500/40 bg-moss-100/60' : i.state === 'paused' ? 'border-ember-600/40 bg-ember-100' : 'border-parchment-200')}>
      <div className="flex items-start gap-2">
        <span aria-hidden className="text-lg">{i.def.icon}</span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-ink">{i.def.label}</p>
          <p className="text-xs text-ink-soft">{i.def.summary}</p>
          <div className="mt-1 flex flex-wrap gap-1 text-xs">
            {i.state === 'on' && <Badge tone="moss">{t?.idle ? `à l’arrêt : ${t.idle}` : `cette nuit ≈ ${t && t.eur > 0 ? `+${eur(t.eur)}` : (t?.goods ?? '—')}`}</Badge>}
            {i.state === 'paused' && <Badge tone="ember">suspendue (charge impayée)</Badge>}
            <Badge>{i.state === 'off' ? `${eur(i.def.install_eur)} puis ` : ''}{eur(i.def.weekly_eur)}/semaine</Badge>
          </div>
          {i.state !== 'on' && i.blocked && <p className="mt-1 text-xs text-ink-soft">🔒 {i.blocked}</p>}
        </div>
      </div>
      {i.state !== 'on' ? (
        <Button className="mt-2 w-full" size="sm" variant={i.state === 'paused' ? 'primary' : 'secondary'} disabled={busy || myAp < 1 || !!i.blocked} onClick={onSetup}>
          {i.state === 'paused' ? `Relancer (${eur(i.cost)}, 1 PA)` : `Installer (${eur(i.cost)}, 1 PA)`}
        </Button>
      ) : (
        <ConfirmButton className="mt-2 w-full" size="sm" variant="ghost" disabled={busy} onConfirm={onStop} confirmLabel="Confirmer l’arrêt">
          Arrêter
        </ConfirmButton>
      )}
    </li>
  );
}
