/**
 * Administration (M. Lerme), ouverte depuis le menu du compte. V4.4 (téléphone) : quatre
 * sous-onglets — Partie (état, points d'attention, activité des joueurs, machine à remonter le
 * temps en démo), Joueurs (liste → fiche), Sauvegardes (liste → restauration confirmée, fichier
 * JSON), Maître du Jeu (état de l'IA, commandes expliquées, derniers appels).
 */
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import type { PublicPlayer, SnapshotInfo } from '../api/types.ts';
import { Avatar, Badge, Button, Card, ConfirmButton, Empty, Field, Input, ListRow, Sheet, Spinner, Stat, Tabs, cx } from '../components/ui.tsx';
import { dateTime, eur, relative } from '../lib/format.ts';
import { isDetained, playerName, population } from '../lib/game.ts';
import { ACT_LABEL, PLAYER_STATUS, ROLE_SHORT, SNAPSHOT_TRIGGER } from '../lib/labels.ts';
import { navigate, useRoute } from '../lib/router.ts';
import { useData, useGame, useNow } from '../state/GameContext.tsx';

type AdminTab = 'partie' | 'joueurs' | 'sauvegardes' | 'mj';
const TABS: readonly AdminTab[] = ['partie', 'joueurs', 'sauvegardes', 'mj'];
/** Un joueur absent depuis plus de 48 h est signalé. */
const INACTIVE_MS = 48 * 3_600_000;

function kb(bytes: number) {
  return bytes >= 1_048_576 ? `${(bytes / 1_048_576).toFixed(1)} Mo` : `${Math.max(1, Math.round(bytes / 1024))} Ko`;
}

function DemoControls() {
  const { api, perform } = useGame();
  if (api.mode !== 'demo' || !api.advanceTime) return null;
  const advance = (h: number, label: string) => void perform(() => api.advanceTime!(h), `Temps avancé : ${label}.`);
  return (
    <Card title="Machine à remonter le temps" subtitle="Mode démo : avancez l'horloge pour tester nuits, Agora et duels." tone="warning">
      <div className="grid grid-cols-4 gap-2">
        {(
          [
            [1, '1 h', '+1 h'],
            [6, '6 h', '+6 h'],
            [24, '1 jour', '+1 j'],
            [72, '3 jours', '+3 j'],
          ] as const
        ).map(([h, label, short]) => (
          <Button key={h} size="sm" variant="secondary" onClick={() => advance(h, label)}>
            {short}
          </Button>
        ))}
      </div>
      <ConfirmButton className="mt-3 w-full" confirmLabel="Toucher encore : tout effacer" onConfirm={() => api.resetDemo && void api.resetDemo().then(() => window.location.reload())}>
        Réinitialiser la démo
      </ConfirmButton>
    </Card>
  );
}

function PlayerFlags({ p, now }: { p: PublicPlayer; now: Date }) {
  return (
    <span className="flex flex-wrap justify-end gap-1">
      {p.status !== 'active' && <Badge tone="ember">{PLAYER_STATUS[p.status] ?? p.status}</Badge>}
      {isDetained(p, now) && <Badge tone="ember">Cachot</Badge>}
      {p.injury_type && <Badge tone="ember">Blessé</Badge>}
      {p.delegated_to && <Badge tone="gold">Délégué</Badge>}
    </span>
  );
}

