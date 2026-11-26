/**
 * Carte interactive du hameau (V4.7) : plan illustré (prés, forêts, rivière animée, piste,
 * réseaux, bâtisses avec toits, ruines, échafaudages), pastilles lisibles à taille fixe à l'écran
 * (icône, état, badges ⚡ 🐸 💧, avancement, priorité du moment qui pulse), calques, et un mode
 * « Explorer » plein écran : glisser pour se déplacer, pincer ou double-toucher pour zoomer,
 * boutons + / − / recentrer, boussole, échelle, vue « Liste ». Logique pure dans lib/mapView.ts.
 */
import { useEffect, useId, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { PublicVillage, Structure } from '../api/types.ts';
import { useBackToClose } from '../lib/backClose.ts';
import { STRUCTURE_STATUS } from '../lib/labels.ts';
import {
  centerOf,
  centerOn,
  clampView,
  fitView,
  groupStructures,
  inLayer,
  KIND_ICON,
  KIND_LABEL,
  LANDSCAPE_KINDS,
  LAYERS,
  MAP_H,
  MAP_W,
  zoomAt,
  type LayerId,
  type View,
} from '../lib/mapView.ts';
import { cx } from './ui.tsx';

/** 1 unité du plan ≈ 0,65 m (30 ha sur 1000 × 700). */
const METERS_PER_UNIT = Math.sqrt(300_000 / (MAP_W * MAP_H));

const STATUS_RING: Record<string, string> = {
  operational: '#4d7c0f',
  in_progress: '#c8962e',
  cleared: '#c8962e',
  awaiting_power: '#d97706',
  damaged: '#b3452c',
  ruin: '#8c8377',
  planned: '#a08a6e',
};

function useSize<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => setSize({ w: el.clientWidth, h: el.clientHeight });
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, size] as const;
}

const pts = (path: number[][] | null) => (path ?? []).map(([x, y]) => `${x},${y}`).join(' ');

function trackColor(condition: number): string {
  if (condition >= 60) return '#8a6a43';
  if (condition >= 40) return '#c8962e';
  return '#b3452c';
}

// ---------------------------------------------------------------------------
// Dessin
// ---------------------------------------------------------------------------
interface CanvasProps {
  structures: Structure[];
  village: PublicVillage;
  view: View;
  aspect: number;
  /** Pixels d'écran par unité du plan. */
  ppu: number;
  layer: LayerId;
  priorityIds: ReadonlySet<string>;
  selectedId: string | null;
  /** Rayon des pastilles, en pixels d'écran. */
  pinPx: number;
  showLabels: boolean;
}

function Defs({ id }: { id: string }) {
  return (
    <defs>
      <linearGradient id={`${id}-meadow`} x1="0" y1="0" x2="0.3" y2="1">
        <stop offset="0%" stopColor="#e6ecd2" />
        <stop offset="100%" stopColor="#cdd8a9" />
      </linearGradient>
      <pattern id={`${id}-grass`} width="26" height="22" patternUnits="userSpaceOnUse">
        <path d="M4 14l2-5M7 14l0-6M10 14l-2-4M17 6l1-4M20 6l-1-4" stroke="#a9b97c" strokeWidth="1.2" strokeLinecap="round" opacity="0.55" />
      </pattern>
      <pattern id={`${id}-trees`} width="38" height="34" patternUnits="userSpaceOnUse">
        <ellipse cx="11" cy="15" rx="9" ry="4" fill="#33481c" opacity="0.25" />
        <circle cx="10" cy="10" r="8.5" fill="#557a33" />
        <circle cx="7.5" cy="7.5" r="3.5" fill="#7aa34f" opacity="0.8" />
        <ellipse cx="30" cy="31" rx="8" ry="3.5" fill="#33481c" opacity="0.25" />
        <circle cx="29" cy="26" r="7.5" fill="#4a6c2b" />
        <circle cx="27" cy="23.5" r="3" fill="#6f9a46" opacity="0.8" />
        <circle cx="31" cy="9" r="5" fill="#5f8a3a" />
      </pattern>
      <pattern id={`${id}-rows`} width="14" height="14" patternUnits="userSpaceOnUse">
        <rect width="14" height="14" fill="#a7774f" />
        <path d="M0 4h14M0 11h14" stroke="#6f9a3e" strokeWidth="4" strokeLinecap="round" />
      </pattern>
      <pattern id={`${id}-scaffold`} width="9" height="9" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
        <rect width="9" height="9" fill="#e9d29a" />
        <path d="M0 0v9" stroke="#c8962e" strokeWidth="3" />
      </pattern>
      <pattern id={`${id}-solar`} width="12" height="9" patternUnits="userSpaceOnUse">
        <rect width="12" height="9" fill="#3f566b" />
        <path d="M0 0.5h12M0.5 0v9" stroke="#9db4c7" strokeWidth="1" />
      </pattern>
      <pattern id={`${id}-paving`} width="16" height="16" patternUnits="userSpaceOnUse">
        <rect width="16" height="16" fill="#eadfc6" />
        <rect x="1" y="1" width="6.5" height="6.5" rx="1.5" fill="#dccdae" />
        <rect x="9" y="9" width="6.5" height="6.5" rx="1.5" fill="#dccdae" />
      </pattern>
      <linearGradient id={`${id}-water`} x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor="#7cbcdc" />
        <stop offset="100%" stopColor="#3f88b0" />
      </linearGradient>
      <pattern id={`${id}-snow`} width="40" height="40" patternUnits="userSpaceOnUse">
        <circle cx="6" cy="8" r="2" fill="#fff" />
        <circle cx="26" cy="18" r="1.6" fill="#fff" />
        <circle cx="16" cy="32" r="2.2" fill="#fff" />
        <circle cx="35" cy="36" r="1.4" fill="#fff" />
      </pattern>
      <pattern id={`${id}-rain`} width="30" height="30" patternUnits="userSpaceOnUse">
        <path d="M5 2l-4 10M20 14l-4 10" stroke="#5a7d96" strokeWidth="1.4" strokeLinecap="round" />
      </pattern>
    </defs>
  );
}

