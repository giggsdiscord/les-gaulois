/**
 * Pastilles rouges (V4.3) : compteurs de non-lus du joueur, rafraîchis en temps réel, au retour
 * sur l'appli et toutes les 30 s, reportés sur l'icône de l'appli installée.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { UnreadArea, UnreadCounts } from '../api/types.ts';
import { setAppBadge, syncPushSubscription } from '../lib/push.ts';
import { useGame } from './GameContext.tsx';

interface UnreadValue {
  counts: UnreadCounts | null;
  markSeen: (area: UnreadArea) => void;
  refresh: () => void;
}

const UnreadContext = createContext<UnreadValue>({ counts: null, markSeen: () => undefined, refresh: () => undefined });

const WATCHED = new Set(['tavern_messages', 'gazette_editions', 'agora_proposals', 'carlage_duels', 'pending_approvals']);

export function UnreadProvider({ children }: { children: ReactNode }) {
  const { api } = useGame();
  const [counts, setCounts] = useState<UnreadCounts | null>(null);
  const countsRef = useRef<UnreadCounts | null>(null);
  countsRef.current = counts;

  const refresh = useCallback(() => {
    api.unreadCounts().then(setCounts).catch(() => undefined);
  }, [api]);

  useEffect(() => {
    refresh();
    void syncPushSubscription(api).catch(() => undefined);
    let timer: number | undefined;
    const unsubscribe = api.subscribe((table) => {
      if (!WATCHED.has(table)) return;
      window.clearTimeout(timer);
      timer = window.setTimeout(refresh, 400);
    });
    const poll = window.setInterval(refresh, 30_000);
    const onVisible = () => document.visibilityState === 'visible' && refresh();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      unsubscribe();
      window.clearTimeout(timer);
      window.clearInterval(poll);
      document.removeEventListener('visibilitychange', onVisible);
      setAppBadge(0);
    };
  }, [api, refresh]);

  useEffect(() => {
    if (counts) setAppBadge(counts.total);
  }, [counts]);

  const markSeen = useCallback(
    (area: UnreadArea) => {
      const current = countsRef.current;
      if (current && current[area] === 0) return; // rien de neuf : pas d'appel réseau
      if (current) setCounts({ ...current, [area]: 0, total: Math.max(0, current.total - current[area]) });
      api.markSeen(area).then(setCounts).catch(() => undefined);
    },
    [api],
  );

  const value = useMemo(() => ({ counts, markSeen, refresh }), [counts, markSeen, refresh]);
  return <UnreadContext.Provider value={value}>{children}</UnreadContext.Provider>;
}

export function useUnread(): UnreadValue {
  return useContext(UnreadContext);
}