function GamePanel() {
  const data = useData();
  const now = useNow(60_000);
  const v = data.village;
  const pop = population(data);
  const pendingApprovals = data.approvals.filter((a) => a.status === 'pending');
  const openProposals = data.proposals.filter((p) => p.status === 'open').length;
  const activeDuels = data.duels.filter((d) => d.status === 'active').length;
  const candidates = data.migrants.filter((m) => m.status === 'candidate').length;
  const oldest = pendingApprovals.reduce<string | null>((acc, a) => (acc === null || a.created_at < acc ? a.created_at : acc), null);
  const watch: { emoji: string; text: string; go?: () => void; alert?: boolean }[] = [
    { emoji: '✅', text: `${pendingApprovals.length} validation(s) en attente${oldest ? ` (la plus ancienne ${relative(oldest, now)})` : ''}`, alert: pendingApprovals.length > 0 },
    { emoji: '🗳️', text: `${openProposals} scrutin(s) ouvert(s)`, go: () => navigate('agora') },
    { emoji: '⚔️', text: `${activeDuels} duel(s) en cours`, go: () => navigate('agora', 'duels') },
    { emoji: '🧳', text: `${candidates} candidat(s) à la porte`, go: () => navigate('agora', 'immigration') },
  ];
  const players = data.players
    .filter((p) => p.is_active_slot)
    .sort((a, b) => (b.last_seen_at ?? '').localeCompare(a.last_seen_at ?? ''));
  return (
    <div className="space-y-4">
      <DemoControls />
      {v.is_defeated && (
        <Card tone="danger" title="Partie perdue">
          <p className="text-sm">{v.defeat_reason ?? 'Le hameau est tombé.'} Restaurez une sauvegarde (onglet Sauvegardes).</p>
        </Card>
      )}
      <div className="grid grid-cols-2 gap-2">
        <Stat label="Acte" value={v.act_number} sub={ACT_LABEL[v.act_number]?.replace(/^Acte [IV]+ — /, '')} />
        <Stat label="Caisse" value={eur(v.treasury_eur)} tone={v.treasury_eur < 500 ? 'ember' : undefined} />
        <Stat label="Autonomie" value={`${Math.round(v.autonomy_pct)} %`} />
        <Stat label="Habitants" value={pop.total} sub={`${pop.founders} fondateurs · ${pop.residents} résidents`} />
      </div>
      <Card title="À surveiller" flush>
        <ul className="divide-y divide-parchment-200 border-t border-parchment-200">
          {watch.map((w) => (
            <li key={w.emoji}>
              <ListRow icon={w.emoji} title={<span className={cx('text-sm', w.alert ? 'text-ember-600' : 'font-normal')}>{w.text}</span>} onClick={w.go} className="min-h-12" />
            </li>
          ))}
        </ul>
      </Card>
      <Card title="Activité des joueurs" subtitle="Dernière connexion ; en rouge, absent depuis plus de 48 h." flush>
        <ul className="divide-y divide-parchment-200 border-t border-parchment-200">
          {players.map((p) => {
            const away = !p.last_seen_at || now.getTime() - new Date(p.last_seen_at).getTime() > INACTIVE_MS;
            return (
              <li key={p.id} className="flex items-center gap-3 px-4 py-2.5">
                <Avatar emoji={p.avatar_emoji} color={p.avatar_color} size="sm" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">{p.display_name}</span>
                  <span className={cx('block text-xs', away ? 'font-semibold text-ember-600' : 'text-ink-soft')}>
                    {p.last_seen_at ? `vu ${relative(p.last_seen_at, now)}` : 'jamais connecté'} · {p.action_points} PA
                  </span>
                </span>
                <PlayerFlags p={p} now={now} />
              </li>
            );
          })}
        </ul>
      </Card>
    </div>
  );
}

