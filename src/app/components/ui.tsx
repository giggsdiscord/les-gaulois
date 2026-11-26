/** Composants d'interface : boutons, cartes, jauges, fenêtres, onglets, champs. */
import { useEffect, useRef, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes, type TouchEvent } from 'react';
import { createPortal } from 'react-dom';
import { useBackToClose } from '../lib/backClose.ts';
import { useGame, type Toast } from '../state/GameContext.tsx';
import { CloseIcon } from './icons.tsx';

export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(' ');
}

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'moss';
export function Button({ variant = 'primary', size = 'md', className, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; size?: 'sm' | 'md' | 'lg' }) {
  const variants: Record<ButtonVariant, string> = {
    primary: 'bg-wood-600 text-parchment-50 hover:bg-wood-700 active:bg-wood-800 shadow-sm',
    secondary: 'bg-parchment-100 text-ink border border-parchment-300 hover:bg-parchment-200',
    ghost: 'text-wood-700 hover:bg-parchment-200/70',
    danger: 'bg-ember-600 text-white hover:brightness-95 shadow-sm',
    moss: 'bg-moss-600 text-white hover:bg-moss-700 shadow-sm',
  };
  const sizes = { sm: 'min-h-9 px-3 text-sm', md: 'min-h-11 px-4 text-[15px]', lg: 'min-h-12 px-5 text-base' };
  return (
    <button
      className={cx(
        'inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition-colors disabled:opacity-45 disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-wood-600',
        variants[variant],
        sizes[size],
        className,
      )}
      {...props}
    />
  );
}

/** Carte ; `flush` retire la marge intérieure (listes bord à bord). */
export function Card({ title, subtitle, actions, children, className, tone = 'default', flush }: { title?: ReactNode; subtitle?: ReactNode; actions?: ReactNode; children?: ReactNode; className?: string; tone?: 'default' | 'warning' | 'danger' | 'moss' | 'river'; flush?: boolean }) {
  const tones = {
    default: 'bg-white/80 border-parchment-200',
    warning: 'bg-gold-100 border-gold-500/40',
    danger: 'bg-ember-100 border-ember-600/30',
    moss: 'bg-moss-100 border-moss-500/30',
    river: 'bg-river-100 border-river-600/25',
  };
  return (
    <section className={cx('rounded-2xl border shadow-[0_1px_0_rgba(59,42,28,0.06)]', flush ? 'overflow-hidden' : 'p-4', tones[tone], className)}>
      {(title || actions) && (
        <header className={cx('mb-3 flex items-start justify-between gap-3', flush && 'px-4 pt-4')}>
          <div className="min-w-0">
            {title && <h2 className="font-serif text-lg leading-snug text-ink">{title}</h2>}
            {subtitle && <p className="mt-0.5 text-sm text-ink-soft">{subtitle}</p>}
          </div>
          {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
        </header>
      )}
      {children}
    </section>
  );
}

export function Badge({ children, tone = 'neutral', className }: { children: ReactNode; tone?: 'neutral' | 'moss' | 'ember' | 'gold' | 'river' | 'wood'; className?: string }) {
  const tones = {
    neutral: 'bg-parchment-200 text-ink-soft',
    moss: 'bg-moss-100 text-moss-700',
    ember: 'bg-ember-100 text-ember-600',
    gold: 'bg-gold-100 text-wood-700',
    river: 'bg-river-100 text-river-600',
    wood: 'bg-wood-600 text-parchment-50',
  };
  return <span className={cx('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold whitespace-nowrap', tones[tone], className)}>{children}</span>;
}

/** Jauge 0-100 ; `good` indique le sens favorable (haut ou bas). */
export function Gauge({ label, value, good = 'high', suffix = '%', max = 100, hint }: { label: string; value: number | null | undefined; good?: 'high' | 'low' | 'neutral'; suffix?: string; max?: number; hint?: string }) {
  const v = typeof value === 'number' && Number.isFinite(value) ? value : 0;
  const ratio = Math.max(0, Math.min(1, v / max));
  const score = good === 'high' ? ratio : good === 'low' ? 1 - ratio : 0.6;
  const color = good === 'neutral' ? 'bg-river-600' : score >= 0.6 ? 'bg-moss-500' : score >= 0.35 ? 'bg-gold-500' : 'bg-ember-600';
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between gap-2 text-sm">
        <span className="text-ink-soft">{label}</span>
        <span className="font-semibold tabular-nums text-ink">
          {Number.isInteger(v) ? v : v.toFixed(1)}
          {suffix}
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-parchment-200" role="meter" aria-label={label} aria-valuenow={v} aria-valuemin={0} aria-valuemax={max}>
        <div className={cx('h-full rounded-full transition-[width] duration-500', color)} style={{ width: `${ratio * 100}%` }} />
      </div>
      {hint && <p className="mt-1 text-xs text-ink-soft">{hint}</p>}
    </div>
  );
}