const ROOFS: Record<string, [string, string]> = {
  building: ['#c8683e', '#9e4b29'],
  gite: ['#c8683e', '#9e4b29'],
  school: ['#c8683e', '#9e4b29'],
  church: ['#868892', '#64666e'],
  forge: ['#73614f', '#56483a'],
  jail: ['#a19a90', '#7f786f'],
  lab: ['#7f9470', '#5f7352'],
  border_post: ['#8a7a63', '#6b5d4a'],
};

/** Bâtisse ou ouvrage vu du ciel, selon son état. */
function Footprint({ s, id }: { s: Structure; id: string }) {
  const { x, y, width: w, height: h } = s;
  const outline = { vectorEffect: 'non-scaling-stroke' as const };
  if (s.status === 'planned') {
    return <rect x={x} y={y} width={w} height={h} rx={4} fill="rgba(255,252,245,0.45)" stroke="#8a6a43" strokeWidth={1.5} strokeDasharray="5 4" {...outline} />;
  }
  const shadow = <rect x={x + 3} y={y + 4} width={w} height={h} rx={4} fill="#2b2118" opacity={0.16} />;
  switch (s.kind) {
    case 'garden':
      return <rect x={x} y={y} width={w} height={h} rx={6} fill={`url(#${id}-rows)`} stroke="#5f8238" strokeWidth={1.5} {...outline} />;
    case 'livestock_pen':
      return (
        <g>
          <rect x={x} y={y} width={w} height={h} rx={6} fill="#bcd08a" />
          <rect x={x} y={y} width={w} height={h} rx={6} fill="none" stroke="#7a5a3a" strokeWidth={2.5} strokeDasharray="2 5" {...outline} />
          {s.status === 'in_progress' && <rect x={x} y={y} width={w} height={h} rx={6} fill={`url(#${id}-scaffold)`} opacity={0.45} />}
        </g>
      );
    case 'square':
      return (
        <g>
          <rect x={x} y={y} width={w} height={h} rx={14} fill={`url(#${id}-paving)`} stroke="#c7b48e" strokeWidth={1.5} {...outline} />
          <circle cx={x + w - 12} cy={y + 12} r={9} fill="#5f8a3a" />
        </g>
      );
    case 'water_source':
      return (
        <g>
          <circle cx={x + w / 2} cy={y + h / 2} r={w / 2 + 6} fill="#9fd0e6" opacity={0.5} />
          <circle cx={x + w / 2} cy={y + h / 2} r={w / 2} fill={`url(#${id}-water)`} stroke="#2f6f8f" strokeWidth={1.5} {...outline} />
        </g>
      );
    case 'septic_tank':
      return <rect x={x} y={y} width={w} height={h} rx={9} fill="#a39a8c" stroke="#7d756a" strokeWidth={1.5} {...outline} />;
    case 'solar':
      return (
        <g>
          {shadow}
          <rect x={x} y={y} width={w} height={h} rx={2} fill={s.status === 'operational' ? `url(#${id}-solar)` : `url(#${id}-scaffold)`} stroke="#2e3f4f" strokeWidth={1.2} {...outline} />
        </g>
      );
    case 'dam':
      return (
        <g>
          {shadow}
          <rect x={x} y={y} width={w} height={h} rx={3} fill={s.status === 'operational' ? '#9aa6ad' : `url(#${id}-scaffold)`} stroke="#5d6a72" strokeWidth={1.2} {...outline} />
        </g>
      );
    case 'generator':
    case 'mining_farm':
    case 'watchtower':
    case 'gate':
      return (
        <g>
          {shadow}
          <rect x={x} y={y} width={w} height={h} rx={3} fill={s.status === 'operational' ? '#8f8577' : `url(#${id}-scaffold)`} stroke="#5a4f43" strokeWidth={1.2} {...outline} />
        </g>
      );
  }

  // Bâtisses : murs, toit à deux pans, ruines, échafaudages
  if (s.status === 'ruin' || s.status === 'cleared') {
    const rubble = s.status === 'ruin';
    return (
      <g>
        <rect x={x} y={y} width={w} height={h} rx={2} fill={rubble ? '#bdb3a4' : '#d4c9b6'} opacity={0.9} />
        <rect x={x} y={y} width={w} height={h} rx={2} fill="none" stroke="#6f665b" strokeWidth={2} strokeDasharray="12 5 4 6" {...outline} />
        {rubble && (
          <g fill="#8c8377">
            <circle cx={x + w * 0.3} cy={y + h * 0.4} r={3} />
            <circle cx={x + w * 0.62} cy={y + h * 0.62} r={3.6} />
            <circle cx={x + w * 0.45} cy={y + h * 0.72} r={2.4} />
            <path d={`M${x + 5} ${y + 5} l${w * 0.3} ${h * 0.45} l${w * 0.2} -${h * 0.25}`} stroke="#6f665b" strokeWidth={1.5} fill="none" />
          </g>
        )}
      </g>
    );
  }
  const [light, dark] = ROOFS[s.kind] ?? ROOFS.building!;
  const horizontal = w >= h;
  const roofDone = s.status === 'in_progress' ? Math.max(0, Math.min(1, s.progress_pct / 100)) : 1;
  const half = horizontal ? (
    <>
      <rect x={x} y={y} width={w * roofDone} height={h / 2} fill={light} />
      <rect x={x} y={y + h / 2} width={w * roofDone} height={h / 2} fill={dark} />
      <path d={`M${x} ${y + h / 2}h${w * roofDone}`} stroke="#6e3219" strokeWidth={1} opacity={0.6} />
    </>
  ) : (
    <>
      <rect x={x} y={y} width={w / 2} height={h * roofDone} fill={light} />
      <rect x={x + w / 2} y={y} width={w / 2} height={h * roofDone} fill={dark} />
      <path d={`M${x + w / 2} ${y}v${h * roofDone}`} stroke="#6e3219" strokeWidth={1} opacity={0.6} />
    </>
  );
  return (
    <g>
      {shadow}
      <rect x={x} y={y} width={w} height={h} rx={2} fill={s.status === 'in_progress' ? `url(#${id}-scaffold)` : '#e8dcc4'} />
      {half}
      {s.kind === 'church' && <rect x={x + w - 16} y={y - 6} width={14} height={14} fill="#5d5f67" stroke="#3f4047" strokeWidth={1} />}
      {s.kind === 'forge' && <rect x={x + 6} y={y + 4} width={8} height={8} fill="#3d3329" />}
      {s.status === 'damaged' && (
        <g>
          <rect x={x + w * 0.55} y={y + 3} width={w * 0.3} height={h * 0.4} fill="#8c8377" opacity={0.85} />
          <path d={`M${x + w * 0.2} ${y + 2} l${w * 0.15} ${h * 0.5} l-${w * 0.06} ${h * 0.3}`} stroke="#3b2a1c" strokeWidth={1.5} fill="none" />
        </g>
      )}
      <rect
        x={x}
        y={y}
        width={w}
        height={h}
        rx={2}
        fill="none"
        stroke={s.status === 'awaiting_power' ? '#d97706' : '#5a3d24'}
        strokeWidth={s.status === 'awaiting_power' ? 2.5 : 1.2}
        strokeDasharray={s.status === 'awaiting_power' ? '6 4' : undefined}
        {...outline}
      />
    </g>
  );
}

