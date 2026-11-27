/**
 * Écran 2 — Mon Métier & Patrimoine privé. V4.4 (téléphone) : fiche compacte en tête, trois
 * sous-onglets (Agir · Ma fiche · Journal) ; « Agir » est un menu d'actions classées par type
 * (tuiles), avec recherche et actions récentes. Une catégorie ouverte = #/metier/<catégorie> :
 * le bouton retour du téléphone ramène au menu.
 */
import { useEffect, useMemo, useState } from 'react';
import { skillLevel, type ActionDef } from '../engine.ts';
import { ActionRow, ActionSheet } from '../components/ActionSheet.tsx';
import { HiddenIndicators } from '../components/HiddenIndicators.tsx';
import { JobLevelCard } from '../components/JobLevelCard.tsx';
import { ChangePinModal } from '../components/Modals.tsx';
import { Avatar, Badge, Button, Card, Empty, Field, Gauge, Input, SectionTitle, Select, Tabs, cx } from '../components/ui.tsx';
import { ACTION_CATEGORIES, FREE_ACTION_CODE, groupByCategory } from '../lib/actionCategories.ts';
import { actionBlockReason, actionLabel, matchesQuery, pushRecent, situationFor } from '../lib/actionHints.ts';
import { availableActions, delegatorsOf, isDetained, playerName } from '../lib/game.ts';
import { dateTime, eur, relative } from '../lib/format.ts';
import { APPROVAL_KIND, APPROVAL_STATUS, INJURY_LABEL, PORTFOLIO_LABEL } from '../lib/labels.ts';
import { navigate, useRoute } from '../lib/router.ts';
import { approvalsToDecide } from '../lib/todo.ts';
import { useData, useGame, useNow } from '../state/GameContext.tsx';

type JobTab = 'agir' | 'fiche' | 'journal';
const RECENT_KEY = 'les-gaulois-recent-actions';

function readRecent(playerId: string): string[] {
  try {
    const raw = localStorage.getItem(`${RECENT_KEY}:${playerId}`);
    const list = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(list) ? list.filter((c): c is string => typeof c === 'string') : [];
  } catch {
    return [];
  }
}

function writeRecent(playerId: string, list: string[]): void {
  try {
    localStorage.setItem(`${RECENT_KEY}:${playerId}`, JSON.stringify(list));
  } catch {
    /* stockage indisponible : pas de récentes */
  }
}

/** Ouverture d'une catégorie depuis le menu : le retour de l'écran revient alors en arrière. */
let openedFromMenu = false;

function ApDots({ value }: { value: number }) {
  return (
    <span className="flex gap-1" aria-label={`${value} point(s) d'action sur 3`}>
      {[0, 1, 2].map((i) => (
        <span key={i} className={cx('h-3.5 w-3.5 rounded-full border-2 border-gold-500', i < value && 'bg-gold-500')} />
      ))}
    </span>
  );
}

function Vital({ emoji, label, value, good = 'high' }: { emoji: string; label: string; value: number; good?: 'high' | 'low' }) {
  const score = good === 'high' ? value : 100 - value;
  const tone = score >= 60 ? 'bg-moss-100 text-moss-700' : score >= 35 ? 'bg-gold-100 text-wood-700' : 'bg-ember-100 text-ember-600';
  return (
    <span className={cx('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums', tone)} title={label}>
      <span aria-hidden="true">{emoji}</span>
      <span className="sr-only">{label}</span>
      {Math.round(value)} %
    </span>
  );
}

