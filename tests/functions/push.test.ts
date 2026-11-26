/**
 * Notifications push (V4.3) : le message chiffré par le serveur doit se déchiffrer comme le fait
 * un navigateur (RFC 8291), et le jeton VAPID doit être signé par la clé du serveur (RFC 8292).
 */
import { describe, expect, it } from 'vitest';
import {
  b64urlDecode,
  b64urlEncode,
  buildPushRequest,
  encryptPayload,
  groupNotifications,
  hkdf,
  isGoneStatus,
  vapidAuthorization,
  type QueueRow,
  type WebKeyPair,
  type VapidKeys,
} from '../../supabase/functions/_shared/core/push.ts';

const enc = new TextEncoder();

async function ecdhPair(): Promise<WebKeyPair> {
  return (await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'])) as WebKeyPair;
}

async function vapidKeys(): Promise<VapidKeys> {
  const pair = (await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])) as WebKeyPair;
  const jwk = await crypto.subtle.exportKey('jwk', pair.privateKey);
  const pub = new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey));
  return { publicKey: b64urlEncode(pub), privateKey: jwk.d!, subject: 'https://giggsdiscord.github.io' };
}

/** Déchiffrement côté navigateur (RFC 8291 §3.4, RFC 8188). */
async function decrypt(body: Uint8Array, receiver: WebKeyPair, auth: Uint8Array): Promise<string> {
  const salt = body.slice(0, 16);
  const rs = new DataView(body.buffer, body.byteOffset + 16, 4).getUint32(0);
  const idlen = body[20];
  const serverPublic = body.slice(21, 21 + idlen);
  const ciphertext = body.slice(21 + idlen);
  const receiverPublic = new Uint8Array(await crypto.subtle.exportKey('raw', receiver.publicKey));
  const serverKey = await crypto.subtle.importKey('raw', serverPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const secret = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: serverKey }, receiver.privateKey, 256));
  const keyInfo = new Uint8Array([...enc.encode('WebPush: info\0'), ...receiverPublic, ...serverPublic]);
  const ikm = await hkdf(auth, secret, keyInfo, 32);
  const cek = await hkdf(salt, ikm, enc.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(salt, ikm, enc.encode('Content-Encoding: nonce\0'), 12);
  const key = await crypto.subtle.importKey('raw', cek, { name: 'AES-GCM' }, false, ['decrypt']);
  const plain = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: nonce }, key, ciphertext));
  expect(rs).toBe(4096);
  expect(idlen).toBe(65);
  expect(plain[plain.length - 1]).toBe(2); // délimiteur du dernier enregistrement
  return new TextDecoder().decode(plain.slice(0, -1));
}

