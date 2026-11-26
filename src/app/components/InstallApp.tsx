/** « Installer l'appli » : invite native quand le navigateur la propose, sinon consignes pas à pas. */
import { useCallback, useState } from 'react';
import { promptInstall, useInstallMode, type InstallMode } from '../lib/install.ts';
import { InstallIcon } from './icons.tsx';
import { Button, Sheet } from './ui.tsx';

function Steps({ mode }: { mode: InstallMode }) {
  if (mode === 'ios') {
    return (
      <ol className="list-decimal space-y-2 pl-5 text-sm text-ink">
        <li>
          Ouvrez ce site dans <strong>Safari</strong> (ou Chrome).
        </li>
        <li>
          Touchez le bouton <strong>Partager</strong> (carré avec une flèche vers le haut), en bas de l'écran sur iPhone, en haut sur iPad.
        </li>
        <li>
          Faites défiler et choisissez <strong>«&nbsp;Sur l'écran d'accueil&nbsp;»</strong>.
        </li>
        <li>
          Touchez <strong>Ajouter</strong> : l'icône Les Gaulois apparaît parmi vos applications.
        </li>
      </ol>
    );
  }
  return (
    <div className="space-y-3 text-sm text-ink">
      <p>
        <strong>Android</strong> (Chrome, Samsung Internet, Firefox) : menu <strong>⋮</strong> du navigateur, puis <strong>«&nbsp;Installer l'application&nbsp;»</strong> ou{' '}
        <strong>«&nbsp;Ajouter à l'écran d'accueil&nbsp;»</strong>.
      </p>
      <p>
        <strong>Ordinateur</strong> (Chrome, Edge) : icône d'installation à droite de la barre d'adresse, ou menu du navigateur, puis{' '}
        <strong>«&nbsp;Installer Les Gaulois&nbsp;»</strong>.
      </p>
      <p className="text-ink-soft">Firefox sur ordinateur ne sait pas installer de site : le jeu reste jouable dans un onglet.</p>
    </div>
  );
}

function useInstallAction() {
  const mode = useInstallMode();
  const [help, setHelp] = useState(false);
  const close = useCallback(() => setHelp(false), []);
  const start = useCallback(() => {
    if (mode === 'prompt') void promptInstall();
    else setHelp(true);
  }, [mode]);
  const sheet = (
    <Sheet open={help} onClose={close} title="Installer l'appli">
      <p className="mb-4 text-sm text-ink-soft">Le jeu s'ouvrira en plein écran depuis votre écran d'accueil, comme une application, sans passer par un magasin d'applications.</p>
      <Steps mode={mode} />
      <Button className="mt-5 w-full" variant="ghost" onClick={close}>
        Compris
      </Button>
    </Sheet>
  );
  return { mode, start, sheet };
}

/** Encart de l'écran de connexion (masqué une fois l'appli installée). */
export function InstallCard() {
  const { mode, start, sheet } = useInstallAction();
  if (mode === 'installed') return null;
  return (
    <div className="mt-6 flex items-center gap-3 rounded-2xl border border-parchment-200 bg-white/80 p-4 shadow-sm">
      <span className="rounded-xl bg-wood-900 p-2 text-parchment-50">
        <InstallIcon className="h-6 w-6" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-semibold text-ink">Installer l'appli</p>
        <p className="text-xs text-ink-soft">Ouvrez le jeu en plein écran depuis votre écran d'accueil.</p>
      </div>
      <Button size="sm" onClick={start}>
        Installer
      </Button>
      {sheet}
    </div>
  );
}

/** Bouton discret de l'en-tête, seulement quand l'installation est réellement possible. */
export function InstallHeaderButton() {
  const { mode, start, sheet } = useInstallAction();
  if (mode !== 'prompt' && mode !== 'ios') return null;
  return (
    <>
      <button onClick={start} className="rounded-full p-1.5 text-parchment-100 hover:bg-black/20" aria-label="Installer l'appli" title="Installer l'appli">
        <InstallIcon className="h-5 w-5" />
      </button>
      {sheet}
    </>
  );
}
