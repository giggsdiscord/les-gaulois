#!/usr/bin/env node
/**
 * Vérification d'un déploiement réel (Supabase + GitHub Pages), en lecture seule.
 *
 *   npm run deploy:check -- --url https://<ref>.supabase.co --key <clé publishable/anon> \
 *                           [--site https://<pseudo>.github.io/<depot>/] [--cron-secret <secret>]
 *
 * Les valeurs peuvent aussi venir des variables d'environnement VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY,
 * SITE_URL, CRON_SECRET, ou des fichiers .env.deploy / .env.local / .env.cron à la racine (ignorés par Git).
 * Préférer .env.deploy : Vite ne le charge pas, donc `npm run dev` reste en mode démo. Aucune valeur secrète n'est affichée.
 * Rien n'est écrit dans la partie : seul --cron-secret déclenche une maintenance, qui n'écrit que s'il y a
 * quelque chose à faire (comme la tâche pg_cron toutes les 15 minutes).
 */
import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

// .env.deploy (que Vite ne charge pas : `npm run dev` reste en mode démo), sinon .env.local.
// CRON_SECRET peut aussi venir du fichier .env.cron (une seule ligne : le secret).
function fromDotEnv() {
  const out = {};
  for (const name of ['.env.local', '.env.deploy']) {
    const file = join(root, name);
    if (!existsSync(file)) continue;
    for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
      const m = /^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line);
      if (m && !line.trim().startsWith('#')) out[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  }
  const cronFile = join(root, '.env.cron');
  if (!out.CRON_SECRET && existsSync(cronFile)) {
    const value = readFileSync(cronFile, 'utf8').trim();
    if (/^[A-Za-z0-9_-]{24,}$/.test(value)) out.CRON_SECRET = value;
  }
  return out;
}

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const dotenv = fromDotEnv();
const url = (arg('url') ?? process.env.VITE_SUPABASE_URL ?? dotenv.VITE_SUPABASE_URL ?? '').replace(/\/+$/, '');
const key = arg('key') ?? process.env.VITE_SUPABASE_ANON_KEY ?? dotenv.VITE_SUPABASE_ANON_KEY ?? '';
const site = arg('site') ?? process.env.SITE_URL ?? dotenv.SITE_URL ?? '';
const cronSecret = arg('cron-secret') ?? process.env.CRON_SECRET ?? dotenv.CRON_SECRET ?? '';

if (!url || !key) {
  console.error('Usage : npm run deploy:check -- --url https://<ref>.supabase.co --key <clé publishable ou anon> [--site <url du site>] [--cron-secret <secret>]');
  process.exit(2);
}

let failures = 0;
let warnings = 0;
function check(label, ok, detail = '') {
  if (ok) console.log(`  ✓ ${label}`);
  else {
    failures += 1;
    console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`);
  }
}
function warn(label, detail) {
  warnings += 1;
  console.log(`  ! ${label}${detail ? ` — ${detail}` : ''}`);
}

// Clé publishable (sb_publishable_…) : en-tête apikey seul ; ancienne clé anon (JWT) : apikey + Authorization.
const authHeaders = key.startsWith('sb_') ? { apikey: key } : { apikey: key, Authorization: `Bearer ${key}` };

async function http(path, init = {}) {
  try {
    const res = await fetch(`${url}${path}`, { ...init, headers: { ...authHeaders, ...(init.headers ?? {}) }, signal: AbortSignal.timeout(30_000) });
    const text = await res.text();
    let json = null;
    try {
      json = JSON.parse(text);
    } catch {
      /* réponse non JSON */
    }
    return { status: res.status, headers: res.headers, json, text };
  } catch (err) {
    return { status: 0, headers: new Headers(), json: null, text: String(err?.message ?? err) };
  }
}
const short = (r) => `HTTP ${r.status} ${(r.json?.message ?? r.json?.error ?? r.text ?? '').toString().slice(0, 140)}`;

console.log(`Projet : ${new URL(url).host}${site ? ` · site : ${site}` : ''}\n`);

console.log('• Base de données (setup_complete.sql)');
const players = await http('/rest/v1/players_public?select=display_name,role_title,slot_number,is_active_slot&order=slot_number');
if (players.status === 0) {
  console.log(`  ✗ projet injoignable — ${players.text}. Vérifiez l'URL (Settings > API Keys / Data API) et la connexion.`);
  process.exit(1);
}
check('vue players_public lisible avec la clé publique', players.status === 200 && Array.isArray(players.json), short(players));
if (Array.isArray(players.json)) {
  check('10 places, 7 fondateurs actifs', players.json.length === 10 && players.json.filter((p) => p.is_active_slot).length >= 7, `${players.json.length} place(s)`);
  const garbled = players.json.find((p) => /[ÃÂð][\u0080-ÿŒ-™]/.test(`${p.display_name} ${p.role_title ?? ''}`));
  check('accents et emojis encodés en UTF-8', !garbled, garbled ? `« ${garbled.role_title} » : script SQL copié sans -Encoding UTF8 (voir Dépannage)` : '');
}
const village = await http('/rest/v1/village_public_state?select=act_number,treasury_eur,last_tick_at');
check('état public du village', village.status === 200 && Array.isArray(village.json) && village.json.length === 1, short(village));

console.log('• Secrets protégés (doivent être refusés à la clé publique)');
for (const table of ['village_state', 'players', 'player_pins', 'player_sessions', 'daily_snapshots']) {
  const r = await http(`/rest/v1/${table}?select=*&limit=1`);
  check(`${table} inaccessible`, r.status === 401 || r.status === 403 || r.status === 404, short(r));
}
const commit = await http('/rest/v1/rpc/engine_commit', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ p_expected_revision: 0, p_changes: {} }) });
check('engine_commit interdit à la clé publique', commit.status === 401 || commit.status === 403 || commit.status === 404, short(commit));
const badPin = await http('/rest/v1/rpc/verify_player_pin', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ p_player_id: '00000000-0000-4000-8000-000000000000', p_pin: '0000' }),
});
check('RPC de connexion joignable', badPin.status === 200 || badPin.status === 400 || /introuvable|non attribu/i.test(badPin.text), short(badPin));