export function Stat({ label, value, sub, tone }: { label: string; value: ReactNode; sub?: ReactNode; tone?: 'ember' | 'moss' }) {
  return (
    <div className="rounded-xl border border-parchment-200 bg-white/70 px-3 py-2.5">
      <p className="text-xs font-medium uppercase tracking-wide text-ink-soft">{label}</p>
      <p className={cx('mt-0.5 text-lg font-semibold tabular-nums', tone === 'ember' ? 'text-ember-600' : tone === 'moss' ? 'text-moss-700' : 'text-ink')}>{value}</p>
      {sub && <p className="text-xs text-ink-soft">{sub}</p>}
    </div>
  );
}

/**
 * Fenêtre du bas (téléphone) : se ferme par la croix, en touchant le fond, en glissant la poignée
 * vers le bas ou avec le bouton retour du téléphone (V4.4). `persistent` = fenêtre imposée.
 * `footer` reste collé en bas, à portée du pouce, même quand le contenu défile.
 */
export function Sheet({ open, onClose, title, children, footer, persistent }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; footer?: ReactNode; persistent?: boolean }) {
  const [drag, setDrag] = useState(0);
  const startY = useRef<number | null>(null);
  useBackToClose(open, onClose, !persistent);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    // Le fond ne défile pas sous la fenêtre
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
    };
  }, [open, onClose]);
  if (!open) return null;
  const grab = {
    onTouchStart: (e: TouchEvent) => (startY.current = e.touches[0]!.clientY),
    onTouchMove: (e: TouchEvent) => startY.current !== null && setDrag(Math.max(0, e.touches[0]!.clientY - startY.current)),
    onTouchEnd: () => {
      if (drag > 90 && !persistent) onClose();
      startY.current = null;
      setDrag(0);
    },
  };
  // Rendue au niveau de <body> : une fenêtre ouverte depuis l'en-tête passe ainsi au-dessus de la navigation basse
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-wood-900/50 backdrop-blur-[2px]" onClick={() => !persistent && onClose()} role="presentation">
      <div
        role="dialog"
        aria-modal="true"
        className={cx('parchment flex max-h-[90dvh] w-full max-w-lg flex-col rounded-t-3xl shadow-2xl', drag === 0 && 'transition-transform duration-150')}
        style={drag ? { transform: `translateY(${drag}px)` } : undefined}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="shrink-0 touch-none px-5 pt-2" {...grab}>
          <div className="mx-auto mb-2 h-1.5 w-10 rounded-full bg-parchment-300" aria-hidden="true" />
          <div className="mb-3 flex items-start justify-between gap-3">
            <h2 className="font-serif text-xl leading-snug text-ink">{title}</h2>
            {!persistent && (
              <button onClick={onClose} className="-m-1 rounded-full p-2 text-ink-soft hover:bg-parchment-200" aria-label="Fermer">
                <CloseIcon />
              </button>
            )}
          </div>
        </div>
        <div className={cx('min-h-0 flex-1 overflow-y-auto overscroll-contain px-5', !footer && 'safe-sheet-bottom')}>{children}</div>
        {footer && <div className="safe-sheet-bottom shrink-0 border-t border-parchment-200 bg-parchment-50/95 px-5 pt-3">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

/** Choix exclusif compact (2 à 4 options), pleine largeur. */
export function Segmented<T extends string>({ value, onChange, options }: { value: T; onChange: (id: T) => void; options: { id: T; label: ReactNode }[] }) {
  return (
    <div className="mb-3 grid gap-1 rounded-xl bg-parchment-200/70 p-1" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }} role="tablist">
      {options.map((o) => (
        <button
          key={o.id}
          role="tab"
          aria-selected={value === o.id}
          onClick={() => onChange(o.id)}
          className={cx('min-h-9 truncate rounded-lg px-2 text-sm font-semibold transition-colors', value === o.id ? 'bg-white text-ink shadow-sm' : 'text-ink-soft')}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/**
 * Bouton à double appui pour les gestes lourds (restaurer, lancer la nuit, se déconnecter…) :
 * le premier appui demande confirmation sur place, le second exécute ; retour à l'état initial après 4 s.
 */
export function ConfirmButton({ onConfirm, confirmLabel, children, variant = 'danger', ...props }: Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'onClick'> & { onConfirm: () => void; confirmLabel: ReactNode; variant?: ButtonVariant; size?: 'sm' | 'md' | 'lg' }) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const t = window.setTimeout(() => setArmed(false), 4000);
    return () => window.clearTimeout(t);
  }, [armed]);
  return (
    <Button
      {...props}
      variant={armed ? 'danger' : variant}
      className={cx(props.className, armed && 'animate-pulse')}
      onClick={() => {
        if (!armed) return setArmed(true);
        setArmed(false);
        onConfirm();
      }}
    >
      {armed ? confirmLabel : children}
    </Button>
  );
}

/** Compteur − / + (quantités) : plus simple qu'un clavier numérique au pouce. */
export function Stepper({ value, onChange, min = 1, max = 99, step = 1, format }: { value: number; onChange: (v: number) => void; min?: number; max?: number; step?: number; format?: (v: number) => ReactNode }) {
  const set = (v: number) => onChange(Math.min(max, Math.max(min, v)));
  const btn = 'flex h-11 w-11 items-center justify-center rounded-xl border border-parchment-300 bg-white text-xl font-bold text-wood-700 disabled:opacity-40';
  return (
    <div className="flex items-center gap-3">
      <button type="button" className={btn} onClick={() => set(value - step)} disabled={value <= min} aria-label="Moins">
        −
      </button>
      <span className="min-w-16 flex-1 text-center text-lg font-semibold tabular-nums">{format ? format(value) : value}</span>
      <button type="button" className={btn} onClick={() => set(value + step)} disabled={value >= max} aria-label="Plus">
        +
      </button>
    </div>
  );
}

/** Ligne touchable d'une liste (menu, joueurs, sauvegardes…). */
export function ListRow({ icon, title, subtitle, aside, onClick, tone, className }: { icon?: ReactNode; title: ReactNode; subtitle?: ReactNode; aside?: ReactNode; onClick?: () => void; tone?: 'danger'; className?: string }) {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag onClick={onClick} className={cx('flex min-h-14 w-full items-center gap-3 px-4 py-2.5 text-left', onClick && 'active:bg-parchment-100', className)}>
      {icon && <span className="flex w-8 shrink-0 justify-center text-xl">{icon}</span>}
      <span className="min-w-0 flex-1">
        <span className={cx('block font-semibold leading-snug', tone === 'danger' ? 'text-ember-600' : 'text-ink')}>{title}</span>
        {subtitle && <span className="block text-sm leading-snug text-ink-soft">{subtitle}</span>}
      </span>
      {aside}
      {onClick && <span className="shrink-0 text-lg text-wood-500" aria-hidden="true">›</span>}
    </Tag>
  );
}

