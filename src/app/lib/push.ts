/**
 * Notifications push côté navigateur (V4.3) : abonnement de l'appareil (Push API + service worker),
 * pastille de l'icône de l'appli (Badging API), navigation au clic sur une notification.
 */
import type { GameApi, NotificationSettings } from '../api/types.ts';
import { isIosDevice } from './installMode.ts';
import { base64UrlToBytes, pushState, sameBytes, type PushState } from './pushState.ts';

type BadgeNavigator = Navigator & { setAppBadge?: (n: number) => Promise<void>; clearAppBadge?: () => Promise<void>; standalone?: boolean };

function isStandalone(): boolean {
  return (navigator as BadgeNavigator).standalone === true || window.matchMedia?.('(display-mode: standalone)').matches === true;
}

async function registration(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) return null;
  return (await navigator.serviceWorker.getRegistration()) ?? null;
}

export async function currentSubscription(): Promise<PushSubscription | null> {
  const reg = await registration();
  return reg && 'pushManager' in reg ? reg.pushManager.getSubscription() : null;
}

export async function detectPushState(api: GameApi): Promise<PushState> {
  const hasNotification = typeof window !== 'undefined' && 'Notification' in window;
  return pushState({
    hasKey: api.pushPublicKey !== null,
    hasServiceWorker: 'serviceWorker' in navigator,
    hasPushManager: 'PushManager' in window,
    hasNotification,
    ios: isIosDevice(navigator.userAgent, navigator.maxTouchPoints ?? 0),
    standalone: isStandalone(),
    permission: hasNotification ? Notification.permission : 'default',
    subscribed: (await currentSubscription().catch(() => null)) !== null,
  });
}

function toInput(sub: PushSubscription) {
  const json = sub.toJSON();
  if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) throw new Error('Abonnement incomplet renvoyé par le navigateur.');
  return { endpoint: json.endpoint, p256dh: json.keys.p256dh, auth: json.keys.auth, userAgent: navigator.userAgent };
}

/** Demande l'autorisation (à appeler depuis un clic) puis abonne cet appareil. */
export async function enablePush(api: GameApi): Promise<NotificationSettings> {
  if (!api.pushPublicKey) throw new Error('Notifications indisponibles sur ce serveur.');
  const reg = await registration();
  if (!reg) throw new Error("L'appli n'est pas encore prête : rechargez la page puis réessayez.");
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new Error('Notifications refusées : autorisez-les dans les réglages du navigateur.');
  const key = base64UrlToBytes(api.pushPublicKey);
  let sub = await reg.pushManager.getSubscription();
  if (sub && !sameBytes(sub.options.applicationServerKey, key)) {
    await sub.unsubscribe(); // clé du serveur changée : nouvel abonnement
    sub = null;
  }
  sub ??= await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
  return api.savePushSubscription(toInput(sub));
}

export async function disablePush(api: GameApi): Promise<NotificationSettings> {
  const sub = await currentSubscription();
  if (!sub) return api.notificationSettings();
  const endpoint = sub.endpoint;
  await sub.unsubscribe().catch(() => false);
  return api.deletePushSubscription(endpoint);
}

/** À l'ouverture : rattache l'abonnement existant de l'appareil au joueur connecté (changement de personnage). */
export async function syncPushSubscription(api: GameApi): Promise<void> {
  if (!api.pushPublicKey || !('Notification' in window) || Notification.permission !== 'granted') return;
  const sub = await currentSubscription();
  if (sub && sameBytes(sub.options.applicationServerKey, base64UrlToBytes(api.pushPublicKey))) await api.savePushSubscription(toInput(sub));
}

/** Pastille de l'icône de l'appli installée (Chrome, Edge, Safari iOS 16.4+ ; ignorée ailleurs). */
export function setAppBadge(count: number): void {
  const nav = navigator as BadgeNavigator;
  const done = count > 0 ? nav.setAppBadge?.(count) : nav.clearAppBadge?.();
  done?.catch(() => undefined);
}

/** Clic sur une notification alors que l'appli est ouverte : le service worker demande d'aller à l'écran visé. */
export function listenServiceWorkerMessages(): void {
  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.addEventListener('message', (event: MessageEvent) => {
    const msg = event.data as { type?: string; url?: string } | null;
    if (msg?.type === 'gaulois:navigate' && typeof msg.url === 'string' && msg.url.startsWith('#/')) window.location.hash = msg.url;
  });
}
