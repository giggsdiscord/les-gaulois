/**
 * Carte « À faire en priorité » de l'accueil (V4.6) : les prochaines étapes qui font avancer le
 * hameau, avec le pourquoi, qui peut agir, les verrous et ce que ça rapporte ; fenêtre
 * « Comprendre la progression » (Actes, 6 piliers d'autonomie, toutes les priorités).
 */
import { useMemo, useState } from 'react';
import { getAction, type ActionDef } from '../engine.ts';
import type { ActionInput } from '../api/types.ts';
import { ACT_LABEL } from '../lib/labels.ts';
import type { ActGoalsView } from '../lib/actGoals.ts';
import { priorityPlan, type Pillar, type PriorityItem, type PriorityPlan } from '../lib/priorities.ts';
import { navigate } from '../lib/router.ts';
import { useData, useNow } from '../state/GameContext.tsx';
import { ActionSheet } from './ActionSheet.tsx';
import { Badge, Button, Card, Sheet, cx } from './ui.tsx';

const SHOWN = 3;

function ItemBadges({ item }: { item: PriorityItem }) {
  return (
    <span className="mt-1 flex flex-wrap gap-1">
      {item.urgent && <Badge tone="ember">Urgent</Badge>}
      {item.goal && <Badge tone="gold">🎯 Objectif d'Acte</Badge>}
      {item.mine ? <Badge tone="moss">Vous pouvez le faire</Badge> : <Badge tone="neutral">{item.who}</Badge>}
    </span>
  );
}

function ItemRow({ item, onOpen }: { item: PriorityItem; onOpen: () => void }) {
  return (
    <li>
      <button onClick={onOpen} className="flex w-full items-start gap-3 px-4 py-3 text-left active:bg-parchment-100">
        <span className="w-7 shrink-0 pt-0.5 text-center text-xl" aria-hidden="true">
          {item.emoji}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-semibold leading-snug text-ink">{item.title}</span>
          <span className="mt-0.5 block text-sm leading-snug text-ink-soft">{item.short}</span>
          <ItemBadges item={item} />
        </span>
        <span className="shrink-0 self-center text-lg text-wood-500" aria-hidden="true">
          ›
        </span>
      </button>
    </li>
  );
}

function ActProgress({ plan }: { plan: PriorityPlan }) {
  const target = plan.nextAct?.at ?? 100;
  return (
    <div className="px-4">
      <div className="mb-1 flex items-baseline justify-between gap-2 text-xs text-ink-soft">
        <span>{ACT_LABEL[plan.act] ?? `Acte ${plan.act}`}</span>
        <span className="shrink-0 font-semibold text-ink">
          {Math.round(plan.autonomy)} %{plan.nextAct ? ` / ${plan.nextAct.at} %` : ''}
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-parchment-200" role="progressbar" aria-valuenow={Math.round(plan.autonomy)} aria-valuemin={0} aria-valuemax={target}>
        <div className="h-full rounded-full bg-gradient-to-r from-wood-500 to-moss-600" style={{ width: `${Math.min(100, (plan.autonomy / target) * 100)}%` }} />
      </div>
      <p className="mt-1 text-xs text-ink-soft">
        {plan.nextAct ? `Autonomie du hameau : l'Acte ${plan.nextAct.act === 2 ? 'II' : 'III'} commence à ${plan.nextAct.at} %.` : 'Dernier acte : visez la souveraineté.'}
      </p>
    </div>
  );
}

const ROMAN: Record<number, string> = { 1: 'I', 2: 'II', 3: 'III' };

/** Liste à cocher de l'Acte en bref (V5.1) : une pastille par étape, appui = détail. */
function ActGoalsStrip({ goals, onOpen }: { goals: ActGoalsView; onOpen: () => void }) {
  return (
    <button onClick={onOpen} className="mt-2 block w-full px-4 text-left active:bg-parchment-100" aria-label={`Objectifs de l'Acte ${ROMAN[goals.act]} : ${goals.done} sur ${goals.total}`}>
      <span className="flex items-baseline justify-between gap-2 text-xs text-ink-soft">
        <span className="font-semibold text-ink">🎯 Objectifs de l'Acte {ROMAN[goals.act]}</span>
        <span className="shrink-0 font-semibold text-ink">
          {goals.done} / {goals.total} ›
        </span>
      </span>
      <span className="mt-1 flex flex-wrap gap-1.5">
        {goals.goals.map((g) => (
          <span
            key={g.id}
            className={cx('flex h-8 min-w-8 items-center justify-center rounded-full border px-1.5 text-base', g.met ? 'border-moss-600 bg-moss-100' : 'border-parchment-300 bg-parchment-50 opacity-70')}
            title={g.label}
          >
            <span aria-hidden="true">{g.met ? '✅' : g.icon}</span>
          </span>
        ))}
      </span>
      {goals.next && (
        <span className="mt-1 block text-xs leading-snug text-ink-soft">
          Prochaine étape : <strong className="text-ink">{goals.next.label}</strong>
          {goals.next.progress ? ` (${goals.next.progress})` : ''} — {goals.next.reward}.
        </span>
      )}
    </button>
  );
}

/** Fenêtre « Objectifs de l'Acte » : chaque étape, sa progression, comment l'atteindre et sa récompense. */
export function ActGoalsSheet({ goals, onClose }: { goals: ActGoalsView; onClose: () => void }) {
  return (
    <Sheet open onClose={onClose} title={`🎯 Objectifs de l'Acte ${ROMAN[goals.act]}`}>
      <div className="space-y-3 pb-4 text-sm leading-relaxed text-ink">
        <p className="text-ink-soft">
          Chaque étape se coche toute seule dès qu'elle est atteinte (après une action ou la nuit) et verse sa récompense, une seule fois. Les remises
          d'emprunt font monter le pilier dette de l'autonomie.
        </p>
        <ul className="divide-y divide-parchment-200 rounded-2xl border border-parchment-200">
          {goals.goals.map((g) => (
            <li key={g.id} className="px-3 py-2.5">
              <div className="flex items-start gap-2">
                <span className="w-7 shrink-0 text-center text-xl" aria-hidden="true">
                  {g.met ? '✅' : g.icon}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className={cx('font-semibold', g.met ? 'text-moss-700' : 'text-ink')}>{g.label}</span>
                    {g.progress && <span className="shrink-0 text-xs text-ink-soft">{g.progress}</span>}
                  </div>
                  {!g.met && g.progress && (
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-parchment-200">
                      <div className="h-full rounded-full bg-gold-500" style={{ width: `${Math.round(g.ratio * 100)}%` }} />
                    </div>
                  )}
                  <p className="mt-1 text-ink-soft">{g.met ? (g.done ? 'Cochée.' : 'Atteinte : cochée à la prochaine action ou cette nuit.') : g.hint}</p>
                  <p className="text-xs text-ink-soft">🎁 {g.reward}</p>
                </div>
              </div>
            </li>
          ))}
        </ul>
        <p className="rounded-xl bg-gold-100 px-3 py-2 text-sm">
          🏆 Liste terminée : {goals.bonus}
          {goals.bonusPaid ? ' — versée !' : '.'}
        </p>
      </div>
    </Sheet>
  );
}

function PillarBar({ p }: { p: Pillar }) {
  const ratio = p.max === 0 ? 0 : p.value / p.max;
  return (
    <li className="py-2">
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-semibold text-ink">
          {p.emoji} {p.label}
        </span>
        <span className="shrink-0 text-sm text-ink-soft">
          {Math.round(p.value * 10) / 10} / {p.max} pts
        </span>
      </div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-parchment-200">
        <div className={cx('h-full rounded-full', ratio >= 0.8 ? 'bg-moss-600' : ratio >= 0.4 ? 'bg-gold-500' : 'bg-ember-600')} style={{ width: `${Math.min(100, ratio * 100)}%` }} />
      </div>
      <p className="mt-1 text-sm leading-snug text-ink-soft">{p.tip}</p>
    </li>
  );
}

/** Fenêtre « Comprendre la progression » : règles du jeu en bref, piliers, toutes les priorités. */
function ProgressSheet({ plan, onClose, onOpen }: { plan: PriorityPlan; onClose: () => void; onOpen: (item: PriorityItem) => void }) {
  return (
    <Sheet open onClose={onClose} title="Comprendre la progression">
      <div className="space-y-4 pb-4 text-sm leading-relaxed text-ink">
        <p>
          Le but : rendre le hameau <strong>autonome</strong>, puis en faire un Micro-État. L'autonomie (0 à 100 %) se gagne sur six piliers ; l'Acte II
          s'ouvre à 35 % (nouveaux ministères), l'Acte III à 85 % (Constitution, indépendance).
        </p>
        <p className="text-ink-soft">
          Chacun a 3 PA par jour. Toute dépense de plus de 500 € doit être validée par le trésorier, et tout chantier a besoin de l'accord PLU de
          l'architecte : la demande part toute seule, l'action se fait dès que c'est validé.
        </p>
        <ActProgress plan={plan} />
        <ul className="divide-y divide-parchment-200">
          {plan.pillars.map((p) => (
            <PillarBar key={p.id} p={p} />
          ))}
        </ul>
        <h3 className="font-serif text-lg text-ink">Toutes les priorités</h3>
        {plan.items.length === 0 ? (
          <p className="text-ink-soft">Rien d'urgent : le hameau tourne. Continuez les chantiers en cours.</p>
        ) : (
          <ul className="-mx-4 divide-y divide-parchment-200 rounded-2xl border border-parchment-200">
            {plan.items.map((item) => (
              <ItemRow key={item.key} item={item} onOpen={() => onOpen(item)} />
            ))}
          </ul>
        )}
      </div>
    </Sheet>
  );
}

/** Détail d'une priorité : pourquoi, ce qu'il faut savoir, et le bouton pour agir. */
function ItemSheet({ item, onClose, onAct }: { item: PriorityItem; onClose: () => void; onAct: (def: ActionDef, preset?: Partial<ActionInput>) => void }) {
  const def = item.actionCode ? getAction(item.actionCode) : undefined;
  const footer =
    def && item.mine ? (
      <Button className="w-full" size="lg" onClick={() => onAct(def, item.preset)}>
        Faire maintenant : {def.label}
      </Button>
    ) : item.route ? (
      <Button className="w-full" size="lg" onClick={() => {
        navigate(item.route!.name, item.route!.param ?? null, { replace: true });
        onClose();
      }}>
        Y aller
      </Button>
    ) : (
      <Button className="w-full" size="lg" variant="secondary" onClick={() => {
        navigate('gazette', 'taverne', { replace: true });
        onClose();
      }}>
        En parler à la Taverne
      </Button>
    );
  return (
    <Sheet open onClose={onClose} title={`${item.emoji} ${item.title}`} footer={footer}>
      <div className="space-y-3 pb-4 text-sm leading-relaxed text-ink">
        <ItemBadges item={item} />
        <div>
          <h3 className="font-semibold text-ink">Pourquoi maintenant ?</h3>
          <p>{item.why}</p>
        </div>
        {item.gain && (
          <p>
            <span className="font-semibold">Ce que ça rapporte : </span>
            {item.gain}
          </p>
        )}
        <p>
          <span className="font-semibold">Qui peut le faire : </span>
          {item.who}
        </p>
        {item.steps.length > 0 && (
          <div>
            <h3 className="font-semibold text-ink">À savoir</h3>
            <ul className="mt-1 list-disc space-y-1 pl-5 text-ink-soft">
              {item.steps.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ul>
          </div>
        )}
        {!item.mine && def && <p className="text-ink-soft">Ce n'est pas dans votre métier : prévenez la bonne personne, ou proposez de l'aider.</p>}
      </div>
    </Sheet>
  );
}

export function PriorityCard() {
  const data = useData();
  const now = useNow(60_000);
  const plan = useMemo(() => priorityPlan(data, now), [data, now]);
  const [detail, setDetail] = useState<PriorityItem | null>(null);
  const [overview, setOverview] = useState(false);
  const [goalsOpen, setGoalsOpen] = useState(false);
  const [action, setAction] = useState<{ def: ActionDef; preset?: Partial<ActionInput> } | null>(null);
  const shown = plan.items.slice(0, SHOWN);
  return (
    <Card flush>
      <div className="flex items-baseline justify-between gap-2 px-4 pt-3">
        <h2 className="font-serif text-lg text-ink">À faire en priorité</h2>
        <button onClick={() => setOverview(true)} className="min-h-8 shrink-0 text-sm font-semibold text-wood-700">
          Pourquoi ?
        </button>
      </div>
      <div className="mt-1">
        <ActProgress plan={plan} />
        <ActGoalsStrip goals={plan.goals} onOpen={() => setGoalsOpen(true)} />
      </div>
      {shown.length === 0 ? (
        <p className="px-4 py-3 text-sm text-ink-soft">Rien d'urgent : continuez les chantiers en cours. 🌿</p>
      ) : (
        <ul className="mt-2 divide-y divide-parchment-200 border-t border-parchment-200">
          {shown.map((item) => (
            <ItemRow key={item.key} item={item} onOpen={() => setDetail(item)} />
          ))}
        </ul>
      )}
      <button onClick={() => setOverview(true)} className="flex min-h-11 w-full items-center justify-center gap-1 border-t border-parchment-200 text-sm font-semibold text-wood-700 active:bg-parchment-100">
        Comprendre la progression{plan.items.length > SHOWN ? ` · ${plan.items.length - SHOWN} autres priorités` : ''} ›
      </button>

      {goalsOpen && <ActGoalsSheet goals={plan.goals} onClose={() => setGoalsOpen(false)} />}
      {overview && !detail && <ProgressSheet plan={plan} onClose={() => setOverview(false)} onOpen={(item) => setDetail(item)} />}
      {detail && !action && (
        <ItemSheet
          item={detail}
          onClose={() => setDetail(null)}
          onAct={(def, preset) => {
            setOverview(false);
            setAction({ def, preset });
          }}
        />
      )}
      {action && (
        <ActionSheet
          def={action.def}
          holderId={null}
          preset={action.preset}
          onClose={() => {
            setAction(null);
            setDetail(null);
          }}
        />
      )}
    </Card>
  );
}
