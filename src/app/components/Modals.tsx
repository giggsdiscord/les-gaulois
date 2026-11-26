/** Fenêtres imposées : changement du PIN initial, Tentations & Dérives. */
import { useEffect, useState } from 'react';
import { TEMPTATION_CATEGORY } from '../lib/labels.ts';
import { countdown } from '../lib/format.ts';
import { useData, useGame, useNow } from '../state/GameContext.tsx';
import { Button, Field, Input, Sheet } from './ui.tsx';

export function ChangePinModal({ forced, onClose }: { forced?: boolean; onClose?: () => void }) {
  const { api, perform } = useGame();
  const [oldPin, setOldPin] = useState(forced ? '0000' : '');
  const [pin, setPin] = useState('');
  const [confirm, setConfirm] = useState('');
  const valid = /^\d{4}$/.test(pin) && pin === confirm && pin !== '0000';
  return (
    <Sheet open persistent={forced} onClose={() => !forced && onClose?.()} title={forced ? 'Choisissez votre code PIN' : 'Changer mon code PIN'}>
      {forced && <p className="mb-4 text-sm text-ink-soft">Première connexion : remplacez le code « 0000 » par un code personnel à 4 chiffres.</p>}
      <div className="space-y-3">
        {!forced && (
          <Field label="Code actuel">
            <Input inputMode="numeric" maxLength={4} value={oldPin} onChange={(e) => setOldPin(e.target.value.replace(/\D/g, ''))} />
          </Field>
        )}
        <Field label="Nouveau code (4 chiffres)">
          <Input inputMode="numeric" maxLength={4} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))} />
        </Field>
        <Field label="Confirmation">
          <Input inputMode="numeric" maxLength={4} value={confirm} onChange={(e) => setConfirm(e.target.value.replace(/\D/g, ''))} />
        </Field>
        <Button className="w-full" disabled={!valid} onClick={() => void perform(() => api.setPin(oldPin, pin), 'Code PIN enregistré.').then(() => onClose?.())}>
          Enregistrer
        </Button>
      </div>
    </Sheet>
  );
}

export const TEMPTATION_REOPEN_EVENT = 'gaulois:temptation';

export function TemptationModal() {
  const data = useData();
  const { api, perform, toast } = useGame();
  const now = useNow(1000);
  const [dismissed, setDismissed] = useState<string | null>(null);
  // « Décider plus tard » : la liste « À faire » de l'accueil rouvre la fenêtre (V4.4)
  useEffect(() => {
    const reopen = () => setDismissed(null);
    window.addEventListener(TEMPTATION_REOPEN_EVENT, reopen);
    return () => window.removeEventListener(TEMPTATION_REOPEN_EVENT, reopen);
  }, []);
  const pending = data.temptations.find((t) => t.choice === 'pending' && new Date(t.expires_at).getTime() > now.getTime() && t.id !== dismissed);
  if (!pending) return null;
  const answer = async (yieldToIt: boolean) => {
    const r = await perform(() => api.respondTemptation(pending.id, yieldToIt));
    if (r && yieldToIt) toast('info', 'Pensez à vous confesser à Brunel avant la parution de La Gazette (00:05).');
    else if (r) toast('success', r.narrative ?? 'Vous avez résisté.');
  };
  return (
    <Sheet open onClose={() => setDismissed(pending.id)} title={pending.title}>
      <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-ember-600">{TEMPTATION_CATEGORY[pending.category]}</p>
      <p className="mb-4 font-serif text-lg leading-relaxed text-ink">{pending.prompt_text}</p>
      <p className="mb-5 text-sm text-ink-soft">
        Céder : +20 % de moral tout de suite, −2 PA demain, et un scandale dans La Gazette si vous ne vous confessez pas à Brunel. Expire dans {countdown(pending.expires_at, now)}.
      </p>
      <div className="grid grid-cols-2 gap-3">
        <Button variant="danger" onClick={() => void answer(true)}>
          Céder
        </Button>
        <Button variant="moss" onClick={() => void answer(false)}>
          Résister
        </Button>
      </div>
      <Button variant="ghost" className="mt-3 w-full" onClick={() => setDismissed(pending.id)}>
        Décider plus tard
      </Button>
    </Sheet>
  );
}
