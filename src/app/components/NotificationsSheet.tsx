/** Réglage des notifications (V4.3) : activer sur cet appareil, choisir les catégories. */
import { useCallback, useEffect, useState } from 'react';
import { NOTIFICATION_CATEGORIES, type NotificationCategory, type NotificationSettings } from '../api/types.ts';
import { detectPushState, disablePush, enablePush } from '../lib/push.ts';
import type { PushState } from '../lib/pushState.ts';
import { useGame } from '../state/GameContext.tsx';
import { BellIcon } from './icons.tsx';
import { Button, Sheet, Spinner, cx } from './ui.tsx';

const LABELS: Record<NotificationCategory, { emoji: string; label: string; hint: string }> = {
  taverne: { emoji: '🍺', label: 'Taverne', hint: "Messages de la place du village et de la salle de l'Agora" },
  chuchotement: { emoji: '🤫', label: 'Chuchotements', hint: 'Messages privés qui vous sont adressés' },
  duel: { emoji: '⚔️', label: 'Duels', hint: 'Quand vous êtes appelé en duel' },
  agora: { emoji: '🏛️', label: 'Agora', hint: 'Nouvelles propositions, motions qui vous visent, résultats des votes' },
  validation: { emoji: '✅', label: 'Validations', hint: 'Quand une demande attend votre accord' },
  gazette: { emoji: '📰', label: 'Gazette', hint: 'La Gazette du matin' },
  prive: { emoji: '🕯️', label: 'Propositions discrètes', hint: 'Une tentation vous attend (sans rien dévoiler)' },
};

const STATE_TEXT: Record<PushState, string> = {
  unavailable: "Les notifications ne sont pas disponibles ici (mode démo, ou serveur pas encore configuré). Les pastilles rouges dans l'appli fonctionnent quand même.",
  unsupported: "Ce navigateur ne sait pas recevoir de notifications. Les pastilles rouges dans l'appli fonctionnent quand même.",
  'needs-install': "Sur iPhone et iPad, installez d'abord l'appli (bouton « Installer l'appli » de l'écran de connexion), puis ouvrez-la depuis l'écran d'accueil pour activer les notifications.",
  denied: 'Les notifications sont bloquées pour ce site. Autorisez-les dans les réglages du navigateur (ou du téléphone), puis revenez ici.',
  off: 'Recevez une notification sur cet appareil, même appli fermée.',
  on: '✅ Activées sur cet appareil.',
};

export function NotificationsButton() {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  return (
    <>
      <button onClick={() => setOpen(true)} className="rounded-full p-1.5 text-parchment-100 hover:bg-black/20" aria-label="Notifications" title="Notifications">
        <BellIcon className="h-5 w-5" />
      </button>
      {open && <NotificationsSheet onClose={close} />}
    </>
  );
}

function NotificationsSheet({ onClose }: { onClose: () => void }) {
  const { api, toast } = useGame();
  const [state, setState] = useState<PushState | null>(null);
  const [settings, setSettings] = useState<NotificationSettings | null>(null);
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    setState(await detectPushState(api));
    setSettings(await api.notificationSettings().catch(() => null));
  }, [api]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const toggleDevice = async () => {
    setBusy(true);
    try {
      setSettings(state === 'on' ? await disablePush(api) : await enablePush(api));
      toast('success', state === 'on' ? 'Notifications désactivées sur cet appareil.' : 'Notifications activées sur cet appareil.');
    } catch (e) {
      toast('error', e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
      void reload();
    }
  };

  const toggleCategory = async (category: NotificationCategory) => {
    if (!settings) return;
    const next = settings.categories.includes(category) ? settings.categories.filter((c) => c !== category) : [...settings.categories, category];
    setSettings({ ...settings, categories: next });
    try {
      setSettings(await api.setNotificationCategories(next));
    } catch (e) {
      toast('error', e instanceof Error ? e.message : String(e));
      void reload();
    }
  };

  return (
    <Sheet open onClose={onClose} title="Notifications">
      {state === null ? (
        <Spinner />
      ) : (
        <div className="space-y-5">
          <div className="rounded-2xl bg-white/80 p-4 shadow-sm">
            <p className="text-sm text-ink">{STATE_TEXT[state]}</p>
            {(state === 'off' || state === 'on') && (
              <Button className="mt-3 w-full" variant={state === 'on' ? 'secondary' : 'primary'} disabled={busy} onClick={() => void toggleDevice()}>
                {busy ? <Spinner /> : state === 'on' ? 'Désactiver sur cet appareil' : 'Activer les notifications'}
              </Button>
            )}
            {settings && settings.devices > 0 && (
              <p className="mt-2 text-xs text-ink-soft">
                {settings.devices} appareil{settings.devices > 1 ? 's' : ''} abonné{settings.devices > 1 ? 's' : ''} pour votre personnage.
              </p>
            )}
          </div>
          {settings && state !== 'unavailable' && (
            <div>
              <p className="mb-2 text-sm font-semibold text-ink">Me prévenir pour…</p>
              <ul className="space-y-2">
                {NOTIFICATION_CATEGORIES.map((c) => {
                  const on = settings.categories.includes(c);
                  return (
                    <li key={c}>
                      <label className={cx('flex cursor-pointer items-start gap-3 rounded-xl border p-3', on ? 'border-wood-600/40 bg-white' : 'border-parchment-200 bg-parchment-100/60')}>
                        <input type="checkbox" className="mt-1 h-4 w-4 accent-wood-600" checked={on} onChange={() => void toggleCategory(c)} />
                        <span>
                          <span className="block text-sm font-semibold text-ink">
                            {LABELS[c].emoji} {LABELS[c].label}
                          </span>
                          <span className="block text-xs text-ink-soft">{LABELS[c].hint}</span>
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
          <p className="text-xs text-ink-soft">Les pastilles rouges des onglets (et de l'icône de l'appli installée) signalent ce que vous n'avez pas encore lu.</p>
        </div>
      )}
    </Sheet>
  );
}
