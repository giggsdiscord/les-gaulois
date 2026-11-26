/** Coquille de l'application (téléphone) : connexion, en-tête, menu du compte, bandeaux, navigation basse et écrans. */
import { useEffect, useState, type ComponentType, type SVGProps } from 'react';
import { useInstallAction } from './components/InstallApp.tsx';
import { NotificationsSheet } from './components/NotificationsSheet.tsx';
import { UnreadProvider, useUnread } from './state/UnreadContext.tsx';
import { ChangePinModal, TemptationModal } from './components/Modals.tsx';
import { AgoraIcon, CoinsIcon, MapIcon, NewsIcon, SwordsIcon, ToolsIcon } from './components/icons.tsx';
import { Avatar, Button, Card, ConfirmButton, ListRow, Sheet, Spinner, ToastStack, cx } from './components/ui.tsx';
import { isDetained } from './lib/game.ts';
import { dateTime, eur } from './lib/format.ts';
import { DUEL_MODE } from './lib/labels.ts';
import { approvalsToDecide, unvotedProposals } from './lib/todo.ts';
import { navigate, useRoute } from './lib/router.ts';
import { AdminScreen } from './screens/AdminScreen.tsx';
import { AgoraScreen } from './screens/AgoraScreen.tsx';
import { DuelScreen } from './screens/DuelScreen.tsx';
import { GazetteScreen } from './screens/GazetteScreen.tsx';
import { JobScreen } from './screens/JobScreen.tsx';
import { LoginScreen } from './screens/LoginScreen.tsx';
import { MapScreen } from './screens/MapScreen.tsx';
import { TreasuryScreen } from './screens/TreasuryScreen.tsx';
import { useData, useGame, useNow } from './state/GameContext.tsx';

interface NavItem {
  id: string;
  label: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  badge?: number;
}

const ROMAN = ['', 'I', 'II', 'III'];

type Panel = 'menu' | 'notifications' | 'pin' | null;

function Header({ onMenu }: { onMenu: () => void }) {
  const data = useData();
  const { api } = useGame();
  const v = data.village;
  const me = data.me;
  return (
    <header className="wood-bar safe-top sticky top-0 z-30 text-parchment-50 shadow-md">
      <div className="mx-auto flex max-w-3xl items-center gap-2 px-4 py-2">
        <div className="min-w-0 flex-1">
          <p className="truncate font-serif text-lg leading-tight">Les Gaulois</p>
          <p className="truncate text-[11px] text-parchment-200">
            Acte {ROMAN[v.act_number] ?? v.act_number} · caisse {eur(v.treasury_eur)} · {Math.round(v.real_temp_c)}°C
          </p>
        </div>
        <button
          onClick={() => navigate('metier')}
          className="min-h-9 rounded-full bg-black/25 px-3 text-xs font-bold tabular-nums active:bg-black/40"
          aria-label={`${me.action_points} points d'action : ouvrir mon métier`}
        >
          ⚡ {me.action_points} PA
        </button>
        <button onClick={onMenu} className="-mr-1 flex items-center gap-1 rounded-full p-1 active:bg-black/25" aria-label="Menu du compte">
          <Avatar emoji={me.avatar_emoji} color={me.avatar_color} size="sm" />
          <span className="text-lg leading-none text-parchment-200" aria-hidden="true">
            ☰
          </span>
        </button>
      </div>
      {api.mode === 'demo' && <p className="bg-gold-500 py-0.5 text-center text-[11px] font-semibold text-ink">Mode démo — partie locale à ce navigateur (aucun serveur)</p>}
    </header>
  );
}