export function Tabs<T extends string>({ tabs, value, onChange }: { tabs: { id: T; label: ReactNode; badge?: number }[]; value: T; onChange: (id: T) => void }) {
  return (
    <div className="no-scrollbar -mx-4 mb-4 flex gap-1.5 overflow-x-auto px-4" role="tablist">
      {tabs.map((t) => (
        <button
          key={t.id}
          role="tab"
          aria-selected={value === t.id}
          onClick={() => onChange(t.id)}
          className={cx(
            'inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-sm font-semibold transition-colors',
            value === t.id ? 'bg-wood-700 text-parchment-50' : 'bg-white/70 text-ink-soft border border-parchment-200 hover:bg-parchment-100',
          )}
        >
          {t.label}
          {t.badge ? <span className="rounded-full bg-ember-600 px-1.5 text-[11px] text-white">{t.badge}</span> : null}
        </button>
      ))}
    </div>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-semibold text-ink">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-ink-soft">{hint}</span>}
    </label>
  );
}

const inputClass = 'rounded-xl border border-parchment-300 bg-white px-3 py-2.5 text-[15px] text-ink placeholder:text-ink-soft/60 focus:border-wood-500 focus:outline-none focus:ring-2 focus:ring-wood-500/25';

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cx(inputClass, /(^|\s)w-/.test(props.className ?? '') ? null : 'w-full', props.className)} />;
}
export function TextArea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={cx(inputClass, 'w-full', /(^|\s)min-h-/.test(props.className ?? '') ? null : 'min-h-28', props.className)} />;
}
export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={cx(inputClass, 'w-full appearance-auto', props.className)} />;
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="rounded-xl border border-dashed border-parchment-300 px-4 py-6 text-center text-sm text-ink-soft">{children}</p>;
}

export function Avatar({ emoji, color, size = 'md' }: { emoji: string; color: string; size?: 'sm' | 'md' | 'lg' }) {
  const sizes = { sm: 'h-7 w-7 text-sm', md: 'h-10 w-10 text-lg', lg: 'h-14 w-14 text-2xl' };
  return (
    <span className={cx('inline-flex shrink-0 items-center justify-center rounded-full ring-2 ring-white/70', sizes[size])} style={{ backgroundColor: `${color}22`, boxShadow: `inset 0 0 0 2px ${color}` }} aria-hidden="true">
      {emoji}
    </span>
  );
}

export function Spinner() {
  return <span className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-wood-500 border-t-transparent" aria-label="Chargement" />;
}

export function ToastStack() {
  const { toasts, dismissToast } = useGame();
  return (
    <div className="pointer-events-none fixed inset-x-0 top-3 z-[60] flex flex-col items-center gap-2 px-4" aria-live="polite">
      {toasts.map((t: Toast) => (
        <button
          key={t.id}
          onClick={() => dismissToast(t.id)}
          className={cx(
            'pointer-events-auto w-full max-w-md rounded-2xl px-4 py-3 text-left text-sm font-medium shadow-lg',
            t.kind === 'error' ? 'bg-ember-600 text-white' : t.kind === 'success' ? 'bg-moss-600 text-white' : 'bg-wood-800 text-parchment-50',
          )}
        >
          {t.text}
        </button>
      ))}
    </div>
  );
}

export function SectionTitle({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="mb-2 mt-6 flex items-baseline justify-between gap-2 first:mt-0">
      <h3 className="font-serif text-base text-wood-700">{children}</h3>
      {aside}
    </div>
  );
}
