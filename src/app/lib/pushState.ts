/** État des notifications push sur cet appareil (logique pure, testée). GDD §7.6, V4.3. */

export type PushState =
  /** Pas de clé VAPID (mode démo, ou notifications non configurées sur le serveur). */
  | 'unavailable'
  /** Le navigateur ne sait pas recevoir de notifications push. */
  | 'unsupported'
  /** iPhone / iPad : il faut d'abord installer l'appli sur l'écran d'accueil. */
  | 'needs-install'
  /** Le joueur a refusé : à réautoriser dans les réglages du navigateur. */
  | 'denied'
  | 'off'
  | 'on';

export interface PushEnv {
  hasKey: boolean;
  hasServiceWorker: boolean;
  hasPushManager: boolean;
  hasNotification: boolean;
  ios: boolean;
  standalone: boolean;
  permission: 'default' | 'granted' | 'denied';
  subscribed: boolean;
}

export function pushState(env: PushEnv): PushState {
  if (!env.hasKey) return 'unavailable';
  if (env.ios && !env.standalone) return 'needs-install';
  if (!env.hasServiceWorker || !env.hasPushManager || !env.hasNotification) return 'unsupported';
  if (env.permission === 'denied') return 'denied';
  return env.subscribed && env.permission === 'granted' ? 'on' : 'off';
}

/** Clé publique VAPID base64url → octets (applicationServerKey). */
export function base64UrlToBytes(text: string): Uint8Array<ArrayBuffer> {
  const b64 = text.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(text.length / 4) * 4, '=');
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function sameBytes(a: ArrayBuffer | Uint8Array | null | undefined, b: Uint8Array): boolean {
  if (!a) return false;
  const x = a instanceof Uint8Array ? a : new Uint8Array(a);
  return x.length === b.length && x.every((v, i) => v === b[i]);
}
