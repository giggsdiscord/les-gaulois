#!/usr/bin/env node
/**
 * Concatène les migrations (ordre chronologique) puis seed.sql en un fichier unique
 * supabase/setup_complete.sql, à coller tel quel dans l'éditeur SQL de Supabase.
 * Usage : npm run sql:bundle
 */
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const migrationsDir = join(root, 'supabase', 'migrations');
const files = readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort();

const parts = [
  '-- ============================================================================',
  '-- LES GAULOIS & MICRO-ÉTAT — Installation complète (généré par npm run sql:bundle)',
  `-- Migrations : ${files.join(', ')} + seed.sql`,
  '-- À coller dans Supabase > SQL Editor > New query, puis « Run ». Ne pas modifier à la main.',
  '-- ============================================================================',
  '',
];
for (const f of files) {
  parts.push(`-- >>> migrations/${f}`, readFileSync(join(migrationsDir, f), 'utf8'), '');
}
parts.push('-- >>> seed.sql', readFileSync(join(root, 'supabase', 'seed.sql'), 'utf8'));

const out = join(root, 'supabase', 'setup_complete.sql');
writeFileSync(out, parts.join('\n'), 'utf8');
console.log(`Écrit : supabase/setup_complete.sql (${files.length} migration(s) + seed)`);