/** Fiche compacte toujours visible : identité, PA, vitalité, patrimoine, alertes. */
function ProfileHeader() {
  const data = useData();
  const now = useNow(30_000);
  const me = data.me;
  const detained = isDetained(me, now);
  return (
    <Card className="p-3!">
      <div className="flex items-center gap-3">
        <Avatar emoji={me.avatar_emoji} color={me.avatar_color} size="md" />
        <div className="min-w-0 flex-1">
          <p className="truncate font-serif text-lg leading-tight">
            {me.display_name} <span className="text-sm text-ink-soft">({me.character_name})</span>
          </p>
          <p className="truncate text-xs text-ink-soft">{me.role_title}</p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <ApDots value={me.action_points} />
          <span className="text-xs font-semibold tabular-nums text-ink-soft">{eur(me.private_wealth_eur)}</span>
        </div>
      </div>
      <button className="mt-2 flex w-full flex-wrap gap-1.5 text-left" onClick={() => navigate('metier', 'fiche', { replace: true })} aria-label="Voir ma fiche complète">
        <Vital emoji="❤️" label="Santé" value={me.health_pct} />
        <Vital emoji="🧠" label="Santé mentale" value={me.mental_health_pct} />
        <Vital emoji="🙂" label="Moral" value={me.morale_pct} />
        <Vital emoji="😴" label="Fatigue" value={me.fatigue_pct} good="low" />
        {me.addiction_level_pct > 30 && <Vital emoji="🍷" label="Addiction" value={me.addiction_level_pct} good="low" />}
      </button>
      {(me.injury_type || detained || me.status === 'forced_labor' || me.pending_ap_penalty > 0) && (
        <div className="mt-2 space-y-1 text-sm">
          {me.injury_type && <p className="rounded-lg bg-ember-100 px-2 py-1 font-medium text-ember-600">🩹 {INJURY_LABEL[me.injury_type] ?? me.injury_type} — 1 PA par jour, Carlage interdit.</p>}
          {detained && <p className="rounded-lg bg-ember-100 px-2 py-1 font-medium text-ember-600">🔒 Au cachot {relative(me.is_detained_until, now)}.</p>}
          {me.status === 'forced_labor' && <p className="rounded-lg bg-ember-100 px-2 py-1 font-medium text-ember-600">⛏️ Travaux forcés : tâches physiques seulement.</p>}
          {me.pending_ap_penalty > 0 && <p className="text-ember-600">Lendemain de tentation : −{me.pending_ap_penalty} PA demain.</p>}
        </div>
      )}
    </Card>
  );
}

function ApprovalsToDecide() {
  const data = useData();
  const { api, perform } = useGame();
  const now = useNow(60_000);
  const mine = approvalsToDecide(data, now);
  if (mine.length === 0) return null;
  return (
    <Card title="À valider" subtitle="Verrous PLU (Tiphaine) et dépenses > 500 € (M. Lerme)" tone="warning">
      <div className="space-y-3">
        {mine.map((a) => (
          <div key={a.id} className="rounded-xl bg-white/80 p-3">
            <p className="text-sm font-semibold">
              {APPROVAL_KIND[a.kind] ?? a.kind} — {playerName(data.players, a.requested_by)}
            </p>
            <p className="text-sm text-ink-soft">
              {actionLabel(a.action_code)}
              {a.amount_eur ? ` · ${eur(a.amount_eur, true)}` : ''}
              {a.structure_id ? ` · ${data.structures.find((s) => s.id === a.structure_id)?.name ?? ''}` : ''}
            </p>
            <p className="text-xs text-ink-soft">Demandée {relative(a.created_at, now)}</p>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <Button variant="danger" size="sm" onClick={() => void perform(() => api.decideApproval(a.id, false, 'Refusé'), 'Refusé.')}>
                Refuser
              </Button>
              <Button variant="moss" size="sm" onClick={() => void perform(() => api.decideApproval(a.id, true), (r) => (r.executed ? `Accordé et exécuté : ${String(r.narrative ?? '')}` : 'Accordé.'))}>
                Accorder
              </Button>
            </div>
          </div>
        ))}
      </div>
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
        <div className="space-y-2">
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
          <Field label="Nombre de jours">
            <Input type="number" inputMode="numeric" min={1} max={14} value={days} onChange={(e) => setDays(Math.min(14, Math.max(1, Number(e.target.value) || 1)))} />
          </Field>
          <Button className="w-full" disabled={!delegate} onClick={() => void perform(() => api.setDelegation(delegate, new Date(api.now().getTime() + days * 86_400_000).toISOString()), 'Poste délégué.')}>
            Déléguer
          </Button>
        </div>
      )}
    </Card>
  );
}