/** Menu du compte (avatar de l'en-tête) : fiche, notifications, installation, PIN, administration, déconnexion. */
function AccountMenu({ onClose, onPanel, onInstall, canInstall }: { onClose: () => void; onPanel: (p: Panel) => void; onInstall: () => void; canInstall: boolean }) {
  const data = useData();
  const { api, signOut } = useGame();
  const me = data.me;
  const go = (name: string, param?: string) => {
    // Remplace l'entrée d'historique de la fenêtre : « retour » ramène à l'écran d'avant le menu
    navigate(name, param, { replace: true });
    onClose();
  };
  return (
    <Sheet open onClose={onClose} title="Mon compte">
      <div className="mb-4 flex items-center gap-3">
        <Avatar emoji={me.avatar_emoji} color={me.avatar_color} size="lg" />
        <div className="min-w-0">
          <p className="font-serif text-lg leading-tight">
            {me.display_name} <span className="text-sm text-ink-soft">({me.character_name})</span>
          </p>
          <p className="text-sm text-ink-soft">{me.role_title}</p>
          <p className="text-sm font-semibold tabular-nums">
            ⚡ {me.action_points} PA · {eur(me.private_wealth_eur)} privés
          </p>
        </div>
      </div>
      <Card flush className="divide-y divide-parchment-200">
        <ListRow icon="🧾" title="Ma fiche" subtitle="Santé, patrimoine, apprentis, délégation" onClick={() => go('metier', 'fiche')} />
        <ListRow icon="🔔" title="Notifications" subtitle="Être prévenu sur ce téléphone" onClick={() => onPanel('notifications')} />
        {canInstall && (
          <ListRow
            icon="📲"
            title="Installer l'appli"
            subtitle="Plein écran depuis l'écran d'accueil"
            onClick={() => {
              onClose();
              onInstall();
            }}
          />
        )}
        <ListRow icon="🔑" title="Changer mon code PIN" onClick={() => onPanel('pin')} />
        {me.is_admin && <ListRow icon="🛠️" title="Administration" subtitle="Sauvegardes, joueurs, Maître du Jeu" onClick={() => go('admin')} />}
      </Card>
      <ConfirmButton className="mt-4 w-full" variant="secondary" confirmLabel="Toucher encore pour se déconnecter" onConfirm={() => void signOut()}>
        Se déconnecter
      </ConfirmButton>
      {api.mode === 'demo' && <p className="mt-3 text-center text-xs text-ink-soft">Mode démo : partie locale à ce téléphone.</p>}
    </Sheet>
  );
}

function Banners() {
  const data = useData();
  const route = useRoute();
  const now = useNow(30_000);
  const me = data.me;
  const v = data.village;
  const myDuel = data.duels.find((d) => d.status === 'active' && (d.player_a_id === me.id || d.player_b_id === me.id));
  const banners: { tone: string; text: string; action?: { label: string; go: () => void } }[] = [];
  if (v.is_defeated) banners.push({ tone: 'bg-ember-600 text-white', text: `Partie perdue : ${v.defeat_reason ?? 'le hameau est tombé'}. L'administrateur peut restaurer une sauvegarde.` });
  if (isDetained(me, now)) banners.push({ tone: 'bg-ember-100 text-ink', text: `Vous êtes au cachot jusqu'au ${dateTime(me.is_detained_until)} : ni action ni vote.` });
  if (me.status === 'forced_labor') banners.push({ tone: 'bg-ember-100 text-ink', text: `Travaux d'intérêt général jusqu'au ${dateTime(me.forced_labor_until)}.` });
  if (me.status === 'banished' || me.status === 'executed') banners.push({ tone: 'bg-ink text-parchment-50', text: me.status === 'banished' ? 'Vous avez été banni du hameau.' : 'Vous avez été exécuté par le Tribunal Public.' });
  if (myDuel && !(route.name === 'duel' && route.param === myDuel.id)) {
    banners.push({
      tone: 'bg-gold-100 text-ink',
      text: `⚔️ Vous êtes attendu en duel — ${DUEL_MODE[myDuel.mode]}.`,
      action: { label: myDuel.mode === 'target' ? 'Jouer' : "Entrer dans l'arène", go: () => navigate('duel', myDuel.id) },
    });
  }
  if (banners.length === 0) return null;
  return (
    <div className="mx-auto max-w-3xl space-y-2 px-4 pt-3">
      {banners.map((b, i) => (
        <div key={i} className={cx('flex items-center justify-between gap-3 rounded-xl px-3 py-2 text-sm shadow-sm', b.tone)}>
          <span>{b.text}</span>
          {b.action && (
            <Button size="sm" onClick={b.action.go}>
              {b.action.label}
            </Button>
          )}
        </div>
      ))}
    </div>
  );
}

