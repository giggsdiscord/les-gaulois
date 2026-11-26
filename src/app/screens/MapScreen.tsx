/** Écran 1 — Carte interactive du hameau (SVG 2D, viewBox 1000 × 700). */
import { useMemo, useState } from 'react';
import type { ActionDef } from '../engine.ts';
import type { Structure } from '../api/types.ts';
import { ActionSheet, LockBadges } from '../components/ActionSheet.tsx';
import { Badge, Button, Card, Gauge, Sheet, Stat, cx } from '../components/ui.tsx';
import { availableActions, population, STRUCTURE_ACTION_KINDS } from '../lib/game.ts';
import { ENERGY_LABEL, STRUCTURE_STATUS } from '../lib/labels.ts';
import { useData } from '../state/GameContext.tsx';

const LANDSCAPE = ['forest', 'river', 'track', 'pipe', 'power_line'];

const STATUS_FILL: Record<string, string> = {
  operational: '#a47148',
  damaged: '#c27c3a',
  in_progress: '#d9b25f',
  awaiting_power: '#d9b25f',
  cleared: '#b9ad9c',
  ruin: '#9b9286',
  planned: 'rgba(255,255,255,0.35)',
  demolished: 'transparent',
};

const KIND_FILL: Partial<Record<Structure['kind'], string>> = {
  garden: '#7ea24a',
  water_source: '#4f9cc2',
  septic_tank: '#8c8377',
  square: '#e9dcc0',
  church: '#b08b62',
  livestock_pen: '#9cb36c',
  solar: '#5b7186',
  dam: '#6f8794',
};

function points(path: number[][] | null): string {
  return (path ?? []).map(([x, y]) => `${x},${y}`).join(' ');
}

function trackColor(condition: number): string {
  if (condition >= 60) return '#8a6a43';
  if (condition >= 40) return '#c8962e';
  return '#b3452c';
}

