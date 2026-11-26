/**
 * Notifications push (V4.3) — logique pure, WebCrypto uniquement (Deno, Node, navigateurs).
 * - Chiffrement du message : RFC 8291 (Message Encryption for Web Push, « aes128gcm », RFC 8188).
 * - Identification du serveur : RFC 8292 (VAPID, jeton JWT ES256).
 * - Regroupement : plusieurs messages d'une même catégorie pour un joueur → une seule notification.
 */

export interface VapidKeys {
  /** Clé publique P-256 non compressée (65 octets), base64url — aussi fournie au navigateur. */
  publicKey: string;
  /** Clé privée P-256 (scalaire de 32 octets), base64url. */
  privateKey: string;
  /** Contact du serveur d'envoi : « mailto:… » ou URL https. */
  subject: string;
}

export interface PushSubscriptionRow {
  id: string;
  player_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}

export interface QueueRow {
  id: number;
  player_id: string;
  category: string;
  title: string;
  body: string;
  url: string;
  created_at: string;
}

export interface PushPayload {
  title: string;
  body: string;
  url: string;
  tag: string;
  /** Total des pastilles du joueur, pour l'icône de l'appli. */
  badge: number;
}

export interface PushRequest {
  url: string;
  headers: Record<string, string>;
  body: Uint8Array<ArrayBuffer>;
}

/** Types WebCrypto dérivés de crypto.subtle (identiques sous Deno, Node et navigateurs, sans lib DOM). */
export type WebKey = Awaited<ReturnType<typeof crypto.subtle.importKey>>;
export interface WebKeyPair {
  publicKey: WebKey;
  privateKey: WebKey;
}

const enc = new TextEncoder();

// ---------------------------------------------------------------------------
// base64url
// ---------------------------------------------------------------------------
export function b64urlEncode(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function b64urlDecode(text: string): Uint8Array<ArrayBuffer> {
  const b64 = text.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(text.length / 4) * 4, '=');
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function concat(...parts: Uint8Array[]): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let offset = 0;
  for (const p of parts) {
    out.set(p, offset);
    offset += p.length;
  }
  return out;
}

async function hmac(key: Uint8Array, data: Uint8Array): Promise<Uint8Array<ArrayBuffer>> {
  const k = await crypto.subtle.importKey('raw', copy(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', k, copy(data)));
}

function copy(bytes: Uint8Array): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(bytes.length);
  out.set(bytes);
  return out;
}

/** HKDF-SHA-256 sur un seul bloc (longueur ≤ 32), suffisant pour RFC 8291. */
export async function hkdf(salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, length: number): Promise<Uint8Array<ArrayBuffer>> {
  const prk = await hmac(salt, ikm);
  const okm = await hmac(prk, concat(info, new Uint8Array([1])));
  return okm.slice(0, length);
}

// ---------------------------------------------------------------------------
// RFC 8291 : chiffrement aes128gcm
// ---------------------------------------------------------------------------
export interface EncryptOptions {
  /** Pour les tests : sel et paire de clés éphémère imposés. */
  salt?: Uint8Array;
  serverKeys?: WebKeyPair;
}

export async function encryptPayload(
  plaintext: Uint8Array,
  receiverPublicKey: Uint8Array,
  authSecret: Uint8Array,
  options: EncryptOptions = {},
): Promise<Uint8Array<ArrayBuffer>> {
  const serverKeys =
    options.serverKeys ?? ((await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'])) as WebKeyPair);
  const serverPublic = new Uint8Array(await crypto.subtle.exportKey('raw', serverKeys.publicKey));
  const receiverKey = await crypto.subtle.importKey('raw', copy(receiverPublicKey), { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const ecdhSecret = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: receiverKey }, serverKeys.privateKey, 256));

  const keyInfo = concat(enc.encode('WebPush: info\0'), receiverPublicKey, serverPublic);
  const ikm = await hkdf(authSecret, ecdhSecret, keyInfo, 32);
  const salt = options.salt ? copy(options.salt) : crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(salt, ikm, enc.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(salt, ikm, enc.encode('Content-Encoding: nonce\0'), 12);

  const aesKey = await crypto.subtle.importKey('raw', cek, { name: 'AES-GCM' }, false, ['encrypt']);
  // Un seul enregistrement : délimiteur final 0x02, sans remplissage
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, aesKey, concat(plaintext, new Uint8Array([2]))));

  const recordSize = new Uint8Array(4);
  new DataView(recordSize.buffer).setUint32(0, 4096);
  return concat(salt, recordSize, new Uint8Array([serverPublic.length]), serverPublic, ciphertext);
}

// ---------------------------------------------------------------------------
// RFC 8292 : VAPID
// ---------------------------------------------------------------------------
export async function importVapidPrivateKey(keys: VapidKeys): Promise<WebKey> {
  const pub = b64urlDecode(keys.publicKey);
  if (pub.length !== 65 || pub[0] !== 4) throw new Error('VAPID_PUBLIC_KEY invalide (65 octets non compressés attendus).');
  return crypto.subtle.importKey(
    'jwk',
    { kty: 'EC', crv: 'P-256', d: keys.privateKey, x: b64urlEncode(pub.slice(1, 33)), y: b64urlEncode(pub.slice(33, 65)), ext: true },
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign'],
  );
}

export async function vapidAuthorization(endpoint: string, keys: VapidKeys, now: Date, signingKey?: WebKey): Promise<string> {
  const header = b64urlEncode(enc.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const claims = b64urlEncode(
    enc.encode(JSON.stringify({ aud: new URL(endpoint).origin, exp: Math.floor(now.getTime() / 1000) + 12 * 3600, sub: keys.subject })),
  );
  const unsigned = `${header}.${claims}`;
  const key = signingKey ?? (await importVapidPrivateKey(keys));
  // WebCrypto renvoie la signature au format r‖s (64 octets) attendu par JWS
  const signature = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, enc.encode(unsigned)));
  return `vapid t=${unsigned}.${b64urlEncode(signature)}, k=${keys.publicKey}`;
}