/** Sous-onglet « Agir » : menu des catégories, catégorie ouverte, recherche, récentes, Action libre. */
function ActPanel({ categoryId }: { categoryId: string | null }) {
  const data = useData();
  const now = useNow(30_000);
  const me = data.me;
  const [holderId, setHolderId] = useState<string>(me.id);
  const [action, setAction] = useState<ActionDef | null>(null);
  const [query, setQuery] = useState('');
  const [recent, setRecent] = useState<string[]>(() => readRecent(me.id));
  const delegators = delegatorsOf(data.players, me.id, now);
  const holder = data.players.find((p) => p.id === holderId) ?? me;
  const acting = holder.id !== me.id;
  const situation = situationFor(data, acting ? holder.id : null, now);

  const actions = useMemo(() => availableActions(holder, data.village.act_number), [holder, data.village.act_number]);
  const free = actions.find((a) => a.code === FREE_ACTION_CODE);
  const groups = useMemo(() => groupByCategory(actions), [actions]);
  const category = categoryId ? groups.find((g) => g.category.id === categoryId) : undefined;
  const recentDefs = recent.map((c) => actions.find((a) => a.code === c)).filter((a): a is ActionDef => a !== undefined && a.code !== FREE_ACTION_CODE);
  const results = query.trim() ? actions.filter((a) => a.code !== FREE_ACTION_CODE && matchesQuery(a, query)) : null;

  const reason = (a: ActionDef) => actionBlockReason(a, situation);
  useEffect(() => {
    if (!categoryId) openedFromMenu = false;
  }, [categoryId]);
  const openCategory = (id: string) => {
    openedFromMenu = true;
    navigate('metier', id);
  };
  const backToMenu = () => {
    if (openedFromMenu) {
      openedFromMenu = false;
      history.back();
    } else navigate('metier', null, { replace: true });
  };
  const onSuccess = (code: string) => {
    const next = pushRecent(recent, code);
    setRecent(next);
    writeRecent(me.id, next);
  };
  const list = (defs: ActionDef[]) => (
    <Card flush className="divide-y divide-parchment-200">
      {defs.map((a) => (
        <ActionRow key={a.code} def={a} reason={reason(a)} onClick={() => setAction(a)} />
      ))}
    </Card>
  );

  return (
    <div className="space-y-4">
      <ApprovalsToDecide />

      {delegators.length > 0 && (
        <Card tone="warning" className="p-3!">
          <Field label="Vous agissez pour…">
            <Select value={holderId} onChange={(e) => setHolderId(e.target.value)}>
              <option value={me.id}>Moi-même ({me.character_name})</option>
              {delegators.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.display_name} — {p.role_title} ({p.action_points} PA)
                </option>
              ))}
            </Select>
          </Field>
        </Card>
      )}

      {categoryId ? (
        <div>
          <button onClick={backToMenu} className="mb-3 flex min-h-10 items-center gap-1 text-sm font-semibold text-wood-700">
            ‹ Toutes les catégories
          </button>
          {category ? (
            <>
              <SectionTitle aside={<span className="text-xs text-ink-soft">{situation.holder.action_points} PA disponibles</span>}>
                {category.category.emoji} {category.category.label}
              </SectionTitle>
              {list(category.actions)}
            </>
          ) : (
            <Empty>Aucune action de ce type pour {acting ? 'ce poste' : 'vous'}.</Empty>
          )}
        </div>
      ) : (
        <>
          <div className="relative">
            <Input type="search" enterKeyHint="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="🔍 Chercher une action…" className="pr-10" aria-label="Chercher une action" />
            {query && (
              <button onClick={() => setQuery('')} className="absolute inset-y-0 right-0 px-3 text-lg text-ink-soft" aria-label="Effacer la recherche">
                ×
              </button>
            )}
          </div>

          {results ? (
            results.length === 0 ? (
              <Empty>Aucune action ne correspond à « {query.trim()} ».</Empty>
            ) : (
              list(results)
            )
          ) : (
            <>
              {!acting && <JobLevelCard onAction={setAction} />}
              {free && (
                <button
                  onClick={() => setAction(free)}
                  className="flex w-full items-center gap-3 rounded-2xl border border-moss-500/30 bg-moss-100 px-4 py-3 text-left active:brightness-95"
                >
                  <span className="text-2xl" aria-hidden="true">
                    ✒️
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold text-moss-700">Action libre</span>
                    <span className="block text-sm leading-snug text-ink-soft">Racontez ce que vous faites ; le Maître du Jeu arbitre.</span>
                  </span>
                  <span className="shrink-0 rounded-full bg-white/70 px-2.5 py-1 text-xs font-bold text-moss-700">1 PA</span>
                </button>
              )}

              {recentDefs.length > 0 && (
                <div>
                  <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-ink-soft">Récentes</p>
                  <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4">
                    {recentDefs.map((a) => (
                      <button
                        key={a.code}
                        onClick={() => setAction(a)}
                        className={cx('max-w-[14rem] shrink-0 truncate rounded-full border border-parchment-300 bg-white px-3 py-2 text-sm font-semibold', reason(a) && 'opacity-50')}
                      >
                        {a.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <SectionTitle aside={<span className="text-xs text-ink-soft">{situation.holder.action_points} PA disponibles</span>}>{acting ? `Actions de ${holder.display_name}` : 'Que voulez-vous faire ?'}</SectionTitle>
                <div className="grid grid-cols-2 gap-2.5">
                  {groups.map((g) => {
                    const playable = g.actions.filter((a) => reason(a) === null).length;
                    return (
                      <button
                        key={g.category.id}
                        onClick={() => openCategory(g.category.id)}
                        className={cx(
                          'flex min-h-24 flex-col justify-between rounded-2xl border p-3 text-left shadow-[0_1px_0_rgba(59,42,28,0.06)] active:scale-[0.98] transition-transform',
                          g.ownCount > 0 ? 'border-wood-500/30 bg-white' : 'border-parchment-200 bg-white/60',
                        )}
                      >
                        <span className="text-2xl" aria-hidden="true">
                          {g.category.emoji}
                        </span>
                        <span>
                          <span className="block font-semibold leading-tight text-ink">{g.category.label}</span>
                          <span className={cx('block text-xs', playable === 0 ? 'text-ember-600' : 'text-ink-soft')}>
                            {g.actions.length} action{g.actions.length > 1 ? 's' : ''}
                            {playable < g.actions.length ? ` · ${playable === 0 ? 'aucune jouable' : `${playable} jouable${playable > 1 ? 's' : ''}`}` : ''}
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </div>
                <p className="mt-2 text-xs text-ink-soft">Les tuiles encadrées regroupent les actions de votre métier ou de vos portefeuilles.</p>
              </div>
            </>
          )}
        </>
      )}

      {action && <ActionSheet def={action} holderId={acting ? holder.id : null} onClose={() => setAction(null)} onSuccess={onSuccess} />}
    </div>
  );
}

function ProfilePanel() {
  const data = useData();
  const [pinOpen, setPinOpen] = useState(false);
  const me = data.me;
  const apprentices = data.children.filter((c) => c.mentor_player_id === me.id);
  return (
    <div className="space-y-4">
      <Card title="Santé & état">
        <div className="grid grid-cols-2 gap-x-4 gap-y-3">
          <Gauge label="Santé" value={me.health_pct} />
          <Gauge label="Santé mentale" value={me.mental_health_pct} />
          <Gauge label="Fatigue" value={me.fatigue_pct} good="low" />
          <Gauge label="Moral" value={me.morale_pct} />
          <Gauge label="Addiction" value={Math.round(me.addiction_level_pct)} good="low" hint={me.addiction_level_pct > 50 ? 'Manque : −10 % de santé mentale et −1 PA par jour' : undefined} />
          <Gauge label="Culpabilité" value={me.temptation_guilt_pct} good="low" />
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {me.ministerial_portfolios.map((p) => (
            <Badge key={p} tone="river">
              {PORTFOLIO_LABEL[p] ?? p}
            </Badge>
          ))}
          {me.veto_tokens > 0 && <Badge tone="gold">Jeton de veto</Badge>}
          <Badge>Niveau {skillLevel(me.skill_xp)} · {me.skill_xp} XP</Badge>
        </div>
        <div className="mt-4 flex items-center justify-between gap-3 rounded-xl bg-parchment-100 px-3 py-2.5">
          <span className="text-sm text-ink-soft">Patrimoine privé</span>
          <span className="text-lg font-semibold tabular-nums">{eur(me.private_wealth_eur, true)}</span>
        </div>
      </Card>

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

      <DelegationPanel />
      <Button variant="secondary" className="w-full" onClick={() => setPinOpen(true)}>
        🔑 Changer mon code PIN
      </Button>
      {pinOpen && <ChangePinModal onClose={() => setPinOpen(false)} />}
    </div>
  );
}

function JournalPanel() {
  const data = useData();
  const now = useNow(60_000);
  const me = data.me;
  const myEvents = data.events.filter((e) => e.visibility === 'private' && e.player_id === me.id).slice(0, 20);
  const requested = data.approvals.filter((a) => a.requested_by === me.id).slice(0, 8);
  return (
    <div className="space-y-4">
      {requested.length > 0 && (
        <Card title="Mes demandes de validation" flush>
          <ul className="divide-y divide-parchment-200">
            {requested.map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-2 px-4 py-2.5 text-sm">
                <span className="min-w-0">
                  <span className="block font-semibold">{actionLabel(a.action_code)}</span>
                  <span className="text-xs text-ink-soft">
                    {APPROVAL_KIND[a.kind] ?? a.kind} · {relative(a.created_at, now)}
                  </span>
                </span>
                <Badge tone={a.status === 'pending' ? 'gold' : a.status === 'rejected' || a.status === 'expired' ? 'ember' : 'moss'}>{APPROVAL_STATUS[a.status] ?? a.status}</Badge>
              </li>
            ))}
          </ul>
        </Card>
      )}
      <Card title="Mes derniers résultats" flush>
        {myEvents.length === 0 ? (
          <div className="px-4 pb-4">
            <Empty>Vos actions apparaîtront ici.</Empty>
          </div>
        ) : (
          <ul className="divide-y divide-parchment-200">
            {myEvents.map((e) => (
              <li key={e.id} className="px-4 py-2.5">
                <p className="text-sm font-semibold">{e.title}</p>
                <p className="text-sm text-ink-soft">{e.body}</p>
                <p className="text-xs text-ink-soft">{relative(e.created_at, now)}</p>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

export function JobScreen() {
  const data = useData();
  const now = useNow(60_000);
  const route = useRoute();
  const param = route.param;
  const categoryId = param && ACTION_CATEGORIES.some((c) => c.id === param) ? param : null;
  const tab: JobTab = param === 'fiche' ? 'fiche' : param === 'journal' ? 'journal' : 'agir';
  const toDecide = approvalsToDecide(data, now).length;
  return (
    <div className="space-y-4">
      <ProfileHeader />
      <Tabs<JobTab>
        value={tab}
        onChange={(t) => navigate('metier', t === 'agir' ? null : t, { replace: true })}
        tabs={[
          { id: 'agir', label: '⚡ Agir', badge: toDecide },
          { id: 'fiche', label: 'Ma fiche' },
          { id: 'journal', label: 'Journal' },
        ]}
      />
      {tab === 'agir' && <ActPanel categoryId={categoryId} />}
      {tab === 'fiche' && <ProfilePanel />}
      {tab === 'journal' && <JournalPanel />}
    </div>
  );
}