function SlotSheet({ p, onClose }: { p: PublicPlayer; onClose: () => void }) {
  const data = useData();
  const { api, perform } = useGame();
  const now = useNow(60_000);
  const [name, setName] = useState(p.display_name);
  const [character, setCharacter] = useState(p.character_name);
  const [pin, setPin] = useState('');
  const optional = p.slot_number >= 8;
  const save = () =>
    void perform(() => api.configureSlot(p.id, name, character, pin || null, p.is_active_slot), pin ? 'Fiche et PIN mis à jour (changement forcé à la connexion).' : 'Fiche mise à jour.').then((r) => r !== undefined && onClose());
  const toggle = () =>
    void perform(() => api.configureSlot(p.id, name, character, pin || null, !p.is_active_slot), p.is_active_slot ? 'Place libérée.' : 'Place ouverte : le joueur peut se connecter.').then((r) => r !== undefined && onClose());
  return (
    <Sheet
      open
      onClose={onClose}
      title={`Place ${p.slot_number} — ${p.role_title}`}
      footer={
        <Button className="w-full" size="lg" disabled={pin.length > 0 && pin.length !== 4} onClick={save}>
          Enregistrer
        </Button>
      }
    >
      <div className="space-y-4 pb-4">
        <p className="text-sm text-ink-soft">
          {p.is_active_slot ? (p.last_seen_at ? `Dernière connexion ${relative(p.last_seen_at, now)}.` : 'Jamais connecté.') : 'Place libre.'}
          {p.delegated_to && ` Poste délégué à ${playerName(data.players, p.delegated_to)}.`}
        </p>
        <Field label="Prénom du joueur">
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Personnage">
          <Input value={character} onChange={(e) => setCharacter(e.target.value)} />
        </Field>
        <Field label="Nouveau code PIN (facultatif)" hint="4 chiffres. Le joueur devra le changer à sa prochaine connexion ; ses sessions ouvertes sont fermées.">
          <Input inputMode="numeric" maxLength={4} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))} placeholder="••••" />
        </Field>
        {optional && (
          <div className="rounded-xl border border-parchment-200 bg-white/70 p-3">
            <p className="mb-2 text-sm">{p.is_active_slot ? 'Libérer la place déconnecte ce joueur et le retire de la partie.' : 'Ouvrir la place permet à un nouveau joueur de se connecter avec le PIN choisi.'}</p>
            {p.is_active_slot ? (
              <ConfirmButton className="w-full" confirmLabel="Toucher encore : libérer la place" onConfirm={toggle}>
                Libérer la place
              </ConfirmButton>
            ) : (
              <Button className="w-full" variant="moss" onClick={toggle}>
                Ouvrir la place
              </Button>
            )}
          </div>
        )}
      </div>
    </Sheet>
  );
}