describe('Notifications push : chiffrement et VAPID', () => {
  it('base64url aller-retour', () => {
    const bytes = crypto.getRandomValues(new Uint8Array(65));
    expect([...b64urlDecode(b64urlEncode(bytes))]).toEqual([...bytes]);
    expect(b64urlEncode(bytes)).not.toMatch(/[+/=]/);
  });

  it('le téléphone déchiffre le message (RFC 8291)', async () => {
    const receiver = await ecdhPair();
    const auth = crypto.getRandomValues(new Uint8Array(16));
    const receiverPublic = new Uint8Array(await crypto.subtle.exportKey('raw', receiver.publicKey));
    const message = JSON.stringify({ title: '🍺 Julio à la Taverne', body: 'Tournée générale ! ¿Dónde está la ferretería?' });
    const body = await encryptPayload(enc.encode(message), receiverPublic, auth);
    expect(await decrypt(body, receiver, auth)).toBe(message);
  });

  it('jeton VAPID signé par la clé du serveur, audience = origine du service push', async () => {
    const keys = await vapidKeys();
    const header = await vapidAuthorization('https://fcm.googleapis.com/fcm/send/abc', keys, new Date('2026-11-26T17:00:00Z'));
    const [, token, k] = /^vapid t=([^,]+), k=(.+)$/.exec(header)!;
    expect(k).toBe(keys.publicKey);
    const [h, c, s] = token.split('.');
    const claims = JSON.parse(new TextDecoder().decode(b64urlDecode(c)));
    expect(claims).toMatchObject({ aud: 'https://fcm.googleapis.com', sub: 'https://giggsdiscord.github.io' });
    expect(claims.exp).toBe(Math.floor(Date.parse('2026-11-26T17:00:00Z') / 1000) + 12 * 3600);
    const pub = await crypto.subtle.importKey('raw', b64urlDecode(keys.publicKey), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
    const ok = await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, pub, b64urlDecode(s), enc.encode(`${h}.${c}`));
    expect(ok).toBe(true);
  });

  it('requête complète : en-têtes et corps déchiffrable', async () => {
    const keys = await vapidKeys();
    const receiver = await ecdhPair();
    const auth = crypto.getRandomValues(new Uint8Array(16));
    const sub = {
      endpoint: 'https://web.push.apple.com/QGx',
      p256dh: b64urlEncode(new Uint8Array(await crypto.subtle.exportKey('raw', receiver.publicKey))),
      auth: b64urlEncode(auth),
    };
    const payload = { title: '⚔️ Vous êtes appelé en duel', body: 'Julio contre Tanguy', url: '#/duel/x', tag: 'duel', badge: 3 };
    const req = await buildPushRequest(sub, payload, keys, new Date());
    expect(req.url).toBe(sub.endpoint);
    expect(req.headers['Content-Encoding']).toBe('aes128gcm');
    expect(req.headers.TTL).toBe('86400');
    expect(req.headers.Urgency).toBe('high');
    expect(JSON.parse(await decrypt(req.body, receiver, auth))).toEqual(payload);
  });

  it('abonnement disparu : 404 et 410', () => {
    expect(isGoneStatus(410)).toBe(true);
    expect(isGoneStatus(404)).toBe(true);
    expect(isGoneStatus(429)).toBe(false);
  });

  it('regroupe par joueur et par catégorie, garde le plus récent', () => {
    const row = (id: number, player: string, category: string, title: string, body: string): QueueRow => ({
      id, player_id: player, category, title, body, url: '#/gazette/taverne', created_at: '2026-11-26T17:00:00Z',
    });
    const out = groupNotifications(
      [row(3, 'ely', 'taverne', '🍺 Julio à la Taverne', 'Et de trois'), row(1, 'ely', 'taverne', '🍺 Tiph à la Taverne', 'Un'), row(2, 'ely', 'duel', '⚔️ Duel', 'Julio contre Ely'), row(4, 'tiph', 'taverne', '🍺 Ely à la Taverne', 'Salut')],
      new Map([['ely', 5]]),
    );
    expect(out).toHaveLength(3);
    const ely = out.find((o) => o.playerId === 'ely' && o.payload.tag === 'taverne')!;
    expect(ely.payload.title).toBe('🍺 Julio à la Taverne · 2 nouveaux messages à la Taverne');
    expect(ely.payload.body).toBe('Et de trois');
    expect(ely.payload.badge).toBe(5);
    expect(out.find((o) => o.playerId === 'tiph')!.payload.badge).toBe(0);
  });
});

describe('Clés VAPID dans l\'environnement des fonctions', () => {
  it('absentes = notifications désactivées ; contact par défaut = adresse du site', async () => {
    const { readVapid } = await import('../../supabase/functions/_shared/runtime/env.ts');
    expect(readVapid(() => undefined)).toBeNull();
    const env: Record<string, string> = { VAPID_PUBLIC_KEY: 'pub', VAPID_PRIVATE_KEY: 'priv', ALLOWED_ORIGIN: 'https://giggsdiscord.github.io' };
    expect(readVapid((k) => env[k])).toEqual({ publicKey: 'pub', privateKey: 'priv', subject: 'https://giggsdiscord.github.io' });
    expect(readVapid((k) => ({ ...env, ALLOWED_ORIGIN: '*' })[k])?.subject).toBe('https://github.com');
  });
});
