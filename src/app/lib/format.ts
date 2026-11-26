/** Formats français (Europe/Madrid). */
const TZ = 'Europe/Madrid';

const eurFormat = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
const eurCents = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: 2 });
const numFormat = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 });

export function eur(value: number | null | undefined, cents = false): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  return (cents ? eurCents : eurFormat).format(value);
}

export function num(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  return numFormat.format(value);
}

export function pct(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  return `${numFormat.format(value)} %`;
}

export function signed(value: number, suffix = ''): string {
  const v = numFormat.format(Math.abs(value));
  return `${value > 0 ? '+' : value < 0 ? '−' : ''}${v}${suffix}`;
}

export function dateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('fr-FR', { timeZone: TZ, weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export function dateLong(isoOrDay: string): string {
  const d = isoOrDay.length === 10 ? new Date(`${isoOrDay}T12:00:00Z`) : new Date(isoOrDay);
  return d.toLocaleDateString('fr-FR', { timeZone: TZ, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

export function timeShort(iso: string): string {
  return new Date(iso).toLocaleTimeString('fr-FR', { timeZone: TZ, hour: '2-digit', minute: '2-digit' });
}

/** « il y a 3 h », « dans 2 j ». */
export function relative(iso: string | null | undefined, now: Date): string {
  if (!iso) return '—';
  const diff = new Date(iso).getTime() - now.getTime();
  const abs = Math.abs(diff);
  const units: [number, string][] = [
    [86_400_000, 'j'],
    [3_600_000, 'h'],
    [60_000, 'min'],
  ];
  for (const [ms, label] of units) {
    if (abs >= ms) {
      const n = Math.floor(abs / ms);
      return diff >= 0 ? `dans ${n} ${label}` : `il y a ${n} ${label}`;
    }
  }
  // Moins d'une minute : l'horloge d'affichage peut retarder de quelques secondes sur l'événement.
  return "à l'instant";
}

/** Compte à rebours : « 2 j 03 h », « 01:12:09 », « 00:08 ». */
export function countdown(targetIso: string, now: Date): string {
  const ms = Math.max(0, new Date(targetIso).getTime() - now.getTime());
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86_400);
  const h = Math.floor((s % 86_400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const two = (n: number) => String(n).padStart(2, '0');
  if (d > 0) return `${d} j ${two(h)} h`;
  if (h > 0) return `${two(h)}:${two(m)}:${two(sec)}`;
  return `${two(m)}:${two(sec)}`;
}

export function humanize(key: string): string {
  const text = key.replace(/^portfolio:/, '').replace(/_/g, ' ').replace(/\bpct\b/, '%').replace(/\beur\b/, '€');
  return text.charAt(0).toUpperCase() + text.slice(1);
}
