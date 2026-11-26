#!/usr/bin/env node
/**
 * Vérifie les types des Edge Functions avec Deno (paquet npm officiel « deno », exécuté via npx :
 * rien n'est installé dans le projet). Usage : npm run functions:check
 */
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const functions = ['game-engine', 'gm-ai-action', 'daily-world-sync'];
let failed = false;
for (const name of functions) {
  const cwd = join(root, 'supabase', 'functions', name);
  const res = spawnSync('npx', ['--yes', 'deno@2.9.6', 'check', '--config', 'deno.json', 'index.ts'], { cwd, stdio: 'inherit', shell: true });
  if (res.status !== 0) {
    failed = true;
    console.error(`✗ ${name}`);
  } else {
    console.log(`✓ ${name}`);
  }
}
process.exit(failed ? 1 : 0);