function PlayersPanel() {
  const data = useData();
  const [editing, setEditing] = useState<PublicPlayer | null>(null);
  const slots = [...data.players].sort((a, b) => a.slot_number - b.slot_number);
  return (
    <div className="space-y-4">
      <Card flush>
        <ul className="divide-y divide-parchment-200">
          {slots.map((p) => (
            <li key={p.id}>
              <ListRow
                icon={<Avatar emoji={p.avatar_emoji} color={p.avatar_color} size="sm" />}
                title={`${p.slot_number}. ${p.display_name}`}
                subtitle={`${p.character_name} · ${ROLE_SHORT[p.role_code] ?? p.role_title}`}
                aside={p.slot_number >= 8 ? <Badge tone={p.is_active_slot ? 'moss' : 'neutral'}>{p.is_active_slot ? 'Active' : 'Libre'}</Badge> : undefined}
                onClick={() => setEditing(p)}
              />
            </li>
          ))}
        </ul>
      </Card>
      <p className="px-1 text-xs text-ink-soft">Touchez un joueur pour modifier sa fiche, réinitialiser un PIN oublié ou ouvrir / libérer les places 8 à 10.</p>
      {editing && <SlotSheet p={data.players.find((x) => x.id === editing.id) ?? editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

function SnapshotsPanel() {
  const { api, perform, toast } = useGame();
  const [list, setList] = useState<SnapshotInfo[] | null>(null);
  const [label, setLabel] = useState('');
  const [all, setAll] = useState(false);
  const [selected, setSelected] = useState<SnapshotInfo | null>(null);
  const file = useRef<HTMLInputElement>(null);
  const load = useCallback(async () => {
    try {
      setList(await api.listSnapshots());
    } catch (e) {
      toast('error', e instanceof Error ? e.message : String(e));
    }
  }, [api, toast]);
  useEffect(() => {
    void load();
  }, [load]);

  const download = async () => {
    const json = await perform(() => api.exportState(), 'Export prêt.');
    if (!json) return;
    const blob = new Blob([JSON.stringify(json, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `les-gaulois-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };
  const upload = async (f: File) => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(await f.text());
    } catch {
      return toast('error', 'Fichier illisible (JSON attendu).');
    }
    if (!window.confirm(`Importer « ${f.name} » ? L'état actuel est sauvegardé avant l'import.`)) return;
    await perform(() => api.importState(parsed, `Import ${f.name}`), 'Partie importée.');
    await load();
  };
  const shown = list ? (all ? list : list.slice(0, 8)) : [];

  return (
    <div className="space-y-4">
      <Card title="Sauvegarder maintenant" subtitle="Automatique chaque nuit et avant chaque Agora ; conservation 30 jours.">
        <div className="flex gap-2">
          <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Libellé (facultatif)" />
          <Button onClick={() => void perform(() => api.createSnapshot(label || null), 'Sauvegarde créée.').then(() => (setLabel(''), load()))}>Sauver</Button>
        </div>
      </Card>
      <Card title="Restaurer un état" subtitle="Touchez une sauvegarde pour la restaurer." flush>
        {list === null ? (
          <div className="flex justify-center p-4">
            <Spinner />
          </div>
        ) : list.length === 0 ? (
          <div className="px-4 pb-4">
            <Empty>Aucune sauvegarde.</Empty>
          </div>
        ) : (
          <>
            <ul className="divide-y divide-parchment-200 border-t border-parchment-200">
              {shown.map((s) => (
                <li key={s.id}>
                  <ListRow
                    icon={s.trigger_type === 'auto_midnight' ? '🌙' : s.trigger_type === 'pre_agora' ? '🏛️' : s.trigger_type === 'import' ? '📥' : '💾'}
                    title={<span className="text-sm">{s.label || dateTime(s.created_at)}</span>}
                    subtitle={`${dateTime(s.created_at)} · ${SNAPSHOT_TRIGGER[s.trigger_type] ?? s.trigger_type} · ${kb(s.size_bytes)}`}
                    onClick={() => setSelected(s)}
                  />
                </li>
              ))}
            </ul>
            {list.length > shown.length && (
              <Button variant="ghost" className="w-full" onClick={() => setAll(true)}>
                Voir les {list.length - shown.length} plus anciennes
              </Button>
            )}
          </>
        )}
      </Card>
      <Card title="Fichier JSON" subtitle="Copie complète de la partie, à garder hors du serveur.">
        <div className="grid grid-cols-2 gap-2">
          <Button variant="secondary" onClick={() => void download()}>
            Exporter
          </Button>
          <Button variant="secondary" onClick={() => file.current?.click()}>
            Importer…
          </Button>
        </div>
        <input
          ref={file}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (f) void upload(f);
          }}
        />
      </Card>
      {selected && (
        <Sheet
          open
          onClose={() => setSelected(null)}
          title="Restaurer cette sauvegarde ?"
          footer={
            <ConfirmButton
              className="w-full"
              size="lg"
              confirmLabel="Toucher encore pour restaurer"
              onConfirm={() =>
                void perform(() => api.restoreSnapshot(selected.id), 'Partie restaurée.').then((r) => {
                  setSelected(null);
                  if (r !== undefined) void load();
                })
              }
            >
              Restaurer l'état du {dateTime(selected.created_at)}
            </ConfirmButton>
          }
        >
          <div className="space-y-2 pb-4 text-sm">
            <p className="font-semibold">{selected.label || SNAPSHOT_TRIGGER[selected.trigger_type] || 'Sauvegarde'}</p>
            <p className="text-ink-soft">
              {dateTime(selected.created_at)} · {SNAPSHOT_TRIGGER[selected.trigger_type] ?? selected.trigger_type} · {kb(selected.size_bytes)} · il y a {selected.days_ago} j
            </p>
            <ul className="mt-2 space-y-1 rounded-xl bg-parchment-100 p-3 text-ink">
              <li>• Le village revient exactement à cet état, pour tous les joueurs.</li>
              <li>• Une sauvegarde « avant restauration » est créée d'abord : on peut revenir en arrière.</li>
              <li>• Les messages de La Taverne sont conservés.</li>
            </ul>
          </div>
        </Sheet>
      )}
    </div>
  );
}

interface AiCall {
  id: string;
  call_kind: string;
  used_fallback: boolean;
  model: string | null;
  input_tokens: number | null;
  output_tokens: number | null;
  latency_ms: number | null;
  error: string | null;
  created_at: string;
}

function GameMasterPanel() {
  const data = useData();
  const { api, perform, toast } = useGame();
  const now = useNow(60_000);
  const [status, setStatus] = useState<Record<string, unknown> | null>(null);
  const [target, setTarget] = useState('');
  useEffect(() => {
    api.aiStatus().then(setStatus, (e: unknown) => toast('error', e instanceof Error ? e.message : String(e)));
  }, [api, toast]);
  const calls = (Array.isArray(status?.recent_calls) ? status.recent_calls : []) as AiCall[];
  const fallbacks = calls.filter((c) => c.used_fallback).length;
  const errors = calls.filter((c) => c.error).length;
  const tokens = calls.reduce((n, c) => n + (c.input_tokens ?? 0) + (c.output_tokens ?? 0), 0);
  const commands: { emoji: string; title: string; text: string; button: ReactNode }[] = [
    {
      emoji: '🌙',
      title: 'Lancer la nuit',
      text: "Joue le passage de minuit tout de suite : simulation, Gazette, candidats, tentations, sauvegarde.",
      button: (
        <ConfirmButton size="sm" variant="secondary" confirmLabel="Confirmer" onConfirm={() => void perform(() => api.runWorldSync('nightly'), (r) => `Nuit jouée : ${String(r.gazette ?? 'Gazette publiée')}.`)}>
          Lancer
        </ConfirmButton>
      ),
    },
    {
      emoji: '🧹',
      title: 'Maintenance',
      text: "Clôt les duels abandonnés et fait avancer l'Agora (automatique tous les quarts d'heure).",
      button: (
        <Button size="sm" variant="secondary" onClick={() => void perform(() => api.runWorldSync('maintenance'), 'Maintenance effectuée.')}>
          Lancer
        </Button>
      ),
    },
    {
      emoji: '🧳',
      title: 'Nouveau candidat',
      text: "L'IA fait arriver un candidat à l'immigration par la piste.",
      button: (
        <Button size="sm" variant="secondary" onClick={() => void perform(() => api.generateMigrants(1), 'Un candidat arrive par la piste.')}>
          Créer
        </Button>
      ),
    },
    {
      emoji: '📰',
      title: 'Régénérer la Gazette',
      text: "Réécrit l'édition du jour (remplace la précédente).",
      button: (
        <ConfirmButton size="sm" variant="secondary" confirmLabel="Confirmer" onConfirm={() => void perform(() => api.regenerateGazette(), 'Gazette régénérée.')}>
          Réécrire
        </ConfirmButton>
      ),
    },
  ];
  return (
    <div className="space-y-4">
      <Card title="Maître du Jeu (IA)">
        {status ? (
          <>
            <p className="text-sm">
              Modèle <strong>{String(status.model)}</strong> · effort {String(status.effort)}
            </p>
            <p className="mt-1 text-sm">Clé API {status.api_key_configured ? <Badge tone="moss">configurée</Badge> : <Badge tone="ember">absente → dictionnaire de secours</Badge>}</p>
            {calls.length > 0 && (
              <div className="mt-3 grid grid-cols-3 gap-2">
                <Stat label="Appels" value={calls.length} />
                <Stat label="Secours" value={fallbacks} tone={fallbacks > 0 ? 'ember' : undefined} />
                <Stat label="Jetons" value={tokens >= 10_000 ? `${Math.round(tokens / 1000)} k` : tokens} sub={errors ? `${errors} erreur(s)` : undefined} />
              </div>
            )}
          </>
        ) : (
          <Spinner />
        )}
      </Card>
      <Card title="Commandes" flush>
        <ul className="divide-y divide-parchment-200 border-t border-parchment-200">
          {commands.map((c) => (
            <li key={c.title} className="flex items-center gap-3 px-4 py-3">
              <span className="w-7 shrink-0 text-center text-xl" aria-hidden="true">
                {c.emoji}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold">{c.title}</span>
                <span className="block text-xs leading-snug text-ink-soft">{c.text}</span>
              </span>
              <span className="shrink-0">{c.button}</span>
            </li>
          ))}
        </ul>
      </Card>
      <Card title="Envoyer une tentation" subtitle="Une proposition discrète arrive chez le joueur choisi.">
        <div className="mb-3 grid grid-cols-2 gap-2">
          {data.players
            .filter((p) => p.is_active_slot)
            .map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setTarget(p.id)}
                aria-pressed={target === p.id}
                className={cx('flex min-h-11 items-center gap-2 rounded-xl border px-2.5 text-left text-sm', target === p.id ? 'border-wood-600 bg-wood-600/10 font-semibold' : 'border-parchment-300 bg-white')}
              >
                <Avatar emoji={p.avatar_emoji} color={p.avatar_color} size="sm" />
                <span className="truncate">{p.display_name}</span>
              </button>
            ))}
        </div>
        <Button className="w-full" disabled={!target} onClick={() => void perform(() => api.sendTemptation(target), 'Tentation envoyée.').then(() => setTarget(''))}>
          Envoyer
        </Button>
      </Card>
      {calls.length > 0 && (
        <Card title="Derniers appels" flush>
          <ul className="divide-y divide-parchment-200 border-t border-parchment-200 text-xs">
            {calls.map((c) => (
              <li key={c.id} className="px-4 py-2">
                <p className="flex items-center justify-between gap-2">
                  <span>
                    <strong>{c.call_kind}</strong> {c.used_fallback && <Badge tone="ember">secours</Badge>}
                  </span>
                  <span className="text-ink-soft">{relative(c.created_at, now)}</span>
                </p>
                <p className="text-ink-soft">
                  {c.model ?? '—'} · {c.input_tokens ?? 0}/{c.output_tokens ?? 0} jetons · {c.latency_ms ?? 0} ms
                </p>
                {c.error && <p className="break-words text-ember-600">{c.error}</p>}
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

export function AdminScreen() {
  const data = useData();
  const route = useRoute();
  if (!data.me.is_admin) return <Empty>Réservé à l'administrateur.</Empty>;
  const tab: AdminTab = TABS.includes(route.param as AdminTab) ? (route.param as AdminTab) : 'partie';
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="font-serif text-2xl text-ink">🛠️ Administration</h1>
        <Button size="sm" variant="ghost" onClick={() => navigate('carte')}>
          Fermer
        </Button>
      </div>
      <Tabs<AdminTab>
        value={tab}
        onChange={(t) => navigate('admin', t === 'partie' ? null : t, { replace: true })}
        tabs={[
          { id: 'partie', label: 'Partie' },
          { id: 'joueurs', label: 'Joueurs' },
          { id: 'sauvegardes', label: 'Sauvegardes' },
          { id: 'mj', label: 'MJ (IA)' },
        ]}
      />
      {tab === 'partie' && <GamePanel />}
      {tab === 'joueurs' && <PlayersPanel />}
      {tab === 'sauvegardes' && <SnapshotsPanel />}
      {tab === 'mj' && <GameMasterPanel />}
    </div>
  );
}
