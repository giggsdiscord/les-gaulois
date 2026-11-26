// FICHIER GÉNÉRÉ par scripts/sync-engine.mjs — ne pas modifier. Source : src/engine/rng.ts
/**
 * Générateur pseudo-aléatoire DÉTERMINISTE (xmur3 + sfc32).
 * Même graine ⇒ même suite de tirages : un tour de jeu est rejouable à l'identique
 * (tests, restauration, audit). Ne jamais utiliser Math.random() dans le moteur.
 */

function xmur3(str: string): () => number {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return h >>> 0;
  };
}

function sfc32(a: number, b: number, c: number, d: number): () => number {
  return () => {
    a >>>= 0;
    b >>>= 0;
    c >>>= 0;
    d >>>= 0;
    let t = (a + b) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    d = (d + 1) | 0;
    t = (t + d) | 0;
    c = (c + t) | 0;
    return (t >>> 0) / 4294967296;
  };
}

export interface Rng {
  /** Flottant dans [0, 1). */
  next(): number;
  /** Entier dans [min, max] (bornes incluses). */
  int(min: number, max: number): number;
  /** Flottant dans [min, max). */
  float(min: number, max: number): number;
  /** Vrai avec une probabilité exprimée en pourcentage (0-100). */
  chance(pct: number): boolean;
  pick<T>(items: readonly T[]): T;
  weighted<T>(items: readonly (readonly [T, number])[]): T;
  /** UUID v4 déterministe (identifiants des entités créées par le moteur). */
  uuid(): string;
  /** Sous-générateur indépendant dérivé d'un libellé. */
  fork(label: string): Rng;
}

export function createRng(seed: string): Rng {
  const seeder = xmur3(seed);
  const raw = sfc32(seeder(), seeder(), seeder(), seeder());
  // Échauffement pour décorréler les premières sorties
  for (let i = 0; i < 12; i++) raw();

  const rng: Rng = {
    next: raw,
    int(min, max) {
      const lo = Math.ceil(Math.min(min, max));
      const hi = Math.floor(Math.max(min, max));
      return lo + Math.floor(raw() * (hi - lo + 1));
    },
    float(min, max) {
      return min + raw() * (max - min);
    },
    chance(pct) {
      if (pct <= 0) return false;
      if (pct >= 100) return true;
      return raw() * 100 < pct;
    },
    pick(items) {
      if (items.length === 0) throw new Error('rng.pick sur une liste vide');
      return items[Math.floor(raw() * items.length)] as (typeof items)[number];
    },
    weighted(items) {
      const total = items.reduce((acc, [, w]) => acc + Math.max(0, w), 0);
      if (total <= 0) throw new Error('rng.weighted sans poids positif');
      let roll = raw() * total;
      for (const [item, w] of items) {
        roll -= Math.max(0, w);
        if (roll < 0) return item;
      }
      return items[items.length - 1]![0];
    },
    uuid() {
      const hex: string[] = [];
      for (let i = 0; i < 16; i++) hex.push(Math.floor(raw() * 256).toString(16).padStart(2, '0'));
      hex[6] = ((parseInt(hex[6]!, 16) & 0x0f) | 0x40).toString(16).padStart(2, '0');
      hex[8] = ((parseInt(hex[8]!, 16) & 0x3f) | 0x80).toString(16).padStart(2, '0');
      const h = hex.join('');
      return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
    },
    fork(label) {
      return createRng(`${seed}::${label}::${raw()}`);
    },
  };
  return rng;
}
