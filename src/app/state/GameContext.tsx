import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { GameApi, GameData } from '../api/types.ts';

const SESSION_KEY = 'les-gaulois-session';

export interface Toast {
  id: number;
  kind: 'success' | 'error' | 'info';
  text: string;
}

interface GameContextValue {
  api: GameApi;
  token: string | null;
  data: GameData | null;
  loading: boolean;
  error: string | null;
  toasts: Toast[];
  signIn(token: string): Promise<void>;
  signOut(): Promise<void>;
  refresh(): Promise<void>;
  /** Exécute une opération : message de succès ou d'erreur, puis rechargement des données. */
  perform<T>(fn: () => Promise<T>, success?: string | ((result: T) => string | undefined)): Promise<T | undefined>;
  toast(kind: Toast['kind'], text: string): void;
  dismissToast(id: number): void;
}

const GameContext = createContext<GameContextValue | null>(null);

function readSession(mode: string): string | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { mode: string; token: string };
    return parsed.mode === mode ? parsed.token : null;
  } catch {
    return null;
  }
}

function writeSession(mode: string, token: string | null): void {
  try {
    if (token) localStorage.setItem(SESSION_KEY, JSON.stringify({ mode, token }));
    else localStorage.removeItem(SESSION_KEY);
  } catch {
    /* stockage indisponible : la session ne survivra pas au rechargement */
  }
}

export function GameProvider({ api, children }: { api: GameApi; children: ReactNode }) {
  const [token, setToken] = useState<string | null>(() => {
    const t = readSession(api.mode);
    api.setToken(t);
    return t;
  });
  const [data, setData] = useState<GameData | null>(null);
  const [loading, setLoading] = useState<boolean>(token !== null);
  const [error, setError] = useState<string | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const toastSeq = useRef(0);

  const toast = useCallback((kind: Toast['kind'], text: string) => {
    const id = ++toastSeq.current;
    setToasts((t) => [...t.slice(-3), { id, kind, text }]);
    window.setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), kind === 'error' ? 7000 : 4500);
  }, []);
  const dismissToast = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);

  const signOutLocal = useCallback(() => {
    writeSession(api.mode, null);
    api.setToken(null);
    setToken(null);
    setData(null);
  }, [api]);

  const refresh = useCallback(async () => {
    if (!token) return;
    try {
      const next = await api.loadAll();
      setData(next);
      setError(null);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      if (/Session invalide|expirée/.test(message)) {
        signOutLocal();
        toast('info', 'Session expirée : reconnectez-vous avec votre code PIN.');
      } else {
        setError(message);
      }
    } finally {
      setLoading(false);
    }
  }, [api, token, signOutLocal, toast]);

  const tickAndRefresh = useCallback(async () => {
    if (!token) return;
    try {
      await api.tick();
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      if (!/Session invalide|expirée/.test(message)) console.warn('Tick impossible', message);
    }
    await refresh();
  }, [api, token, refresh]);

  // Chargement initial + tick (écoulement du temps) à l'ouverture, au retour sur l'onglet et toutes les 5 min
  useEffect(() => {
    if (!token) return;
    setLoading(true);
    void tickAndRefresh();
    const onVisible = () => {
      if (document.visibilityState === 'visible') void tickAndRefresh();
    };
    document.addEventListener('visibilitychange', onVisible);
    const interval = window.setInterval(() => void tickAndRefresh(), 5 * 60_000);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.clearInterval(interval);
    };
  }, [token, tickAndRefresh]);

  // Temps réel : rechargement groupé ; filet de sécurité toutes les 45 s (chuchotements protégés par RLS)
  useEffect(() => {
    if (!token) return;
    let timer: number | undefined;
    const unsubscribe = api.subscribe(() => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => void refresh(), 400);
    });
    const poll = window.setInterval(() => void refresh(), 45_000);
    return () => {
      unsubscribe();
      window.clearTimeout(timer);
      window.clearInterval(poll);
    };
  }, [api, token, refresh]);

  const signIn = useCallback(
    async (newToken: string) => {
      writeSession(api.mode, newToken);
      api.setToken(newToken);
      setToken(newToken);
    },
    [api],
  );

  const signOut = useCallback(async () => {
    await api.logout().catch(() => undefined);
    signOutLocal();
  }, [api, signOutLocal]);

  const perform = useCallback(
    async <T,>(fn: () => Promise<T>, success?: string | ((result: T) => string | undefined)) => {
      try {
        const result = await fn();
        const message = typeof success === 'function' ? success(result) : success;
        if (message) toast('success', message);
        await refresh();
        return result;
      } catch (e) {
        toast('error', e instanceof Error ? e.message : String(e));
        await refresh();
        return undefined;
      }
    },
    [refresh, toast],
  );

  const value = useMemo<GameContextValue>(
    () => ({ api, token, data, loading, error, toasts, signIn, signOut, refresh, perform, toast, dismissToast }),
    [api, token, data, loading, error, toasts, signIn, signOut, refresh, perform, toast, dismissToast],
  );
  return <GameContext.Provider value={value}>{children}</GameContext.Provider>;
}

export function useGame(): GameContextValue {
  const ctx = useContext(GameContext);
  if (!ctx) throw new Error('useGame hors de GameProvider');
  return ctx;
}

/** Données chargées (l'écran n'est affiché qu'une fois connecté). */
export function useData(): GameData {
  const { data } = useGame();
  if (!data) throw new Error('Données non chargées');
  return data;
}

/** Horloge du jeu rafraîchie périodiquement (comptes à rebours). */
export function useNow(intervalMs = 1000): Date {
  const { api } = useGame();
  const [now, setNow] = useState(() => api.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(api.now()), intervalMs);
    return () => window.clearInterval(id);
  }, [api, intervalMs]);
  return now;
}