function BottomNav({ items, active }: { items: NavItem[]; active: string | null }) {
  return (
    <nav className="safe-bottom fixed inset-x-0 bottom-0 z-30 border-t border-wood-700/30 bg-parchment-50/95 backdrop-blur">
      <div className="mx-auto grid max-w-3xl" style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}>
        {items.map((item) => {
          const on = item.id === active;
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              onClick={() => (on ? window.scrollTo({ top: 0, behavior: 'smooth' }) : navigate(item.id))}
              aria-label={item.badge ? `${item.label} (${item.badge})` : item.label}
              className={cx('relative flex min-h-14 flex-col items-center justify-center gap-0.5 py-1.5 text-[11px] font-semibold', on ? 'text-wood-700' : 'text-ink-soft')}
              aria-current={on ? 'page' : undefined}
            >
              <span className={cx('flex h-8 w-14 items-center justify-center rounded-full transition-colors', on && 'bg-wood-600/12')}>
                <Icon className="h-6 w-6" />
              </span>
              <span className="truncate">{item.label}</span>
              {item.badge ? <span className="absolute right-[calc(50%-1.6rem)] top-1 min-w-4 rounded-full bg-ember-600 px-1 text-[10px] leading-4 text-white">{item.badge}</span> : null}
            </button>
          );
        })}
      </div>
    </nav>
  );
}

function Shell() {
  const data = useData();
  const route = useRoute();
  const now = useNow(60_000);
  const me = data.me;
  const [panel, setPanel] = useState<Panel>(null);
  const install = useInstallAction();
  const { counts } = useUnread();
  const myApprovals = approvalsToDecide(data, now).length;
  const myDuels = data.duels.filter((d) => d.status === 'active' && (d.player_a_id === me.id || d.player_b_id === me.id)).length;
  const unreadNews = counts ? counts.village_square + counts.agora_hall + counts.whisper + counts.gazette : 0;
  const openVotes = unvotedProposals(data, now).length;
  const items: NavItem[] = [
    { id: 'carte', label: 'Hameau', icon: MapIcon },
    { id: 'metier', label: 'Métier', icon: ToolsIcon, badge: myApprovals },
    { id: 'agora', label: 'Agora', icon: AgoraIcon, badge: openVotes + myDuels },
    { id: 'tresor', label: 'Trésor', icon: CoinsIcon },
    { id: 'gazette', label: 'Gazette', icon: NewsIcon, badge: unreadNews },
  ];
  const active = route.name === 'duel' ? 'agora' : items.some((i) => i.id === route.name) ? route.name : route.name === 'admin' ? null : 'carte';
  // Changement d'écran ou de sous-onglet : retour en haut
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [route.name, route.param]);

  let screen;
  switch (route.name) {
    case 'metier':
      screen = <JobScreen />;
      break;
    case 'agora':
      screen = <AgoraScreen />;
      break;
    case 'tresor':
      screen = <TreasuryScreen />;
      break;
    case 'gazette':
      screen = <GazetteScreen />;
      break;
    case 'admin':
      screen = <AdminScreen />;
      break;
    case 'duel':
      screen = <DuelScreen duelId={route.param} />;
      break;
    default:
      screen = <MapScreen />;
  }

  return (
    <div className="min-h-dvh bg-parchment-50 text-ink">
      <Header onMenu={() => setPanel('menu')} />
      <Banners />
      <main className="mx-auto max-w-3xl px-4 pb-28 pt-4">{screen}</main>
      <BottomNav items={items} active={active} />
      {panel === 'menu' && <AccountMenu onClose={() => setPanel(null)} onPanel={setPanel} onInstall={install.start} canInstall={install.mode === 'prompt' || install.mode === 'ios'} />}
      {panel === 'notifications' && <NotificationsSheet onClose={() => setPanel(null)} />}
      {panel === 'pin' && <ChangePinModal onClose={() => setPanel(null)} />}
      {install.sheet}
      {me.must_change_pin ? <ChangePinModal forced /> : <TemptationModal />}
    </div>
  );
}

export function App() {
  const { token, data, error, refresh, signOut } = useGame();
  if (!token) {
    return (
      <>
        <LoginScreen />
        <ToastStack />
      </>
    );
  }
  if (!data) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-parchment-50 p-6 text-center text-ink">
        {error ? (
          <>
            <p className="font-serif text-xl">Impossible de joindre le hameau</p>
            <p className="max-w-sm text-sm text-ink-soft">{error}</p>
            <div className="flex gap-2">
              <Button onClick={() => void refresh()}>Réessayer</Button>
              <Button variant="secondary" onClick={() => void signOut()}>
                Changer de joueur
              </Button>
            </div>
          </>
        ) : (
          <>
            <SwordsIcon className="h-10 w-10 animate-pulse text-wood-600" />
            <Spinner />
            <p className="text-sm text-ink-soft">Ouverture des portes du hameau…</p>
          </>
        )}
        <ToastStack />
      </div>
    );
  }
  return (
    <>
      <UnreadProvider>
        <Shell />
      </UnreadProvider>
      <ToastStack />
    </>
  );
}
