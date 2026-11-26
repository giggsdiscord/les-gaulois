/** Pastilles et notifications (V4.3) : mode démo (même calcul que unread_counts_for) et état push. */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DemoApi } from '../../src/app/api/demo.ts';
import { demoPlayerId } from '../../src/app/demo/seed.ts';
import { base64UrlToBytes, pushState, sameBytes, type PushEnv } from '../../src/app/lib/pushState.ts';

function memoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (k) => map.get(k) ?? null,
    key: (i) => [...map.keys()][i] ?? null,
    removeItem: (k) => void map.delete(k),
    setItem: (k, v) => void map.set(k, String(v)),
  };
}

const GUILLEM = demoPlayerId(2);
const TIPH = demoPlayerId(3);

async function as(api: DemoApi, id: string) {
  api.setToken(await api.login(id, '0000'));
}

describe('Pastilles en mode démo', () => {
  beforeEach(() => vi.stubGlobal('localStorage', memoryStorage()));

  it('messages, chuchotements et Gazette non lus, puis lus', async () => {
    const api = new DemoApi();
    await as(api, TIPH);
    const start = await api.unreadCounts();
    expect(start.gazette).toBe(1);
    expect(start.village_square).toBe(1); // message de bienvenue du système

    await as(api, GUILLEM);
    await api.postMessage('village_square', 'Tournée générale !');
    await api.postMessage('whisper', 'Rendez-vous au moulin.', [TIPH]);
    expect((await api.unreadCounts()).village_square).toBe(1); // ses propres messages ne comptent pas

    await as(api, TIPH);
    const before = await api.unreadCounts();
    expect(before.village_square).toBe(2);
    expect(before.whisper).toBe(1);
    expect(before.total).toBeGreaterThanOrEqual(4);
    const after = await api.markSeen('village_square');
    expect(after.village_square).toBe(0);
    expect(after.whisper).toBe(1);
    expect((await api.markSeen('gazette')).gazette).toBe(0);
  });

  it('catégories de notifications ; pas d\'abonnement push en démo', async () => {
    const api = new DemoApi();
    await as(api, TIPH);
    expect(api.pushPublicKey).toBeNull();
    expect((await api.notificationSettings()).categories).toHaveLength(7);
    const saved = await api.setNotificationCategories(['duel', 'chuchotement']);
    expect(saved.categories).toEqual(['chuchotement', 'duel']);
    await expect(api.savePushSubscription()).rejects.toThrow(/démo/);
  });
});

describe('État des notifications sur l\'appareil', () => {
  const base: PushEnv = { hasKey: true, hasServiceWorker: true, hasPushManager: true, hasNotification: true, ios: false, standalone: false, permission: 'default', subscribed: false };

  it('choisit le bon message', () => {
    expect(pushState({ ...base, hasKey: false })).toBe('unavailable');
    expect(pushState({ ...base, ios: true })).toBe('needs-install');
    expect(pushState({ ...base, ios: true, standalone: true })).toBe('off');
    expect(pushState({ ...base, hasPushManager: false })).toBe('unsupported');
    expect(pushState({ ...base, permission: 'denied' })).toBe('denied');
    expect(pushState({ ...base, permission: 'granted', subscribed: true })).toBe('on');
    expect(pushState({ ...base, permission: 'default', subscribed: true })).toBe('off');
  });

  it('clé VAPID base64url → octets, comparaison', () => {
    const bytes = base64UrlToBytes('BAEC_-8');
    expect([...bytes]).toEqual([4, 1, 2, 255, 239]);
    expect(sameBytes(bytes.buffer, bytes)).toBe(true);
    expect(sameBytes(null, bytes)).toBe(false);
  });
});