/** Pastille à taille fixe à l'écran : icône, anneau d'état, badges, avancement, nom. */
function Pin({ s, ppu, r, selected, priority, label }: { s: Structure; ppu: number; r: number; selected: boolean; priority: boolean; label: boolean }) {
  const [cx0, cy0] = centerOf(s);
  const ring = STATUS_RING[s.status] ?? '#4d7c0f';
  const radius = selected ? r * 1.2 : r;
  const badges: [string, string][] = [];
  if (s.status === 'awaiting_power') badges.push(['⚡', '#f59e0b']);
  if (s.eco_veto_active) badges.push(['🐸', '#4d7c0f']);
  if (s.leak_alert) badges.push(['💧', '#b3452c']);
  const showProgress = (s.status === 'in_progress' || s.status === 'cleared' || (s.status === 'ruin' && s.progress_pct > 0)) && s.progress_pct < 100;
  return (
    <g transform={`translate(${cx0} ${cy0}) scale(${1 / ppu})`}>
      {priority && <circle r={radius + 4} fill="none" stroke="#b3452c" strokeWidth={3} className="map-pulse" />}
      <circle r={radius + 10} fill="transparent" />
      <circle cy={1.5} r={radius + 1.5} fill="#2b2118" opacity={0.25} />
      <circle
        r={radius}
        fill={s.status === 'planned' ? 'rgba(255,250,240,0.85)' : '#fffaf0'}
        stroke={selected ? '#2b2118' : ring}
        strokeWidth={selected ? 3.5 : 2.5}
        strokeDasharray={s.status === 'planned' ? '4 3' : undefined}
      />
      <text y={radius * 0.38} fontSize={radius * 1.05} textAnchor="middle" style={{ pointerEvents: 'none' }}>
        {KIND_ICON[s.kind] ?? '📍'}
      </text>
      {badges.map(([icon, color], i) => (
        <g key={icon} transform={`translate(${radius * 0.8 - i * 13} ${-radius * 0.8})`}>
          <circle r={7.5} fill={color} stroke="#fffaf0" strokeWidth={1.5} />
          <text y={3.2} fontSize={9} textAnchor="middle">
            {icon}
          </text>
        </g>
      ))}
      {showProgress && (
        <g transform={`translate(0 ${radius + 7})`}>
          <rect x={-15} y={-6} width={30} height={12} rx={6} fill="#fffaf0" stroke={ring} strokeWidth={1.2} />
          <text y={3.5} fontSize={9} fontWeight={700} textAnchor="middle" fill="#3b2a1c">
            {s.progress_pct} %
          </text>
        </g>
      )}
      {label && (
        <text
          y={radius + (showProgress ? 26 : 15)}
          fontSize={11.5}
          fontWeight={600}
          textAnchor="middle"
          fill="#2b2118"
          stroke="#fbf7ef"
          strokeWidth={3.5}
          style={{ paintOrder: 'stroke', pointerEvents: 'none' }}
        >
          {s.name.replace(/\s*\(.*\)$/, '')}
        </text>
      )}
    </g>
  );
}

