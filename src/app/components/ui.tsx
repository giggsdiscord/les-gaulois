/** Composants d'interface : boutons, cartes, jauges, fenêtres, onglets, champs. */
import { useEffect, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
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

export function Card({ title, subtitle, actions, children, className, tone = 'default' }: { title?: ReactNode; subtitle?: ReactNode; actions?: ReactNode; children?: ReactNode; className?: string; tone?: 'default' | 'warning' | 'danger' | 'moss' | 'river' }) {
  const tones = {
    default: 'bg-white/80 border-parchment-200',
    warning: 'bg-gold-100 border-gold-500/40',
    danger: 'bg-ember-100 border-ember-600/30',
    moss: 'bg-moss-100 border-moss-500/30',
    river: 'bg-river-100 border-river-600/25',
  };
  return (
    <section className={cx('rounded-2xl border p-4 shadow-[0_1px_0_rgba(59,42,28,0.06)]', tones[tone], className)}>
      {(title || actions) && (
        <header className="mb-3 flex items-start justify-between gap-3">
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

export function Sheet({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-wood-900/50 backdrop-blur-[2px] md:items-center" onClick={onClose} role="presentation">
      <div
        role="dialog"
        aria-modal="true"
        className={cx('parchment max-h-[88vh] w-full overflow-y-auto rounded-t-3xl p-5 shadow-2xl md:rounded-3xl', wide ? 'md:max-w-3xl' : 'md:max-w-lg')}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <h2 className="font-serif text-xl text-ink">{title}</h2>
          <button onClick={onClose} className="-m-1 rounded-full p-2 text-ink-soft hover:bg-parchment-200" aria-label="Fermer">
            <CloseIcon />
          </button>
        </div>
        {children}
      </div>
    </div>
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
