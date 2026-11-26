/**
 * Application installable (GDD §7.6, V4.2) : service worker, invite d'installation native
 * (Chrome, Edge, Android) et repli sur des consignes (iPhone/iPad, autres navigateurs).
 */
import { useSyncExternalStore } from 'react';
import { installMode, type InstallMode } from './installMode.ts';

export type { InstallMode } from './installMode.ts';

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let deferredPrompt: BeforeInstallPromptEvent | null = null;
let justInstalled = false;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  const nav = navigator as Navigator & { standalone?: boolean };
  return justInstalled || nav.standalone === true || window.matchMedia?.('(display-mode: standalone)').matches === true;
}

function currentMode(): InstallMode {
  if (typeof window === 'undefined') return 'manual';
  return installMode({ standalone: isStandalone(), hasPrompt: deferredPrompt !== null, userAgent: navigator.userAgent, maxTouchPoints: navigator.maxTouchPoints ?? 0 });
}

/** À appeler une fois, avant le premier rendu : l'événement `beforeinstallprompt` peut arriver tôt. */
export function initInstall(): void {
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault(); // on garde l'invite pour notre propre bouton
    deferredPrompt = event as BeforeInstallPromptEvent;
    notify();
  });
  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    justInstalled = true;
    notify();
  });
  window.matchMedia?.('(display-mode: standalone)').addEventListener?.('change', notify);
}

/** Service worker : uniquement sur le site publié (pas en développement, pour éviter un cache gênant). */
export function registerServiceWorker(): void {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch((err: unknown) => console.warn('Service worker non enregistré', err));
  });
}

/** Ouvre l'invite native ; renvoie `true` si le joueur a accepté. */
export async function promptInstall(): Promise<boolean> {
  const event = deferredPrompt;
  if (!event) return false;
  deferredPrompt = null; // une invite ne peut servir qu'une fois
  await event.prompt();
  const { outcome } = await event.userChoice;
  notify();
  return outcome === 'accepted';
}

export function useInstallMode(): InstallMode {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    currentMode,
    () => 'manual' as InstallMode,
  );
}
