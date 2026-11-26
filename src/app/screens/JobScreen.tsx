/** Écran 2 — Mon Métier & Patrimoine privé. */
import { useMemo, useState } from 'react';
import type { ActionDef } from '../engine.ts';
import { ActionSheet, LockBadges } from '../components/ActionSheet.tsx';
import { HiddenIndicators } from '../components/HiddenIndicators.tsx';
import { ChangePinModal } from '../components/Modals.tsx';
import { Avatar, Badge, Button, Card, Empty, Field, Gauge, Input, SectionTitle, Select, cx } from '../components/ui.tsx';
import { availableActions, delegatorsOf, isDetained, playerName } from '../lib/game.ts';
import { dateTime, eur, relative } from '../lib/format.ts';
import { INJURY_LABEL, PORTFOLIO_LABEL } from '../lib/labels.ts';
import { useData, useGame, useNow } from '../state/GameContext.tsx';

function ApDots({ value }: { value: number }) {
  return (
    <span className="flex gap-1.5" aria-label={`${value} point(s) d'action sur 3`}>
      {[0, 1, 2].map((i) => (
        <span key={i} className={cx('h-4 w-4 rounded-full border-2 border-gold-500', i < value && 'bg-gold-500')} />
      ))}
    </span>
  );
}

function ApprovalsPanel() {
  const data = useData();
  const { api, perform } = useGame();
  const role = data.me.role_code;
  const mine = data.approvals.filter((a) => a.status === 'pending' && (a.required_role === role || data.players.some((p) => p.role_code === a.required_role && p.delegated_to === data.me.id)));
  const requested = data.approvals.filter((a) => a.requested_by === data.me.id).slice(0, 5);
  if (mine.length === 0 && requested.length === 0) return null;
  return (
    <Card title="Validations" subtitle="Verrous PLU (Tiphaine) et dépenses > 500 € (M. Lerme)">
      {mine.map((a) => (
        <div key={a.id} className="mb-3 rounded-xl border border-gold-500/40 bg-gold-100 p-3">
          <p className="text-sm font-semibold">
            {a.kind === 'plu' ? 'Accord PLU' : 'Validation budgétaire'} demandé par {playerName(data.players, a.requested_by)}
          </p>
          <p className="text-sm text-ink-soft">
            Action « {a.action_code} »{a.amount_eur ? ` — ${eur(a.amount_eur, true)}` : ''}
            {a.structure_id ? ` — ${data.structures.find((s) => s.id === a.structure_id)?.name ?? ''}` : ''}
          </p>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <Button variant="moss" size="sm" onClick={() => void perform(() => api.decideApproval(a.id, true), (r) => (r.executed ? `Accordé et exécuté : ${String(r.narrative ?? '')}` : 'Accordé.'))}>
              Accorder
            </Button>
            <Button variant="danger" size="sm" onClick={() => void perform(() => api.decideApproval(a.id, false, 'Refusé'), 'Refusé.')}>
              Refuser
            </Button>
          </div>
        </div>
      ))}
      {requested.length > 0 && (
        <ul className="space-y-1 text-sm">
          {requested.map((a) => (
            <li key={a.id} className="flex justify-between gap-2">
              <span>
                {a.kind === 'plu' ? 'PLU' : 'Budget'} — {a.action_code}
              </span>
              <Badge tone={a.status === 'pending' ? 'gold' : a.status === 'rejected' || a.status === 'expired' ? 'ember' : 'moss'}>{a.status}</Badge>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function DelegationPanel() {
  const data = useData();
  const { api, perform } = useGame();
  const now = useNow(30_000);
  const [delegate, setDelegate] = useState('');
  const [days, setDays] = useState(3);
  const me = data.me;
  const active = me.delegated_to && me.delegation_until && new Date(me.delegation_until).getTime() > now.getTime();
  const others = data.players.filter((p) => p.id !== me.id && p.is_active_slot && p.status === 'active');
  return (
    <Card title="Absence & délégation" subtitle="Confiez votre poste (14 jours max) : vos PA, sans veto ni patrimoine privé.">
      {active ? (
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm">
            Délégué à <strong>{playerName(data.players, me.delegated_to)}</strong> jusqu'au {dateTime(me.delegation_until)}.
          </p>
          <Button variant="secondary" size="sm" onClick={() => void perform(() => api.setDelegation(null, null), 'Délégation levée.')}>
            Reprendre
          </Button>
        </div>
      ) : (
        <div className="grid gap-2 sm:grid-cols-[1fr_8rem_auto] sm:items-end">
          <Field label="Délégataire">
            <Select value={delegate} onChange={(e) => setDelegate(e.target.value)}>
              <option value="">— Choisir —</option>
              {others.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.display_name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Jours">
            <Input type="number" min={1} max={14} value={days} onChange={(e) => setDays(Math.min(14, Math.max(1, Number(e.target.value) || 1)))} />
          </Field>
          <Button
            disabled={!delegate}
            onClick={() => void perform(() => api.setDelegation(delegate, new Date(api.now().getTime() + days * 86_400_000).toISOString()), 'Poste délégué.')}
          >
            Déléguer
          </Button>
        </div>
      )}
    </Card>
  );
}

export function JobScreen() {
  const data = useData();
  const now = useNow(30_000);
  const [holderId, setHolderId] = useState<string>(data.me.id);
  const [action, setAction] = useState<ActionDef | null>(null);
  const [pinOpen, setPinOpen] = useState(false);
  const me = data.me;
  const delegators = delegatorsOf(data.players, me.id, now);
  const holder = data.players.find((p) => p.id === holderId) ?? me;
  const acting = holder.id !== me.id;
  const act = data.village.act_number;

  const groups = useMemo(() => {
    const list = availableActions(holder, act);
    const job = list.filter((a) => !a.anyone && a.roles?.includes(holder.role_code as never));
    const portfolio = list.filter((a) => !a.anyone && !a.roles?.includes(holder.role_code as never));
    const common = list.filter((a) => a.anyone && a.code !== 'free_ai_action');
    return { job, portfolio, common, free: list.find((a) => a.code === 'free_ai_action') };
  }, [holder, act]);

  const detained = isDetained(me, now);
  const apSource = acting ? holder.action_points : me.action_points;
  const myEvents = data.events.filter((e) => e.visibility === 'private' && e.player_id === me.id).slice(0, 6);
  const apprentices = data.children.filter((c) => c.mentor_player_id === me.id);

  const renderAction = (a: ActionDef) => (
    <button
      key={a.code}
      onClick={() => setAction(a)}
      disabled={detained || apSource < a.apCost}
      className="flex w-full items-start justify-between gap-3 rounded-xl border border-parchment-200 bg-white px-3 py-3 text-left transition-colors hover:bg-parchment-50 disabled:opacity-50"
    >
      <span className="min-w-0">
        <span className="block font-semibold text-ink">{a.label}</span>
        <span className="mb-1.5 block text-sm text-ink-soft">{a.description}</span>
        <LockBadges def={a} />
      </span>
      <span className="mt-1 text-wood-600">→</span>
    </button>
  );

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex items-start gap-3">
          <Avatar emoji={me.avatar_emoji} color={me.avatar_color} size="lg" />
          <div className="min-w-0 flex-1">
            <p className="font-serif text-xl">
              {me.display_name} <span className="text-base text-ink-soft">({me.character_name})</span>
            </p>
            <p className="text-sm text-ink-soft">{me.role_title}</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {me.ministerial_portfolios.map((p) => (
                <Badge key={p} tone="river">
                  {PORTFOLIO_LABEL[p] ?? p}
                </Badge>
              ))}
              {me.status === 'forced_labor' && <Badge tone="ember">Travaux forcés</Badge>}
              {detained && <Badge tone="ember">Au cachot {relative(me.is_detained_until, now)}</Badge>}
              {me.veto_tokens > 0 && <Badge tone="gold">Jeton de veto</Badge>}
            </div>
          </div>
          <div className="text-right">
            <ApDots value={me.action_points} />
            <p className="mt-1 text-xs text-ink-soft">{me.skill_xp} XP</p>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3">
          <Gauge label="Santé" value={me.health_pct} />
          <Gauge label="Santé mentale" value={me.mental_health_pct} />
          <Gauge label="Fatigue" value={me.fatigue_pct} good="low" />
          <Gauge label="Moral" value={me.morale_pct} />
          <Gauge label="Addiction" value={Math.round(me.addiction_level_pct)} good="low" hint={me.addiction_level_pct > 50 ? 'Manque : −10 % de santé mentale et −1 PA par jour' : undefined} />
          <Gauge label="Culpabilité" value={me.temptation_guilt_pct} good="low" />
        </div>
        {me.injury_type && <p className="mt-3 rounded-xl bg-ember-100 px-3 py-2 text-sm font-medium text-ember-600">🩹 {INJURY_LABEL[me.injury_type] ?? me.injury_type} — PA limités à 1, Carlage interdit.</p>}
        {me.pending_ap_penalty > 0 && <p className="mt-2 text-sm text-ember-600">Lendemain de tentation : −{me.pending_ap_penalty} PA demain.</p>}
        <div className="mt-4 flex items-center justify-between gap-3 rounded-xl bg-parchment-100 px-3 py-2.5">
          <span className="text-sm text-ink-soft">Patrimoine privé</span>
          <span className="text-lg font-semibold tabular-nums">{eur(me.private_wealth_eur, true)}</span>
        </div>
      </Card>

      <ApprovalsPanel />

      {delegators.length > 0 && (
        <Card title="Vous agissez pour…" tone="warning">
          <Select value={holderId} onChange={(e) => setHolderId(e.target.value)}>
            <option value={me.id}>Moi-même ({me.character_name})</option>
            {delegators.map((p) => (
              <option key={p.id} value={p.id}>
                {p.display_name} — {p.role_title} ({p.action_points} PA)
              </option>
            ))}
          </Select>
        </Card>
      )}

      {groups.free && (
        <Card title="✒️ Action libre" subtitle="Décrivez ce que vous faites ; le Maître du Jeu IA arbitre dans les bornes du moteur." tone="moss">
          <Button className="w-full" variant="moss" disabled={detained || apSource < 1} onClick={() => setAction(groups.free!)}>
            Soumettre une action libre (1 PA)
          </Button>
        </Card>
      )}

      <div>
        <SectionTitle aside={<span className="text-xs text-ink-soft">{apSource} PA disponibles</span>}>{acting ? `Métier de ${holder.display_name}` : 'Mon métier'}</SectionTitle>
        <div className="space-y-2">{groups.job.length ? groups.job.map(renderAction) : <Empty>Aucune action métier.</Empty>}</div>
        {groups.portfolio.length > 0 && (
          <>
            <SectionTitle>Portefeuilles ministériels</SectionTitle>
            <div className="space-y-2">{groups.portfolio.map(renderAction)}</div>
          </>
        )}
        <SectionTitle>Actions de tous</SectionTitle>
        <div className="space-y-2">{groups.common.map(renderAction)}</div>
      </div>

      <HiddenIndicators rows={data.hidden} />

      {apprentices.length > 0 && (
        <Card title="Mes apprentis">
          <ul className="space-y-1 text-sm">
            {apprentices.map((c) => (
              <li key={c.id}>
                {c.full_name}, {c.age_years} ans — {c.status === 'graduated' ? 'diplômé' : 'en apprentissage'}
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card title="Mes derniers résultats">
        {myEvents.length === 0 ? (
          <Empty>Vos actions apparaîtront ici.</Empty>
        ) : (
          <ul className="space-y-3">
            {myEvents.map((e) => (
              <li key={e.id} className="border-b border-parchment-200 pb-2 last:border-0">
                <p className="text-sm font-semibold">{e.title}</p>
                <p className="text-sm text-ink-soft">{e.body}</p>
                <p className="text-xs text-ink-soft">{relative(e.created_at, now)}</p>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <DelegationPanel />
      <Button variant="ghost" onClick={() => setPinOpen(true)}>
        Changer mon code PIN
      </Button>

      {action && <ActionSheet def={action} holderId={acting ? holder.id : null} onClose={() => setAction(null)} />}
      {pinOpen && <ChangePinModal onClose={() => setPinOpen(false)} />}
    </div>
  );
}
