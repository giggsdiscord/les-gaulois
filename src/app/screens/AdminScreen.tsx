/** Administration (M. Lerme) : sauvegardes, import/export, places 8-10, PIN, Maître du Jeu, mode démo. */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { PublicPlayer, SnapshotInfo } from '../api/types.ts';
import { Badge, Button, Card, Empty, Input, SectionTitle, Select } from '../components/ui.tsx';
import { dateTime } from '../lib/format.ts';
import { SNAPSHOT_TRIGGER } from '../lib/labels.ts';
import { useData, useGame } from '../state/GameContext.tsx';

function kb(bytes: number) {
  return bytes >= 1_048_576 ? `${(bytes / 1_048_576).toFixed(1)} Mo` : `${Math.max(1, Math.round(bytes / 1024))} Ko`;
}

function Snapshots() {
  const { api, perform, toast } = useGame();
  const [list, setList] = useState<SnapshotInfo[] | null>(null);
  const [label, setLabel] = useState('');
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

  return (
    <Card title="Sauvegardes" subtitle="Une sauvegarde automatique chaque nuit et avant chaque Agora ; conservation 30 jours.">
      <div className="mb-3 flex gap-2">
        <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Libellé (facultatif)" />
        <Button onClick={() => void perform(() => api.createSnapshot(label || null), 'Sauvegarde créée.').then(() => (setLabel(''), load()))}>Sauvegarder</Button>
      </div>
      {list === null ? (
        <p className="text-sm text-ink-soft">Chargement…</p>
      ) : list.length === 0 ? (
        <Empty>Aucune sauvegarde.</Empty>
      ) : (
        <ul className="divide-y divide-parchment-200">
          {list.map((s) => (
            <li key={s.id} className="flex items-center justify-between gap-2 py-2 text-sm">
              <span className="min-w-0">
                <span className="block font-semibold">{s.label || dateTime(s.created_at)}</span>
                <span className="text-xs text-ink-soft">
                  {dateTime(s.created_at)} · {SNAPSHOT_TRIGGER[s.trigger_type] ?? s.trigger_type} · {kb(s.size_bytes)} · J-{s.days_ago}
                </span>
              </span>
              <Button
                size="sm"
                variant="danger"
                onClick={() =>
                  window.confirm(`Restaurer l'état du ${dateTime(s.created_at)} ? Une sauvegarde « avant restauration » est créée d'abord ; les messages de La Taverne sont conservés.`) &&
                  void perform(() => api.restoreSnapshot(s.id), 'Partie restaurée.').then(load)
                }
              >
                Restaurer
              </Button>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-3 grid grid-cols-2 gap-2">
        <Button variant="secondary" onClick={() => void download()}>
          Exporter (JSON)
        </Button>
        <Button variant="secondary" onClick={() => file.current?.click()}>
          Importer…
        </Button>
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
      </div>
    </Card>
  );
}

function SlotEditor({ p }: { p: PublicPlayer }) {
  const { api, perform } = useGame();
  const [name, setName] = useState(p.display_name);
  const [character, setCharacter] = useState(p.character_name);
  const [pin, setPin] = useState('');
  const optional = p.slot_number >= 8;
  return (
    <li className="space-y-2 py-3">
      <div className="flex items-center justify-between">
        <p className="font-semibold">
          {p.avatar_emoji} Place {p.slot_number} — {p.role_title}
        </p>
        {optional ? <Badge tone={p.is_active_slot ? 'moss' : 'neutral'}>{p.is_active_slot ? 'Active' : 'Libre'}</Badge> : <Badge tone="wood">Fondateur</Badge>}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Prénom" />
        <Input value={character} onChange={(e) => setCharacter(e.target.value)} placeholder="Personnage" />
      </div>
      <div className="flex flex-wrap gap-2">
        <Input className="w-28" inputMode="numeric" maxLength={4} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))} placeholder="Nouveau PIN" />
        <Button
          size="sm"
          disabled={pin.length > 0 && pin.length !== 4}
          onClick={() => void perform(() => api.configureSlot(p.id, name, character, pin || null, p.is_active_slot), pin ? 'Fiche et PIN mis à jour (changement forcé à la connexion).' : 'Fiche mise à jour.').then(() => setPin(''))}
        >
          Enregistrer
        </Button>
        {optional && (
          <Button size="sm" variant={p.is_active_slot ? 'danger' : 'moss'} onClick={() => void perform(() => api.configureSlot(p.id, name, character, pin || null, !p.is_active_slot), p.is_active_slot ? 'Place libérée.' : 'Place ouverte : le joueur peut se connecter.')}>
            {p.is_active_slot ? 'Libérer' : 'Ouvrir la place'}
          </Button>
        )}
      </div>
    </li>
  );
}

function GameMaster() {
  const data = useData();
  const { api, perform, toast } = useGame();
  const [status, setStatus] = useState<Record<string, unknown> | null>(null);
  const [target, setTarget] = useState('');
  useEffect(() => {
    api.aiStatus().then(setStatus, (e: unknown) => toast('error', e instanceof Error ? e.message : String(e)));
  }, [api, toast]);
  const calls = (Array.isArray(status?.recent_calls) ? status.recent_calls : []) as { id: string; call_kind: string; used_fallback: boolean; model: string | null; input_tokens: number | null; output_tokens: number | null; latency_ms: number | null; error: string | null; created_at: string }[];
  return (
    <Card title="Maître du Jeu (IA)">
      {status && (
        <p className="mb-3 text-sm">
          Modèle : <strong>{String(status.model)}</strong> · effort {String(status.effort)} · clé API {status.api_key_configured ? <Badge tone="moss">configurée</Badge> : <Badge tone="ember">absente → dictionnaire de secours</Badge>}
        </p>
      )}
      <div className="grid grid-cols-2 gap-2">
        <Button variant="secondary" onClick={() => void perform(() => api.runWorldSync('nightly'), (r) => `Passage de minuit simulé : ${String(r.gazette ?? 'Gazette publiée')}.`)}>
          Lancer la nuit
        </Button>
        <Button variant="secondary" onClick={() => void perform(() => api.runWorldSync('maintenance'), 'Maintenance effectuée.')}>
          Maintenance
        </Button>
        <Button variant="secondary" onClick={() => void perform(() => api.generateMigrants(1), 'Un candidat arrive par la piste.')}>
          Nouveau candidat
        </Button>
        <Button variant="secondary" onClick={() => void perform(() => api.regenerateGazette(), 'Gazette régénérée.')}>
          Régénérer la Gazette
        </Button>
      </div>
      <div className="mt-3 flex gap-2">
        <Select value={target} onChange={(e) => setTarget(e.target.value)}>
          <option value="">Envoyer une tentation à…</option>
          {data.players.filter((p) => p.is_active_slot).map((p) => (
            <option key={p.id} value={p.id}>
              {p.display_name}
            </option>
          ))}
        </Select>
        <Button disabled={!target} onClick={() => void perform(() => api.sendTemptation(target), 'Tentation envoyée.')}>
          Envoyer
        </Button>
      </div>
      {calls.length > 0 && (
        <>
          <SectionTitle>Derniers appels</SectionTitle>
          <ul className="space-y-1 text-xs">
            {calls.map((c) => (
              <li key={c.id} className="flex flex-wrap justify-between gap-1 border-b border-parchment-200 pb-1">
                <span>
                  {dateTime(c.created_at)} · <strong>{c.call_kind}</strong> {c.used_fallback && <Badge tone="ember">secours</Badge>}
                </span>
                <span className="text-ink-soft">
                  {c.model ?? '—'} · {c.input_tokens ?? 0}/{c.output_tokens ?? 0} jetons · {c.latency_ms ?? 0} ms{c.error ? ` · ${c.error}` : ''}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </Card>
  );
}

function DemoControls() {
  const { api, perform } = useGame();
  if (api.mode !== 'demo' || !api.advanceTime) return null;
  const advance = (h: number, label: string) => void perform(() => api.advanceTime!(h), `Temps avancé : ${label}.`);
  return (
    <Card title="Machine à remonter le temps (mode démo)" tone="warning">
      <p className="mb-2 text-sm">Avancez l'horloge du jeu pour tester la simulation, l'Agora du dimanche et les nuits.</p>
      <div className="grid grid-cols-4 gap-2">
        <Button size="sm" variant="secondary" onClick={() => advance(1, '1 h')}>
          +1 h
        </Button>
        <Button size="sm" variant="secondary" onClick={() => advance(6, '6 h')}>
          +6 h
        </Button>
        <Button size="sm" variant="secondary" onClick={() => advance(24, '1 jour')}>
          +1 j
        </Button>
        <Button size="sm" variant="secondary" onClick={() => advance(72, '3 jours')}>
          +3 j
        </Button>
      </div>
      <Button
        variant="danger"
        className="mt-3 w-full"
        onClick={() => window.confirm('Effacer la partie de démonstration et repartir de zéro ?') && api.resetDemo && void api.resetDemo().then(() => window.location.reload())}
      >
        Réinitialiser la démo
      </Button>
    </Card>
  );
}

export function AdminScreen() {
  const data = useData();
  if (!data.me.is_admin) return <Empty>Réservé à l'administrateur.</Empty>;
  const slots = [...data.players].sort((a, b) => a.slot_number - b.slot_number);
  return (
    <div className="space-y-4">
      <DemoControls />
      <Snapshots />
      <GameMaster />
      <Card title="Joueurs & places 8-10" subtitle="Un nouveau PIN force le joueur à le changer à sa prochaine connexion et ferme ses sessions.">
        <ul className="divide-y divide-parchment-200">
          {slots.map((p) => (
            <SlotEditor key={p.id} p={p} />
          ))}
        </ul>
      </Card>
    </div>
  );
}
