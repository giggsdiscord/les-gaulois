import { useEffect, useState } from 'react';

/** Routeur minimal par ancre (#/agora) : compatible GitHub Pages sans configuration serveur. */
export type Route = { name: string; param: string | null };

function parse(hash: string): Route {
  const [name = 'carte', param = null] = hash.replace(/^#\/?/, '').split('/');
  return { name: name || 'carte', param: param || null };
}

export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(() => parse(window.location.hash));
  useEffect(() => {
    const onChange = () => setRoute(parse(window.location.hash));
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return route;
}

export function navigate(name: string, param?: string | null): void {
  window.location.hash = `#/${name}${param ? `/${param}` : ''}`;
}
