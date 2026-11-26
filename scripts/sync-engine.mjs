#!/usr/bin/env node
/**
 * Copie le moteur déterministe (src/engine/*.ts) dans supabase/functions/_shared/engine/
 * pour qu'il soit embarqué par les Edge Functions (Supabase ne déploie que supabase/functions).
 * Usage : npm run engine:sync           → copie
 *         node scripts/sync-engine.mjs --check → échoue si la copie n'est pas à jour
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(root, 'src', 'engine');
const dest = join(root, 'supabase', 'functions', '_shared', 'engine');
const header = (file) => `// FICHIER GÉNÉRÉ par scripts/sync-engine.mjs — ne pas modifier. Source : src/engine/${file}\n`;
const checkOnly = process.argv.includes('--check');

const files = readdirSync(src).filter((f) => f.endsWith('.ts'));
const stale = [];
for (const f of files) {
  const expected = header(f) + readFileSync(join(src, f), 'utf8');
  const target = join(dest, f);
  const current = existsSync(target) ? readFileSync(target, 'utf8') : null;
  if (current !== expected) stale.push(f);
  if (!checkOnly && current !== expected) {
    mkdirSync(dest, { recursive: true });
    writeFileSync(target, expected, 'utf8');
  }
}
const orphans = existsSync(dest) ? readdirSync(dest).filter((f) => f.endsWith('.ts') && !files.includes(f)) : [];
if (!checkOnly) for (const f of orphans) rmSync(join(dest, f));

if (checkOnly) {
  if (stale.length || orphans.length) {
    console.error(`Copie du moteur périmée (${[...stale, ...orphans].join(', ')}). Lancez : npm run engine:sync`);
    process.exit(1);
  }
  console.log('Copie du moteur à jour ✔');
} else {
  console.log(`Moteur copié dans supabase/functions/_shared/engine (${stale.length} fichier(s) mis à jour, ${orphans.length} supprimé(s)).`);
}