console.log('• Edge Functions');
const expectedOrigin = site ? new URL(site).origin : null;
for (const fn of ['game-engine', 'gm-ai-action', 'daily-world-sync']) {
  const r = await http(`/functions/v1/${fn}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ op: 'status', mode: 'maintenance' }) });
  if (r.status === 404) {
    check(`${fn} déployée`, false, 'introuvable : lancez le workflow « Déploiement des Edge Functions »');
    continue;
  }
  const ours = r.json && r.json.ok === false && typeof r.json.error === 'string';
  check(`${fn} déployée, vérification JWT désactivée`, (r.status === 401 || r.status === 403) && ours, ours ? short(r) : `réponse de la passerelle et non du jeu (${short(r)}) : verify_jwt = false doit s'appliquer`);
  if (r.status === 500) warn(`${fn} : erreur interne`, 'voir Supabase > Edge Functions > Logs');
  const pre = await fetch(`${url}/functions/v1/${fn}`, {
    method: 'OPTIONS',
    headers: { Origin: expectedOrigin ?? 'https://exemple.github.io', 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'x-player-token, content-type, apikey, authorization, x-client-info' },
    signal: AbortSignal.timeout(30_000),
  }).catch(() => null);
  const allow = pre?.headers.get('access-control-allow-origin') ?? '';
  if (expectedOrigin) check(`${fn} : CORS autorise ${expectedOrigin}`, allow === expectedOrigin || allow === '*', `Access-Control-Allow-Origin = « ${allow} » (secret ALLOWED_ORIGIN)`);
  else if (allow === '*') warn(`${fn} : CORS ouvert à toutes les origines`, 'posez le secret ALLOWED_ORIGIN = https://<pseudo>.github.io');
}

if (cronSecret) {
  console.log('• Maintenance avec le secret cron (comme pg_cron)');
  const r = await http('/functions/v1/daily-world-sync', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-cron-secret': cronSecret }, body: JSON.stringify({ mode: 'maintenance' }) });
  check('daily-world-sync accepte le secret et lit la base', r.status === 200 && r.json?.ok === true, short(r));
} else {
  warn('secret cron non testé', 'ajoutez --cron-secret <CRON_SECRET> pour vérifier la maintenance de bout en bout');
}

if (site) {
  console.log('• Site GitHub Pages');
  const page = await fetch(site, { signal: AbortSignal.timeout(30_000) }).catch((e) => ({ ok: false, status: 0, text: async () => String(e) }));
  const html = await page.text();
  check('page d\'accueil publiée', page.ok && html.includes('id="root"'), `HTTP ${page.status}`);
  const script = /<script[^>]+src="([^"]+\.js)"/.exec(html)?.[1];
  if (script) {
    const js = await fetch(new URL(script, site), { signal: AbortSignal.timeout(30_000) }).then((r) => r.text()).catch(() => '');
    check('site branché sur ce projet Supabase (pas en mode démo)', js.includes(new URL(url).host), 'variables VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY absentes du build : relancez le workflow Pages après les avoir posées');
  } else {
    check('bundle JavaScript trouvé', false, 'balise <script> introuvable');
  }
}

console.log(failures === 0 ? `\nDéploiement OK ✔${warnings ? ` (${warnings} remarque(s))` : ''}` : `\n${failures} problème(s) ✘ — voir docs/DEPLOIEMENT.md, section « Dépannage »`);
process.exit(failures === 0 ? 0 : 1);
