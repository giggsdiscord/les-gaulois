/**
 * Envoi des notifications push (V4.3) : réserve la file (claim_notifications), regroupe,
 * chiffre et envoie à chaque appareil abonné. Appelé par daily-world-sync en mode « push »
 * (réveillé par la base à chaque nouvelle notification) et à chaque maintenance (filet de sécurité).
 */
import { buildPushRequest, groupNotifications, importVapidPrivateKey, isGoneStatus, type PushSubscriptionRow, type QueueRow, type VapidKeys } from '../core/push.ts';
import { callRpc, type Db } from './db.ts';

export interface PushReport {
  claimed: number;
  notifications: number;
  sent: number;
  failed: number;
  removed: number;
  disabled?: boolean;
}

export async function dispatchPush(db: Db, vapid: VapidKeys | null, now: Date): Promise<PushReport> {
  const rows = ((await callRpc(db, 'claim_notifications', { p_limit: 200 })) ?? []) as QueueRow[];
  const report: PushReport = { claimed: rows.length, notifications: 0, sent: 0, failed: 0, removed: 0 };
  if (rows.length === 0) return report;
  if (!vapid) return { ...report, disabled: true }; // clés absentes : la file est vidée sans envoi

  const playerIds = [...new Set(rows.map((r) => r.player_id))];
  const { data: subsData, error } = await db.from('push_subscriptions').select('id, player_id, endpoint, p256dh, auth').in('player_id', playerIds);
  if (error) throw new Error(`push_subscriptions : ${error.message}`);
  const subs = (subsData ?? []) as PushSubscriptionRow[];

  const badges = new Map<string, number>();
  await Promise.all(
    playerIds.map(async (id) => {
      const counts = (await callRpc(db, 'unread_counts_for', { p_player: id })) as { total?: number } | null;
      badges.set(id, Number(counts?.total ?? 0));
    }),
  );

  const signingKey = await importVapidPrivateKey(vapid);
  const groups = groupNotifications(rows, badges);
  report.notifications = groups.length;
  const tasks: Promise<void>[] = [];
  for (const { playerId, payload } of groups) {
    for (const sub of subs.filter((s) => s.player_id === playerId)) {
      tasks.push(
        (async () => {
          try {
            const req = await buildPushRequest(sub, payload, vapid, now, signingKey);
            const res = await fetch(req.url, { method: 'POST', headers: req.headers, body: req.body });
            await res.body?.cancel();
            if (res.ok) {
              report.sent += 1;
              await db.from('push_subscriptions').update({ last_success_at: now.toISOString(), failure_count: 0 }).eq('id', sub.id);
            } else if (isGoneStatus(res.status)) {
              report.removed += 1;
              await db.from('push_subscriptions').delete().eq('id', sub.id);
            } else {
              report.failed += 1;
              console.warn(`Notification refusée (${res.status}) par ${new URL(sub.endpoint).host}`);
            }
          } catch (err) {
            report.failed += 1;
            console.warn('Notification non envoyée', err);
          }
        })(),
      );
    }
  }
  await Promise.all(tasks);
  return report;
}
