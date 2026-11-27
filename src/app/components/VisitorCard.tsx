/**
 * Visiteurs imprévus (V5.9) : le visiteur du jour, le temps restant avant 21 h et un bouton par réponse.
 * Accueil (seulement quand quelqu'un attend) et Agora (complet : dernière visite).
 */
import { useMemo, useState } from 'react';
import { constants as C } from '../engine.ts';
import { visitorsView } from '../lib/visitors.ts';
import { useData, useGame, useNow } from '../state/GameContext.tsx';
import { Badge, Button, Card } from './ui.tsx';

export function VisitorCard({ full = false }: { full?: boolean }) {
  const data = useData();
  const { api, perform, toast } = useGame();
  const now = useNow(60_000);
  const view = useMemo(() => visitorsView(data, now), [data, now]);
  const [busy, setBusy] = useState(false);
  const m = view.visit;
  if (!m && !(full && view.last)) return null;
  const myAp = data.me.action_points;

  async function answer(choice: string) {
    setBusy(true);
    const r = await perform(
      () => api.action({ action_code: 'answer_visitor', params: { choice } }),
      (res) => (res.ok ? res.narrative ?? 'Réponse donnée.' : undefined),
    );
    setBusy(false);
    if (r && !r.ok) toast('error', r.error ?? 'Action refusée.');
  }

  return (
    <Card title={m ? `${m.def.icon} ${m.def.title}` : '🚪 Visiteurs'} subtitle={m ? `Réponse avant ${C.VISITOR_DUE_HOUR} h` : undefined} tone={m?.urgent ? 'warning' : 'default'}>
      {m ? (
        <div className="space-y-2" data-visitor={m.def.id}>
          <p className="text-sm text-ink">{m.def.arrival}</p>
          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            <Badge tone={m.urgent ? 'ember' : 'neutral'}>{m.deadline}</Badge>
          </div>
          <p className="text-xs text-ember-600">
            Sans réponse : {m.ignored.label.toLowerCase()}
            {m.ignored.effects ? ` (${m.ignored.effects})` : ''}.
          </p>
          <ul className="space-y-2">
            {m.choices.map((c) => (
              <li key={c.def.id}>
                <Button className="w-full" variant="moss" disabled={busy || myAp < 1 || !!m.blocked || !!c.blocked || data.village.is_defeated} onClick={() => void answer(c.def.id)}>
                  {c.def.icon} {c.def.label} (1 PA{c.cost ? ` + ${c.cost}` : ''})
                </Button>
                <p className="mt-0.5 text-xs text-ink-soft">{c.blocked ?? c.effects}</p>
              </li>
            ))}
          </ul>
          {(m.blocked || myAp < 1) && <p className="text-xs text-ember-600">{m.blocked ?? 'Plus de PA aujourd’hui.'}</p>}
        </div>
      ) : (
        <p className="text-sm text-ink-soft">Personne au portail pour l’instant : un visiteur peut se présenter certaines nuits.</p>
      )}
      {full && view.last && <p className="mt-2 text-xs text-ink-soft">Dernière visite — {view.last}</p>}
    </Card>
  );
}