export async function buildPushRequest(
  subscription: Pick<PushSubscriptionRow, 'endpoint' | 'p256dh' | 'auth'>,
  payload: PushPayload,
  keys: VapidKeys,
  now: Date,
  signingKey?: WebKey,
): Promise<PushRequest> {
  const body = await encryptPayload(enc.encode(JSON.stringify(payload)), b64urlDecode(subscription.p256dh), b64urlDecode(subscription.auth));
  return {
    url: subscription.endpoint,
    headers: {
      Authorization: await vapidAuthorization(subscription.endpoint, keys, now, signingKey),
      'Content-Encoding': 'aes128gcm',
      'Content-Type': 'application/octet-stream',
      TTL: '86400',
      Urgency: payload.tag === 'duel' || payload.tag === 'chuchotement' ? 'high' : 'normal',
    },
    body,
  };
}

/** 404 / 410 : l'abonnement n'existe plus (appli désinstallée, permission retirée) → à supprimer. */
export function isGoneStatus(status: number): boolean {
  return status === 404 || status === 410;
}

// ---------------------------------------------------------------------------
// Regroupement des notifications
// ---------------------------------------------------------------------------
const PLURAL: Record<string, string> = {
  taverne: 'nouveaux messages à la Taverne',
  chuchotement: 'chuchotements',
  agora: 'nouvelles de l\'Agora',
  validation: 'validations en attente',
  duel: 'duels',
};

/** Une notification par joueur et par catégorie (la plus récente, avec le nombre de messages). */
export function groupNotifications(rows: QueueRow[], badges: Map<string, number>): { playerId: string; payload: PushPayload }[] {
  const groups = new Map<string, QueueRow[]>();
  for (const row of [...rows].sort((a, b) => a.id - b.id)) {
    const key = `${row.player_id}|${row.category}`;
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  return [...groups.values()].map((list) => {
    const last = list[list.length - 1];
    const more = list.length - 1;
    const title = more > 0 && PLURAL[last.category] ? `${last.title} · ${list.length} ${PLURAL[last.category]}` : last.title;
    return {
      playerId: last.player_id,
      payload: { title, body: last.body, url: last.url, tag: last.category, badge: badges.get(last.player_id) ?? 0 },
    };
  });
}
