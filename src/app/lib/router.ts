import { useEffect, useState } from 'react';

/** Routeur minimal par ancre (#/agora) : compatible GitHub Pages sans configuration serveur. */
export type Route = { name: string; param: string | null };

export function parseRoute(hash: string): Route {
  const [name = 'carte', param = null] = hash.replace(/^#\/?/, '').split('/');
  return { name: name || 'carte', param: param || null };
}

export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(() => parseRoute(window.location.hash));
  useEffect(() => {
    const onChange = () => setRoute(parseRoute(window.location.hash));
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return route;
}

/**
 * Change d'écran. `replace` remplace l'entrée courante de l'historique (sous-onglets) : le bouton
 * retour du téléphone ramène alors à l'écran précédent, pas au sous-onglet précédent.
 */
export function navigate(name: string, param?: string | null, options: { replace?: boolean } = {}): void {
  const hash = `#/${name}${param ? `/${param}` : ''}`;
  if (window.location.hash === hash) return;
  if (options.replace) window.location.replace(hash);
  else window.location.hash = hash;
}