function MapCanvas({ structures, village: v, view, aspect, ppu, layer, priorityIds, selectedId, pinPx, showLabels }: CanvasProps) {
  const id = `vm${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const visible = structures.filter((s) => s.status !== 'demolished');
  const dim = (s: Structure) => (inLayer(s, layer, priorityIds) ? 1 : 0.22);
  const byKind = (kind: string) => visible.filter((s) => s.kind === kind);
  const things = visible.filter((s) => !LANDSCAPE_KINDS.includes(s.kind));
  const pins = [...things].sort((a, b) => (a.id === selectedId ? 1 : b.id === selectedId ? -1 : centerOf(a)[1] - centerOf(b)[1]));
  const h = view.w * aspect;
  return (
    <svg viewBox={`${view.x} ${view.y} ${view.w} ${h}`} className="block h-full w-full select-none" role="img" aria-label="Carte du hameau">
      <Defs id={id} />
      <rect x={-50} y={-50} width={MAP_W + 100} height={MAP_H + 100} fill={`url(#${id}-meadow)`} />
      <rect width={MAP_W} height={MAP_H} fill={`url(#${id}-grass)`} />
      <path d="M260 600 C 340 560, 470 600, 560 640 L 600 700 L 240 700 Z" fill="#c4d39a" opacity={0.55} />
      <path d="M820 300 C 900 280, 980 330, 1000 380 L 1000 520 C 940 500, 880 470, 840 420 Z" fill="#c4d39a" opacity={0.5} />
      {[0, 1, 2, 3].map((i) => (
        <path
          key={i}
          d={`M${60 + i * 10} ${250 + i * 95} C ${260 + i * 8} ${200 + i * 95}, ${430} ${235 + i * 95}, ${580} ${190 + i * 95} S ${880} ${225 + i * 95}, ${1000} ${300 + i * 95}`}
          fill="none"
          stroke="#aebb83"
          strokeWidth={1.4}
          opacity={0.55}
          vectorEffect="non-scaling-stroke"
        />
      ))}

      {byKind('forest').map((f) => (
        <g key={f.id} data-sid={f.id} opacity={dim(f)}>
          <polygon points={pts(f.path_points)} fill="#6f9445" opacity={0.45} />
          <polygon points={pts(f.path_points)} fill={`url(#${id}-trees)`} />
          <polygon points={pts(f.path_points)} fill="none" stroke="#4b6a2c" strokeWidth={1.2} opacity={0.4} vectorEffect="non-scaling-stroke" />
        </g>
      ))}
      {byKind('river').map((r) => (
        <g key={r.id} data-sid={r.id} opacity={dim(r)}>
          <polyline points={pts(r.path_points)} fill="none" stroke="#b5d8e8" strokeWidth={32} strokeLinecap="round" strokeLinejoin="round" />
          <polyline points={pts(r.path_points)} fill="none" stroke={`url(#${id}-water)`} strokeWidth={17} strokeLinecap="round" strokeLinejoin="round" />
          <polyline points={pts(r.path_points)} fill="none" stroke="#e3f4ff" strokeWidth={2.5} strokeDasharray="6 22" strokeLinecap="round" className="map-flow" opacity={0.8} />
        </g>
      ))}
      {byKind('track').map((t) => (
        <g key={t.id} data-sid={t.id} opacity={dim(t)}>
          <polyline points={pts(t.path_points)} fill="none" stroke="#a88a62" strokeWidth={20} strokeLinecap="round" strokeLinejoin="round" />
          <polyline points={pts(t.path_points)} fill="none" stroke="#e5d5b3" strokeWidth={15} strokeLinecap="round" strokeLinejoin="round" />
          <polyline points={pts(t.path_points)} fill="none" stroke={trackColor(v.track_condition_pct)} strokeWidth={3} strokeDasharray="12 10" strokeLinecap="round" />
        </g>
      ))}
      {byKind('pipe').map((p) => (
        <g key={p.id} data-sid={p.id} opacity={dim(p)}>
          <polyline points={pts(p.path_points)} fill="none" stroke="#fffaf0" strokeWidth={7} strokeLinecap="round" strokeLinejoin="round" opacity={0.6} />
          <polyline points={pts(p.path_points)} fill="none" stroke={p.leak_alert ? '#b3452c' : '#2f6f8f'} strokeWidth={4} strokeDasharray="1 8" strokeLinecap="round" />
        </g>
      ))}
      {byKind('power_line').map((l) => (
        <g key={l.id} data-sid={l.id} opacity={dim(l) * (l.status === 'planned' ? 0.7 : 1)}>
          <polyline points={pts(l.path_points)} fill="none" stroke="#5b4a38" strokeWidth={2} strokeDasharray={l.status === 'operational' ? undefined : '5 6'} vectorEffect="non-scaling-stroke" />
          {(l.path_points ?? []).map(([px, py]) => (
            <rect key={`${px}-${py}`} x={px! - 4} y={py! - 4} width={8} height={8} fill="#5b4a38" />
          ))}
        </g>
      ))}

      {things.map((s) => (
        <g key={s.id} data-sid={s.id} opacity={dim(s)}>
          <Footprint s={s} id={id} />
        </g>
      ))}

      {v.real_snow_cm > 0 && <rect width={MAP_W} height={MAP_H} fill={`url(#${id}-snow)`} opacity={0.6} style={{ pointerEvents: 'none' }} />}
      {v.real_snow_cm <= 0 && v.real_precip_mm > 2 && <rect width={MAP_W} height={MAP_H} fill={`url(#${id}-rain)`} opacity={0.35} style={{ pointerEvents: 'none' }} />}

      {pins.map((s) => (
        <g
          key={s.id}
          data-sid={s.id}
          role="button"
          tabIndex={0}
          aria-label={`${s.name} — ${STRUCTURE_STATUS[s.status] ?? s.status}`}
          opacity={dim(s)}
          className="cursor-pointer focus:outline-none"
        >
          <Pin s={s} ppu={ppu} r={pinPx} selected={s.id === selectedId} priority={priorityIds.has(s.id)} label={showLabels || s.id === selectedId} />
        </g>
      ))}
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Calques (pastilles de filtre)
// ---------------------------------------------------------------------------
function LayerChips({ layer, onChange, counts, className, bleed }: { layer: LayerId; onChange: (l: LayerId) => void; counts: Record<LayerId, number>; className?: string; bleed?: boolean }) {
  return (
    <div className={cx('no-scrollbar flex gap-2 overflow-x-auto', bleed ? '-mx-4 px-4' : 'px-3', className)} role="tablist" aria-label="Calques de la carte">
      {LAYERS.map((l) => (
        <button
          key={l.id}
          role="tab"
          aria-selected={layer === l.id}
          onClick={() => onChange(l.id)}
          className={cx(
            'min-h-9 shrink-0 rounded-full border px-3 text-sm font-semibold whitespace-nowrap',
            layer === l.id ? 'border-wood-700 bg-wood-700 text-parchment-50' : 'border-parchment-300 bg-parchment-50 text-ink',
          )}
        >
          {l.label}
          {l.id !== 'all' && <span className={cx('ml-1 text-xs', layer === l.id ? 'text-parchment-200' : 'text-ink-soft')}>{counts[l.id]}</span>}
        </button>
      ))}
    </div>
  );
}

function useLayerCounts(structures: Structure[], priorityIds: ReadonlySet<string>): Record<LayerId, number> {
  return useMemo(() => {
    const visible = structures.filter((s) => s.status !== 'demolished');
    const out = {} as Record<LayerId, number>;
    for (const l of LAYERS) out[l.id] = visible.filter((s) => inLayer(s, l.id, priorityIds)).length;
    return out;
  }, [structures, priorityIds]);
}

function WeatherChip({ v }: { v: PublicVillage }) {
  const icon = v.real_snow_cm > 0 ? '❄️' : v.real_precip_mm > 2 ? '🌧️' : v.real_temp_c >= 25 ? '☀️' : '⛅';
  return (
    <span className="rounded-full bg-parchment-50/90 px-2.5 py-1 text-xs font-semibold text-ink shadow-sm">
      {icon} {Math.round(v.real_temp_c)} °C
    </span>
  );
}

// ---------------------------------------------------------------------------
// Mode « Explorer » plein écran
// ---------------------------------------------------------------------------
interface ExplorerProps {
  structures: Structure[];
  village: PublicVillage;
  priorityIds: ReadonlySet<string>;
  selectedId: string | null;
  layer: LayerId;
  onLayer: (l: LayerId) => void;
  onSelect: (s: Structure) => void;
  onClose: () => void;
}

function ScaleBar({ ppu }: { ppu: number }) {
  const meters = 100 * ppu / METERS_PER_UNIT > 150 ? 50 : 100;
  const px = (meters / METERS_PER_UNIT) * ppu;
  return (
    <div className="pointer-events-none rounded-md bg-parchment-50/85 px-2 py-1 text-[10px] font-semibold text-ink shadow-sm">
      <div className="h-1.5 border-x-2 border-b-2 border-ink" style={{ width: `${Math.round(px)}px` }} />
      {meters} m
    </div>
  );
}

function MapButton({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <button onClick={onClick} aria-label={label} className="flex h-11 w-11 items-center justify-center rounded-full bg-parchment-50 text-xl font-bold text-ink shadow-md active:bg-parchment-200">
      {children}
    </button>
  );
}

function StructureList({ structures, priorityIds, onSelect, onLocate }: { structures: Structure[]; priorityIds: ReadonlySet<string>; onSelect: (s: Structure) => void; onLocate: (s: Structure) => void }) {
  const groups = groupStructures(structures, priorityIds);
  return (
    <div className="h-full overflow-y-auto overscroll-contain px-4 pb-6">
      {groups.map((g) => (
        <section key={g.id} className="mt-4">
          <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-ink-soft">
            {g.label} · {g.items.length}
          </h3>
          <ul className="divide-y divide-parchment-200 overflow-hidden rounded-2xl border border-parchment-200 bg-parchment-50">
            {g.items.map((s) => (
              <li key={s.id} className="flex items-center">
                <button onClick={() => onSelect(s)} className="flex min-h-14 min-w-0 flex-1 items-center gap-3 px-3 py-2 text-left active:bg-parchment-100">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 bg-white text-lg" style={{ borderColor: STATUS_RING[s.status] ?? '#4d7c0f' }} aria-hidden="true">
                    {KIND_ICON[s.kind] ?? '📍'}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold text-ink">{s.name.replace(/\s*\(.*\)$/, '')}</span>
                    <span className="block text-xs text-ink-soft">
                      {KIND_LABEL[s.kind] ?? s.kind} · {STRUCTURE_STATUS[s.status] ?? s.status}
                      {s.beds_capacity > 0 ? ` · ${s.beds_capacity} lits` : ''}
                      {s.status === 'awaiting_power' ? ' · ⚡' : ''}
                      {s.leak_alert ? ' · 💧 fuite' : ''}
                    </span>
                    {(s.status === 'in_progress' || s.status === 'cleared') && (
                      <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-parchment-200">
                        <span className="block h-full rounded-full bg-gold-500" style={{ width: `${s.progress_pct}%` }} />
                      </span>
                    )}
                  </span>
                </button>
                <button onClick={() => onLocate(s)} className="flex h-14 w-12 shrink-0 items-center justify-center text-lg text-wood-700 active:bg-parchment-100" aria-label={`Voir ${s.name} sur la carte`}>
                  📍
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function Explorer({ structures, village, priorityIds, selectedId, layer, onLayer, onSelect, onClose }: ExplorerProps) {
  useBackToClose(true, onClose);
  const [areaRef, size] = useSize<HTMLDivElement>();
  const aspect = size.w > 0 ? size.h / size.w : 1.6;
  const [view, setView] = useState<View | null>(null);
  const [mode, setMode] = useState<'map' | 'list'>('map');
  const [hint, setHint] = useState(true);
  const counts = useLayerCounts(structures, priorityIds);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{ moved: boolean; sid: string | null; startX: number; startY: number; lastTap: number }>({ moved: false, sid: null, startX: 0, startY: 0, lastTap: 0 });

  // Cadre initial (et recalé si l'écran tourne) : centré sur la sélection, sinon le cœur du hameau
  useEffect(() => {
    if (size.w === 0) return;
    setView((prev) => {
      if (prev) return clampView(prev, aspect);
      const sel = structures.find((s) => s.id === selectedId);
      const [px, py] = sel ? centerOf(sel) : [470, 340];
      return centerOn(px, py, Math.min(fitView(aspect).w, 520), aspect);
    });
  }, [size.w, size.h, aspect, structures, selectedId]);

  useEffect(() => {
    const body = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const t = window.setTimeout(() => setHint(false), 4000);
    return () => {
      document.body.style.overflow = body;
      window.clearTimeout(t);
    };
  }, []);

  // Molette (ordinateur) : zoom autour du pointeur
  useEffect(() => {
    const el = areaRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      setView((v) => {
        if (!v) return v;
        const ppu = rect.width / v.w;
        return zoomAt(v, e.deltaY < 0 ? 1.2 : 1 / 1.2, v.x + (e.clientX - rect.left) / ppu, v.y + (e.clientY - rect.top) / ppu, rect.height / rect.width);
      });
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [areaRef, mode]);

  const ppu = view && size.w > 0 ? size.w / view.w : 1;
  const toPlan = (clientX: number, clientY: number): [number, number] => {
    const rect = areaRef.current!.getBoundingClientRect();
    return [view!.x + (clientX - rect.left) / ppu, view!.y + (clientY - rect.top) / ppu];
  };

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    try {
      (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
    } catch {
      // Pointeur déjà relâché (ou simulé) : le geste continue sans capture
    }
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 1) {
      const sid = (e.target as Element).closest('[data-sid]')?.getAttribute('data-sid') ?? null;
      gesture.current = { ...gesture.current, moved: false, sid, startX: e.clientX, startY: e.clientY };
    } else {
      gesture.current.moved = true;
    }
    setHint(false);
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const prev = pointers.current.get(e.pointerId);
    if (!prev || !view) return;
    const others = [...pointers.current.entries()].filter(([pid]) => pid !== e.pointerId).map(([, p]) => p);
    if (others.length === 0) {
      if (Math.hypot(e.clientX - gesture.current.startX, e.clientY - gesture.current.startY) > 8) gesture.current.moved = true;
      if (gesture.current.moved) {
        const dx = (e.clientX - prev.x) / ppu;
        const dy = (e.clientY - prev.y) / ppu;
        setView((v) => (v ? clampView({ x: v.x - dx, y: v.y - dy, w: v.w }, aspect) : v));
      }
    } else {
      const o = others[0]!;
      const before = Math.hypot(prev.x - o.x, prev.y - o.y);
      const after = Math.hypot(e.clientX - o.x, e.clientY - o.y);
      if (before > 0) {
        const [mx, my] = toPlan((e.clientX + o.x) / 2, (e.clientY + o.y) / 2);
        setView((v) => (v ? zoomAt(v, after / before, mx, my, aspect) : v));
      }
    }
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
  };

  const onPointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    const wasSingle = pointers.current.size === 1;
    pointers.current.delete(e.pointerId);
    if (!wasSingle || gesture.current.moved || !view) return;
    const now = Date.now();
    if (now - gesture.current.lastTap < 300) {
      // Double toucher : zoom ×2 à cet endroit
      const [px, py] = toPlan(e.clientX, e.clientY);
      setView((v) => (v ? zoomAt(v, 2, px, py, aspect) : v));
      gesture.current.lastTap = 0;
      return;
    }
    gesture.current.lastTap = now;
    const s = structures.find((x) => x.id === gesture.current.sid);
    if (s) onSelect(s);
  };

  const zoomBy = (factor: number) => setView((v) => (v ? zoomAt(v, factor, v.x + v.w / 2, v.y + (v.w * aspect) / 2, aspect) : v));
  const locate = (s: Structure) => {
    const [px, py] = centerOf(s);
    setMode('map');
    setView(centerOn(px, py, 320, aspect));
  };

  return createPortal(
    <div className="parchment fixed inset-0 z-40 flex flex-col bg-parchment-100" role="dialog" aria-modal="true" aria-label="Carte du hameau">
      <div className="wood-bar safe-top shrink-0 text-parchment-50 shadow-md">
        <div className="flex items-center gap-2 px-2 py-2">
          <button onClick={onClose} className="flex h-11 items-center gap-1 rounded-full px-3 text-sm font-semibold active:bg-wood-700" aria-label="Fermer la carte">
            ‹ Retour
          </button>
          <h2 className="min-w-0 flex-1 truncate text-center font-serif text-lg">Carte du hameau</h2>
          <button onClick={() => setMode(mode === 'map' ? 'list' : 'map')} className="flex h-11 items-center rounded-full bg-wood-700 px-3 text-sm font-semibold active:bg-wood-800">
            {mode === 'map' ? '☰ Liste' : '🗺️ Carte'}
          </button>
        </div>
      </div>
      <LayerChips layer={layer} onChange={onLayer} counts={counts} className="shrink-0 py-2" />
      <div className="relative min-h-0 flex-1">
        {mode === 'list' && (
          <div className="absolute inset-0 z-10 bg-parchment-100">
            <StructureList structures={structures.filter((s) => inLayer(s, layer, priorityIds))} priorityIds={priorityIds} onSelect={onSelect} onLocate={locate} />
          </div>
        )}
        <div
          ref={areaRef}
          className="absolute inset-0 touch-none overflow-hidden"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={(e) => pointers.current.delete(e.pointerId)}
        >
          {view && (
            <MapCanvas
              structures={structures}
              village={village}
              view={view}
              aspect={aspect}
              ppu={ppu}
              layer={layer}
              priorityIds={priorityIds}
              selectedId={selectedId}
              pinPx={15}
              showLabels={ppu >= 0.55}
            />
          )}
          <div className="pointer-events-none absolute left-3 top-3 flex flex-col items-start gap-2">
            <WeatherChip v={village} />
            {village.insecurity_pct >= 40 && <span className="rounded-full bg-ember-600 px-2.5 py-1 text-xs font-bold text-white shadow">⚠ Insécurité {Math.round(village.insecurity_pct)} %</span>}
          </div>
          <div className="pointer-events-none absolute right-3 top-3 flex h-10 w-10 flex-col items-center justify-center rounded-full bg-parchment-50/90 text-[10px] font-bold leading-none text-ink shadow-sm" aria-hidden="true">
            <span className="text-ember-600">▲</span>N
          </div>
          <div className="absolute bottom-4 right-3 flex flex-col gap-2" onPointerDown={(e) => e.stopPropagation()}>
            <MapButton label="Zoomer" onClick={() => zoomBy(1.6)}>
              +
            </MapButton>
            <MapButton label="Dézoomer" onClick={() => zoomBy(1 / 1.6)}>
              −
            </MapButton>
            <MapButton label="Vue d'ensemble" onClick={() => setView(fitView(aspect))}>
              ⌖
            </MapButton>
          </div>
          <div className="absolute bottom-4 left-3">
            <ScaleBar ppu={ppu} />
          </div>
          {hint && (
            <div className="pointer-events-none absolute inset-x-0 bottom-20 flex justify-center px-6">
              <span className="rounded-2xl bg-wood-900/80 px-4 py-2 text-center text-sm text-parchment-50 shadow-lg">Glissez pour vous déplacer · pincez ou touchez deux fois pour zoomer · touchez un bâtiment</span>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

// ---------------------------------------------------------------------------
// Carte de l'accueil
// ---------------------------------------------------------------------------
export interface VillageMapProps {
  structures: Structure[];
  village: PublicVillage;
  priorityIds: ReadonlySet<string>;
  selectedId: string | null;
  onSelect: (s: Structure) => void;
}

export function VillageMap({ structures, village, priorityIds, selectedId, onSelect }: VillageMapProps) {
  const [ref, size] = useSize<HTMLDivElement>();
  const [layer, setLayer] = useState<LayerId>('all');
  const [explore, setExplore] = useState(false);
  const counts = useLayerCounts(structures, priorityIds);
  const aspect = MAP_H / MAP_W;
  const view = fitView(aspect);
  const ppu = size.w > 0 ? size.w / view.w : 0.35;
  const insecure = village.insecurity_pct >= 40;
  const attention = counts.todo;

  const onClick = (e: ReactMouseEvent<HTMLDivElement>) => {
    const sid = (e.target as Element).closest('[data-sid]')?.getAttribute('data-sid');
    const s = sid ? structures.find((x) => x.id === sid) : undefined;
    if (s && !LANDSCAPE_KINDS.includes(s.kind)) onSelect(s);
    else setExplore(true);
  };

  return (
    <section aria-label="Carte du hameau" className="space-y-2">
      <div className="flex items-baseline justify-between gap-2 px-1">
        <h2 className="font-serif text-lg text-ink">Le hameau</h2>
        <span className="text-xs text-ink-soft">{attention > 0 ? `${attention} ouvrage${attention > 1 ? 's' : ''} à traiter` : 'Tout est calme'}</span>
      </div>
      <LayerChips layer={layer} onChange={setLayer} counts={counts} bleed />
      <div
        ref={ref}
        onClick={onClick}
        className={cx('relative aspect-[10/7] cursor-pointer overflow-hidden rounded-2xl border shadow-sm', insecure ? 'border-ember-600/60' : 'border-parchment-300')}
      >
        <MapCanvas
          structures={structures}
          village={village}
          view={view}
          aspect={aspect}
          ppu={ppu}
          layer={layer}
          priorityIds={priorityIds}
          selectedId={selectedId}
          pinPx={11}
          showLabels={false}
        />
        <div className="pointer-events-none absolute left-2 top-2 flex gap-1.5">
          <WeatherChip v={village} />
          {insecure && <span className="rounded-full bg-ember-600 px-2.5 py-1 text-xs font-bold text-white shadow">⚠ {Math.round(village.insecurity_pct)} %</span>}
        </div>
        <button
          onClick={(e) => {
            e.stopPropagation();
            setExplore(true);
          }}
          className="absolute bottom-2 right-2 flex min-h-10 items-center gap-1 rounded-full bg-wood-700 px-3 text-sm font-semibold text-parchment-50 shadow-md active:bg-wood-800"
        >
          ⛶ Explorer
        </button>
      </div>
      <p className="px-1 text-xs text-ink-soft">Touchez une pastille pour sa fiche, ou « Explorer » pour zoomer, vous déplacer et voir la liste.</p>
      {explore && (
        <Explorer
          structures={structures}
          village={village}
          priorityIds={priorityIds}
          selectedId={selectedId}
          layer={layer}
          onLayer={setLayer}
          onSelect={onSelect}
          onClose={() => setExplore(false)}
        />
      )}
    </section>
  );
}
