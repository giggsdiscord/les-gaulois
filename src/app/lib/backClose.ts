/**
 * Bouton « retour » du téléphone (V4.4) : une fenêtre ouverte ajoute une entrée à l'historique ;
 * le geste retour la ferme au lieu de quitter l'écran. Fermer la fenêtre autrement (croix, glisser,
 * action) retire cette entrée. Une fenêtre qui en remplace une autre (carte → action) réutilise
 * l'entrée pour ne pas laisser de « retour » à vide.
 */
import { useEffect, useRef } from 'react';

interface Entry {
  close: () => void;
}

const KEY = 'gauloisSheet';
const stack: Entry[] = [];
let pendingBack: number | null = null;
let listening = false;

function depthOf(state: unknown): number {
  const v = (state as Record<string, unknown> | null)?.[KEY];
  return typeof v === 'number' ? v : 0;
}

function onPopState(e: PopStateEvent): void {
  const depth = depthOf(e.state);
  // Ferme, du dessus vers le dessous, les fenêtres au-delà de la profondeur atteinte
  while (stack.length > depth) stack.pop()!.close();
}

function listen(): void {
  if (listening) return;
  listening = true;
  window.addEventListener('popstate', onPopState);
}

/** Inscrit une fenêtre ouverte dans l'historique ; `enabled = false` pour une fenêtre imposée. */
export function useBackToClose(open: boolean, onClose: () => void, enabled = true): void {
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    if (!open || !enabled) return;
    listen();
    const entry: Entry = { close: () => closeRef.current() };
    stack.push(entry);
    const state = { ...((history.state as object | null) ?? {}), [KEY]: stack.length };
    if (pendingBack !== null) {
      // Une fenêtre vient de se fermer à l'instant : on reprend son entrée
      window.clearTimeout(pendingBack);
      pendingBack = null;
      history.replaceState(state, '');
    } else {
      history.pushState(state, '');
    }
    return () => {
      const i = stack.indexOf(entry);
      if (i < 0) return; // déjà retirée par le geste retour
      stack.splice(i, 1);
      if (pendingBack !== null) window.clearTimeout(pendingBack);
      pendingBack = window.setTimeout(() => {
        pendingBack = null;
        const extra = depthOf(history.state) - stack.length;
        if (extra > 0) history.go(-extra);
      }, 0);
    };
  }, [open, enabled]);
}