export function MapScreen() {
  const data = useData();
  const [selected, setSelected] = useState<Structure | null>(null);
  const [action, setAction] = useState<ActionDef | null>(null);
  const v = data.village;
  const pop = population(data);
  const structures = data.structures.filter((s) => s.status !== 'demolished');
  const byKind = (kinds: string[]) => structures.filter((s) => kinds.includes(s.kind));

  const myStructureActions = useMemo(() => {
    if (!selected) return [];
    return availableActions(data.me, v.act_number).filter((a) => {
      if (a.target !== 'structure') return false;
      const kinds = STRUCTURE_ACTION_KINDS[a.code];
      return kinds ? kinds.includes(selected.kind) : !['forest', 'river', 'square'].includes(selected.kind);
    });
  }, [selected, data.me, v.act_number]);

  const buildings = structures.filter((s) => !LANDSCAPE.includes(s.kind));
  const insecure = v.insecurity_pct >= 40;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="Habitants" value={pop.total} sub={`${v.housing_capacity} lits PLU`} tone={pop.total > v.housing_capacity ? 'ember' : undefined} />
        <Stat label="Eau" value={`${v.water_capacity_l_day} L/j`} sub={`besoin ≈ ${pop.total * 150} L + potager`} tone={v.water_capacity_l_day < pop.total * 150 ? 'ember' : undefined} />
        <Stat label="Énergie" value={ENERGY_LABEL[v.energy_tier]} sub={`palier ${v.energy_tier}/5`} />
        <Stat label="Piste" value={`${Math.round(v.track_condition_pct)} %`} sub={v.track_condition_pct < 40 ? 'surcoût +40 %' : 'praticable'} tone={v.track_condition_pct < 40 ? 'ember' : 'moss'} />
      </div>

      <div className={cx('relative overflow-hidden rounded-2xl border shadow-sm', insecure ? 'border-ember-600/60' : 'border-parchment-300')}>
        {insecure && (
          <div className="absolute left-2 top-2 z-10 rounded-full bg-ember-600 px-3 py-1 text-xs font-bold text-white shadow">
            ⚠ Insécurité {Math.round(v.insecurity_pct)} %
          </div>
        )}
        <svg viewBox="0 0 1000 700" className="block h-auto w-full touch-manipulation" role="img" aria-label="Carte du hameau">
          <defs>
            <pattern id="trees" width="22" height="22" patternUnits="userSpaceOnUse">
              <circle cx="6" cy="7" r="5" fill="#4b6a2c" opacity="0.55" />
              <circle cx="16" cy="16" r="6" fill="#3e5a24" opacity="0.5" />
            </pattern>
            <pattern id="rows" width="12" height="12" patternUnits="userSpaceOnUse">
              <rect width="12" height="12" fill="#7ea24a" />
              <path d="M0 6h12" stroke="#5f8238" strokeWidth="3" />
            </pattern>
            <pattern id="works" width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <rect width="10" height="10" fill="#e7c57a" />
              <path d="M0 0v10" stroke="#c8962e" strokeWidth="4" />
            </pattern>
            <radialGradient id="meadow" cx="50%" cy="45%" r="70%">
              <stop offset="0%" stopColor="#e9efd6" />
              <stop offset="100%" stopColor="#d3ddb4" />
            </radialGradient>
          </defs>
          <rect width="1000" height="700" fill="url(#meadow)" />
          <path d="M120 260 C 260 200, 420 230, 560 180 S 860 220, 980 300" fill="none" stroke="#b9c592" strokeWidth="2" opacity="0.6" />
          <path d="M80 420 C 240 380, 420 420, 600 380 S 880 420, 1000 470" fill="none" stroke="#b9c592" strokeWidth="2" opacity="0.6" />

          {byKind(['forest']).map((f) => (
            <g key={f.id} onClick={() => setSelected(f)} className="cursor-pointer">
              <polygon points={points(f.path_points)} fill="#6f8f45" opacity="0.45" />
              <polygon points={points(f.path_points)} fill="url(#trees)" />
            </g>
          ))}
          {byKind(['river']).map((r) => (
            <g key={r.id} onClick={() => setSelected(r)} className="cursor-pointer">
              <polyline points={points(r.path_points)} fill="none" stroke="#7fb6d3" strokeWidth="18" strokeLinecap="round" strokeLinejoin="round" />
              <polyline points={points(r.path_points)} fill="none" stroke="#3f88b0" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" />
            </g>
          ))}
          {byKind(['track']).map((t) => (
            <g key={t.id} onClick={() => setSelected(t)} className="cursor-pointer">
              <polyline points={points(t.path_points)} fill="none" stroke="#d7c3a0" strokeWidth="16" strokeLinecap="round" strokeLinejoin="round" />
              <polyline points={points(t.path_points)} fill="none" stroke={trackColor(v.track_condition_pct)} strokeWidth="5" strokeDasharray="14 9" strokeLinecap="round" />
            </g>
          ))}
          {byKind(['power_line']).map((l) => (
            <polyline
              key={l.id}
              points={points(l.path_points)}
              fill="none"
              stroke="#c8962e"
              strokeWidth="3"
              strokeDasharray={l.status === 'operational' ? undefined : '4 8'}
              opacity={l.status === 'planned' ? 0.55 : 1}
              onClick={() => setSelected(l)}
              className="cursor-pointer"
            />
          ))}
          {byKind(['pipe']).map((p) => (
            <g key={p.id} onClick={() => setSelected(p)} className="cursor-pointer">
              <polyline points={points(p.path_points)} fill="none" stroke={p.leak_alert ? '#b3452c' : '#2f6f8f'} strokeWidth="4" strokeDasharray="8 5" />
              {p.leak_alert && (p.path_points?.[1] ?? null) && (
                <text x={p.path_points![1]![0]} y={p.path_points![1]![1] - 10} fontSize="22" textAnchor="middle">
                  💧
                </text>
              )}
            </g>
          ))}

          {buildings.map((s) => {
            const fill = s.kind === 'garden' ? 'url(#rows)' : s.status === 'in_progress' ? 'url(#works)' : KIND_FILL[s.kind] && s.status === 'operational' ? KIND_FILL[s.kind]! : STATUS_FILL[s.status] ?? '#a47148';
            const isSel = selected?.id === s.id;
            const planned = s.status === 'planned';
            return (
              <g
                key={s.id}
                role="button"
                tabIndex={0}
                aria-label={`${s.name} — ${STRUCTURE_STATUS[s.status]}`}
                onClick={() => setSelected(s)}
                onKeyDown={(e) => e.key === 'Enter' && setSelected(s)}
                className="cursor-pointer focus:outline-none"
              >
                {s.kind === 'water_source' ? (
                  <circle cx={s.x + s.width / 2} cy={s.y + s.height / 2} r={s.width / 2} fill={fill} stroke="#2f6f8f" strokeWidth={isSel ? 4 : 2} />
                ) : (
                  <rect
                    x={s.x}
                    y={s.y}
                    width={s.width}
                    height={s.height}
                    rx={s.kind === 'square' ? 10 : 4}
                    fill={fill}
                    stroke={isSel ? '#2b2118' : planned ? '#7a4b26' : '#5a3d24'}
                    strokeWidth={isSel ? 4 : planned ? 2 : 1.5}
                    strokeDasharray={planned ? '6 4' : undefined}
                  />
                )}
                {s.status === 'ruin' && <path d={`M${s.x + 6} ${s.y + 6} l${s.width / 3} ${s.height / 2} l${s.width / 4} -${s.height / 3}`} stroke="#5b5047" strokeWidth="2" fill="none" />}
                {s.kind === 'building' && s.beds_capacity > 0 && (
                  <text x={s.x + s.width / 2} y={s.y + s.height / 2 + 5} fontSize="14" fontWeight="700" textAnchor="middle" fill={s.status === 'operational' ? '#fbf7ef' : '#3b2a1c'}>
                    {s.beds_capacity} lits
                  </text>
                )}
                {s.status === 'awaiting_power' && (
                  <text x={s.x + s.width - 4} y={s.y + 2} fontSize="20" textAnchor="middle">
                    ⚡
                  </text>
                )}
                {s.eco_veto_active && (
                  <text x={s.x + 4} y={s.y + 2} fontSize="20" textAnchor="middle">
                    🐸
                  </text>
                )}
                {s.status === 'in_progress' && (
                  <rect x={s.x} y={s.y + s.height + 3} width={(s.width * s.progress_pct) / 100} height="4" rx="2" fill="#4d6b2f" />
                )}
                <text x={s.x + s.width / 2} y={s.y + s.height + 18} fontSize="13" textAnchor="middle" fill="#2b2118" style={{ paintOrder: 'stroke' }} stroke="#f4ecdc" strokeWidth="4">
                  {s.name.replace(/\s*\(.*\)$/, '')}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      <div className="flex flex-wrap gap-2 text-xs">
        <Badge tone="wood">Habitable</Badge>
        <Badge tone="gold">Chantier</Badge>
        <Badge>Ruine</Badge>
        <Badge tone="river">Réseau d'eau</Badge>
        <Badge tone="gold">⚡ Attend le courant</Badge>
        <Badge tone="moss">🐸 Veto écologique</Badge>
        <Badge tone="ember">💧 Fuite</Badge>
      </div>

      <Card title="Météo réelle" subtitle={v.real_news_headline ?? undefined}>
        <p className="text-sm text-ink">{v.real_weather_summary}</p>
      </Card>

      {selected && !action && (
        <Sheet open onClose={() => setSelected(null)} title={selected.name}>
          <div className="mb-3 flex flex-wrap gap-2">
            <Badge tone={selected.status === 'operational' ? 'moss' : selected.status === 'ruin' ? 'neutral' : 'gold'}>{STRUCTURE_STATUS[selected.status]}</Badge>
            {selected.beds_capacity > 0 && <Badge>{selected.beds_capacity} lits PLU</Badge>}
            {selected.is_power_connected ? <Badge tone="gold">⚡ Raccordé</Badge> : <Badge>Non raccordé</Badge>}
            {selected.plu_approved ? <Badge tone="river">PLU accordé</Badge> : <Badge>PLU à obtenir</Badge>}
            {selected.eco_veto_active && <Badge tone="moss">🐸 Veto écologique</Badge>}
            {selected.leak_alert && <Badge tone="ember">Fuite</Badge>}
          </div>
          {selected.notes && <p className="mb-3 text-sm text-ink-soft">{selected.notes}</p>}
          <div className="mb-4 space-y-3">
            <Gauge label="État" value={selected.kind === 'track' ? Math.round(v.track_condition_pct) : selected.condition_pct} />
            {selected.status !== 'operational' && selected.status !== 'planned' && <Gauge label="Avancement du chantier" value={selected.progress_pct} />}
          </div>
          {myStructureActions.length > 0 ? (
            <div className="space-y-2">
              <p className="text-sm font-semibold text-ink">Vos actions sur cet ouvrage</p>
              {myStructureActions.map((a) => (
                <button key={a.code} onClick={() => setAction(a)} className="flex w-full items-center justify-between gap-3 rounded-xl border border-parchment-200 bg-white px-3 py-2.5 text-left">
                  <span>
                    <span className="block text-sm font-semibold">{a.label}</span>
                    <LockBadges def={a} />
                  </span>
                  <span className="text-wood-600">→</span>
                </button>
              ))}
            </div>
          ) : (
            <p className="text-sm text-ink-soft">Aucune de vos actions ne porte sur cet ouvrage.</p>
          )}
          <Button variant="secondary" className="mt-4 w-full" onClick={() => setSelected(null)}>
            Fermer
          </Button>
        </Sheet>
      )}
      {selected && action && (
        <ActionSheet
          def={action}
          holderId={null}
          preset={{ target_structure_id: selected.id }}
          onClose={() => {
            setAction(null);
            setSelected(null);
          }}
        />
      )}
    </div>
  );
}
