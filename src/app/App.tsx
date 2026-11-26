/** Coquille de l'application : connexion, en-tête, bannières, navigation basse et écrans. */
import { useEffect, type ComponentType, type SVGProps } from 'react';
import { InstallHeaderButton } from './components/InstallApp.tsx';
import { ChangePinModal, TemptationModal } from './components/Modals.tsx';
import { AgoraIcon, CoinsIcon, GearIcon, LogoutIcon, MapIcon, NewsIcon, SwordsIcon, ToolsIcon } from './components/icons.tsx';
import { Avatar, Button, Spinner, ToastStack, cx } from './components/ui.tsx';
import { isDetained } from './lib/game.ts';
import { dateTime, eur } from './lib/format.ts';
import { DUEL_MODE } from './lib/labels.ts';
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

function Header() {
  const data = useData();
  const { api, signOut } = useGame();
  const v = data.village;
  const me = data.me;
  return (
    <header className="wood-bar sticky top-0 z-30 text-parchment-50 shadow-md">
      <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-2.5">
        <div className="min-w-0 flex-1">
          <p className="truncate font-serif text-lg leading-tight">Les Gaulois</p>
          <p className="truncate text-[11px] text-parchment-200">
            Acte {v.act_number} · autonomie {Math.round(v.autonomy_pct)} % · caisse {eur(v.treasury_eur)} · {Math.round(v.real_temp_c)}°C
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-black/25 px-2.5 py-1 text-xs font-bold tabular-nums" title="Points d'Action du jour">
            ⚡ {me.action_points} PA
          </span>
          <InstallHeaderButton />
          <Avatar emoji={me.avatar_emoji} color={me.avatar_color} size="sm" />
          <button
            onClick={() => window.confirm('Se déconnecter ?') && void signOut()}
            className="rounded-full p-1.5 text-parchment-100 hover:bg-black/20"
            aria-label="Se déconnecter"
          >
            <LogoutIcon className="h-5 w-5" />
          </button>
        </div>
      </div>
      {api.mode === 'demo' && <p className="bg-gold-500 py-0.5 text-center text-[11px] font-semibold text-ink">Mode démo — partie locale à ce navigateur (aucun serveur)</p>}
    </header>
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

function BottomNav({ items, active }: { items: NavItem[]; active: string }) {
  return (
    <nav className="safe-bottom fixed inset-x-0 bottom-0 z-30 border-t border-wood-700/30 bg-parchment-50/95 backdrop-blur">
      <div className="mx-auto grid max-w-3xl" style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}>
        {items.map((item) => {
          const on = item.id === active;
          const Icon = item.icon;
          return (
            <button key={item.id} onClick={() => navigate(item.id)} aria-label={item.badge ? `${item.label} (${item.badge})` : item.label} className={cx('relative flex flex-col items-center gap-0.5 py-2 text-[11px] font-semibold', on ? 'text-wood-700' : 'text-ink-soft')} aria-current={on ? 'page' : undefined}>
              <Icon className={cx('h-6 w-6', on && 'scale-110')} />
              <span className="truncate">{item.label}</span>
              {item.badge ? <span className="absolute right-[18%] top-1 min-w-4 rounded-full bg-ember-600 px-1 text-[10px] leading-4 text-white">{item.badge}</span> : null}
              {on && <span className="absolute inset-x-5 top-0 h-0.5 rounded-full bg-wood-600" />}
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
  const myApprovals = data.approvals.filter((a) => a.status === 'pending' && a.required_role === me.role_code).length;
  const openVotes = data.proposals.filter((p) => p.status === 'open' && new Date(p.closes_at) > now && !p.votes_yes.includes(me.id) && !p.votes_no.includes(me.id)).length;
  const items: NavItem[] = [
    { id: 'carte', label: 'Carte', icon: MapIcon },
    { id: 'metier', label: 'Mon métier', icon: ToolsIcon, badge: myApprovals },
    { id: 'agora', label: 'Agora', icon: AgoraIcon, badge: openVotes },
    { id: 'tresor', label: 'Trésor', icon: CoinsIcon },
    { id: 'gazette', label: 'Gazette', icon: NewsIcon },
  ];
  if (me.is_admin) items.push({ id: 'admin', label: 'Admin', icon: GearIcon });
  const active = route.name === 'duel' ? 'agora' : route.name;
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
      <Header />
      <Banners />
      <main className="mx-auto max-w-3xl px-4 pb-28 pt-4">{screen}</main>
      <BottomNav items={items} active={items.some((i) => i.id === active) ? active : 'carte'} />
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
      <Shell />
      <ToastStack />
    </>
  );
}
