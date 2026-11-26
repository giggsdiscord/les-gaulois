#!/usr/bin/env node
/**
 * Vérification locale du SQL Supabase avec PGlite (PostgreSQL compilé en WebAssembly).
 * Rejoue les migrations + seed.sql dans une base jetable, simule l'environnement Supabase
 * (schéma extensions, rôles anon / authenticated / service_role) puis exerce les RPC :
 * connexion PIN, Agora, Taverne, Carlage, veto, délégation, sauvegarde / restauration, RLS.
 *
 * Usage : npm run sql:check
 */
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const migrationsDir = join(root, 'supabase', 'migrations');
const ELY = '10000000-0000-4000-8000-000000000001';
const LERME = '10000000-0000-4000-8000-000000000002';
const TIPH = '10000000-0000-4000-8000-000000000003';

let failures = 0;
function check(label, condition, detail = '') {
  if (condition) console.log(`  ✓ ${label}`);
  else {
    failures += 1;
    console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

async function expectError(db, sql, params, pattern, label) {
  try {
    await db.query(sql, params);
    check(label, false, 'aucune erreur levée');
  } catch (err) {
    check(label, pattern.test(String(err.message)), String(err.message));
  }
}

const db = new PGlite({ extensions: { pgcrypto } });

console.log('• Environnement Supabase simulé');
await db.exec(`
  CREATE SCHEMA IF NOT EXISTS extensions;
  DO $$ BEGIN
    CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN;
    CREATE ROLE service_role NOLOGIN; CREATE ROLE authenticator NOLOGIN;
  EXCEPTION WHEN duplicate_object THEN NULL; END $$;
  GRANT USAGE ON SCHEMA public, extensions TO anon, authenticated, service_role;
  GRANT anon, authenticated, service_role TO authenticator;
`);

console.log('• Migrations');
for (const file of readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort()) {
  await db.exec(readFileSync(join(migrationsDir, file), 'utf8'));
  console.log(`  ✓ ${file}`);
}
console.log('• Seed');
await db.exec(readFileSync(join(root, 'supabase', 'seed.sql'), 'utf8'));
const counts = (await db.query(`SELECT (SELECT count(*) FROM players)::int AS players, (SELECT count(*) FROM map_structures)::int AS structures, (SELECT count(*) FROM player_pins)::int AS pins`)).rows[0];
check('10 joueurs, 10 PIN, carte du hameau', counts.players === 10 && counts.pins === 10 && counts.structures >= 25, JSON.stringify(counts));

const one = async (sql, params = []) => (await db.query(sql, params)).rows[0];
const setToken = (token) => db.query(`SELECT set_config('request.headers', $1, false)`, [JSON.stringify(token ? { 'x-player-token': token } : {})]);

console.log('• Connexion par code PIN');
check('PIN erroné → NULL', (await one(`SELECT verify_player_pin($1, '1234') AS r`, [ELY])).r === null);
check('compteur d\'échecs conservé', (await one(`SELECT failed_attempts FROM player_pins WHERE player_id = $1`, [ELY])).failed_attempts === 1);
await expectError(db, `SELECT verify_player_pin($1, '12a4')`, [ELY], /4 chiffres/, 'PIN non numérique refusé');
const login = (await one(`SELECT verify_player_pin($1, '0000') AS r`, [ELY])).r;
check('PIN correct → jeton de session', typeof login?.session_token === 'string' && login.player.role_code === 'mayor_agri');
const elyToken = login.session_token;
const lermeToken = (await one(`SELECT verify_player_pin($1, '0000') AS r`, [LERME])).r.session_token;
const tiphToken = (await one(`SELECT verify_player_pin($1, '0000') AS r`, [TIPH])).r.session_token;
await expectError(db, `SELECT verify_player_pin('10000000-0000-4000-8000-000000000008', '0000')`, [], /place non attribuée/, 'place 8 inactive refusée');

await setToken(elyToken);
check('current_player_id() lit l\'en-tête x-player-token', (await one(`SELECT current_player_id() AS id`)).id === ELY);
check('changement de PIN', (await one(`SELECT set_player_pin('0000', '4321') AS ok`)).ok === true);
check('nouveau PIN actif', (await one(`SELECT verify_player_pin($1, '4321') AS r`, [ELY])).r !== null);

console.log('• Agora');
const explanation = 'Chaque saison, 10 % des recettes nettes sont placés dans un fonds intergénérationnel géré par M. Lerme, sur le modèle norvégien, sans retrait avant l\'Acte III.';
const prop = await one(`SELECT * FROM submit_agora_proposal('Fonds souverain norvégien', $1, 'economy')`, [explanation]);
check('initiative hebdomadaire déposée', prop?.kind === 'initiative' && prop.status === 'open');
await expectError(db, `SELECT * FROM submit_agora_proposal('Deuxième idée', $1, 'economy')`, [explanation], /déjà soumis/, '1 seule initiative par semaine');
await expectError(db, `SELECT * FROM submit_agora_proposal('Trop court', 'Pas assez détaillé', 'economy')`, [], /détail explicatif/, 'détail explicatif complet exigé');
const voted = await one(`SELECT * FROM cast_agora_vote($1, true)`, [prop.id]);
check('vote nominatif OUI', voted.votes_yes.includes(ELY) && voted.votes_no.length === 0);
const revote = await one(`SELECT * FROM cast_agora_vote($1, false)`, [prop.id]);
check('changement de vote avant clôture', revote.votes_no.includes(ELY) && !revote.votes_yes.includes(ELY));
const motion = await one(`SELECT * FROM submit_agora_motion('tribunal', 'Haute trahison', 'Détournement de la caisse commune.', $1::jsonb)`, [JSON.stringify({ target_player_id: LERME, sentence: 'execution' })]);
check('motion d\'exécution : majorité des deux tiers', motion.required_majority === 'two_thirds' && motion.target_player_id === LERME);
await setToken(lermeToken);
await expectError(db, `SELECT * FROM cast_agora_vote($1, false)`, [motion.id], /accusé/, 'l\'accusé ne vote pas sur son jugement');
await expectError(db, `SELECT * FROM submit_agora_motion('naturalization', 'Naturaliser', 'Motif valable.', '{}'::jsonb)`, [], /Acte III/, 'naturalisation verrouillée avant l\'Acte III');

console.log('• Veto institutionnel');
await db.query(`UPDATE agora_proposals SET status = 'passed', closed_at = now() WHERE id = $1`, [prop.id]);
const vetoed = await one(`SELECT * FROM use_veto($1)`, [prop.id]);
check('veto de M. Lerme', vetoed.status === 'vetoed' && vetoed.vetoed_by === LERME);
check('jeton consommé', (await one(`SELECT veto_tokens FROM players WHERE id = $1`, [LERME])).veto_tokens === 0);

console.log('• La Taverne');
await setToken(elyToken);
const whisper = await one(`SELECT * FROM post_tavern_message('whisper', 'On s''arrange pour le vote ?', ARRAY[$1]::uuid[])`, [LERME]);
check('chuchotement privé', whisper.channel === 'whisper');
await expectError(db, `SELECT * FROM post_tavern_message('whisper', 'Seul', NULL)`, [], /destinataire/, 'chuchotement sans destinataire refusé');
await db.query(`UPDATE players SET is_detained_until = now() + interval '1 hour' WHERE id = $1`, [TIPH]);
await setToken(tiphToken);
await expectError(db, `SELECT * FROM post_tavern_message('village_square', 'Libérez-moi !')`, [], /cachot/, 'isolement au cachot : pas de prise de parole');
await db.query(`UPDATE players SET is_detained_until = NULL WHERE id = $1`, [TIPH]);

console.log('• Row Level Security (rôle anon)');
await setToken(null);
await db.exec(`SET ROLE anon`);
await expectError(db, `SELECT treasury_eur FROM village_state`, [], /permission denied/, 'village_state brut interdit');
await expectError(db, `SELECT pin_hash FROM player_pins`, [], /permission denied/, 'PIN illisibles');
check('vue publique du village lisible', (await one(`SELECT treasury_eur FROM village_public_state`)).treasury_eur !== undefined);
check('indicateurs cachés absents de la vue publique', (await one(`SELECT to_jsonb(v) ? 'drug_prevalence_pct' AS leak FROM village_public_state v`)).leak === false);
check('chuchotements invisibles sans session', (await one(`SELECT count(*)::int AS n FROM tavern_messages WHERE channel = 'whisper'`)).n === 0);
await db.exec(`RESET ROLE`);
await setToken(lermeToken);
await db.exec(`SET ROLE anon`);
check('le destinataire lit son chuchotement', (await one(`SELECT count(*)::int AS n FROM tavern_messages WHERE channel = 'whisper'`)).n === 1);
check('M. Lerme voit tous les patrimoines privés', (await one(`SELECT jsonb_array_length(get_private_ledger()->'wealth') AS n`)).n === 10);
await db.exec(`RESET ROLE`);
await setToken(elyToken);
check('Ely ne voit que son patrimoine', (await one(`SELECT jsonb_array_length(get_private_ledger()->'wealth') AS n`)).n === 1);

console.log('• Carlage & délégation');
const duel = await one(`INSERT INTO carlage_duels (player_a_id, player_b_id, context, round_deadline_at) VALUES ($1, $2, 'friendly', now() + interval '10 seconds') RETURNING id`, [ELY, LERME]);
const move = await one(`SELECT carlage_submit_move($1, 'pivot', 'TR') AS r`, [duel.id]);
check('coup secret enregistré', move.r.side === 'a' && move.r.both_submitted === false);
await expectError(db, `SELECT carlage_submit_move($1, 'pivot', 'BR')`, [duel.id], /adjacent/, 'pivot vers un carreau non adjacent refusé');
const deleg = await one(`SELECT set_delegation($1, now() + interval '3 days') AS r`, [TIPH]);
check('délégation de poste', deleg.r.delegated_to === TIPH);

console.log('• Sauvegardes & restauration');
const snap = (await one(`SELECT create_daily_snapshot('manual', 'Test J-0') AS id`)).id;
check('sauvegarde créée', typeof snap === 'string');
check('auto_midnight idempotent', (await one(`SELECT create_daily_snapshot('auto_midnight') = create_daily_snapshot('auto_midnight') AS same`)).same === true);
const revBefore = Number((await one(`SELECT revision FROM village_state`)).revision);
await db.query(`UPDATE village_state SET treasury_eur = 1, morale_pct = 3`);
await db.query(`UPDATE players SET private_wealth_eur = 0`);
await db.query(`INSERT INTO village_migrants (full_name, age, origin, religion, political_leaning, physical_strength, specialty_code, value_proposition) VALUES ('Intrus Postérieur', 30, 'Europe de l''Est', 'Orthodoxe', 'Centre', 60, 'welder', 'Soudeur')`);
check('restauration en 1 clic', (await one(`SELECT restore_daily_snapshot($1) AS ok`, [snap])).ok === true);
const restored = await one(`SELECT treasury_eur::float AS t, morale_pct::float AS m, revision FROM village_state`);
check('caisse et moral restaurés', restored.t === 50000 && restored.m === 75, JSON.stringify(restored));
check('révision incrémentée', Number(restored.revision) === revBefore + 1);
check('patrimoines restaurés', (await one(`SELECT min(private_wealth_eur)::float AS w FROM players`)).w === 2000);
check('migrant postérieur supprimé', (await one(`SELECT count(*)::int AS n FROM village_migrants`)).n === 0);
check('historique du chat conservé', (await one(`SELECT count(*)::int AS n FROM tavern_messages WHERE channel = 'whisper'`)).n === 1);
check('filet « avant restauration » créé', (await one(`SELECT count(*)::int AS n FROM daily_snapshots WHERE trigger_type = 'pre_restore'`)).n === 1);
const exported = (await one(`SELECT export_full_state() AS j`)).j;
check('export JSON complet', exported.format === 'les-gaulois-snapshot' && Array.isArray(exported.players) && !('player_pins' in exported));
await db.query(`UPDATE village_state SET treasury_eur = 7`);
const imported = (await one(`SELECT import_full_state($1::jsonb, 'Import test') AS id`, [JSON.stringify(exported)])).id;
check('import JSON manuel', typeof imported === 'string' && (await one(`SELECT treasury_eur::float AS t FROM village_state`)).t === 50000);

console.log('• engine_commit (écriture atomique du moteur)');
await setToken(null);
const rev0 = Number((await one(`SELECT revision FROM village_state`)).revision);
const villageId = (await one(`SELECT id FROM village_state`)).id;
await expectError(db, `SELECT engine_commit($1, '{}'::jsonb)`, [rev0 + 5], /revision_conflict/, 'révision périmée refusée');
const newProposalId = '30000000-0000-4000-8000-000000000001';
const changes = {
  village_state: { id: villageId, treasury_eur: 12345.67, morale_pct: 60.5, revision: 999 },
  players: [{ id: ELY, action_points: 1, addiction_level_pct: 7.25 }],
  agora_proposals: [{ id: newProposalId, week_number: 1, kind: 'migrant_admission', title: 'Admission test', detailed_explanation: 'Dossier généré par le moteur.', category: 'immigration', closes_at: '2026-12-06T10:00:00Z' }],
  role_hidden_indicators: [{ role_code: 'mayor_agri', payload: { popularite: 70 }, computed_at: '2026-11-27T00:05:00Z' }],
  gazette_editions: [{ edition_date: '2026-11-27', headline: 'Titre du jour', body_markdown: 'Corps', sections: [], generated_by: 'fallback' }],
  game_events: [{ event_type: 'test_event', visibility: 'private', player_id: ELY, title: 'Test', body: 'Corps', data: { a: 1 }, game_day: 3 }],
  ledger_entries: [{ account: 'treasury', amount_eur: -42.5, label: 'Achat test', category: 'test', supplier: 'BigMat', game_day: 3 }],
  tavern_messages: [{ channel: 'agora_hall', content: '📜 Message système du moteur' }],
  ai_calls: [{ call_kind: 'gazette', used_fallback: true, model: null, error: 'pas de clé' }],
};
const newRev = (await one(`SELECT engine_commit($1, $2::jsonb) AS r`, [rev0, JSON.stringify(changes)])).r;
check('révision incrémentée par le commit', Number(newRev) === rev0 + 1);
const vs = await one(`SELECT treasury_eur::float AS t, morale_pct::float AS m, revision FROM village_state`);
check('village mis à jour (révision forcée ignorée)', vs.t === 12345.67 && vs.m === 60.5 && Number(vs.revision) === rev0 + 1, JSON.stringify(vs));
const ely = await one(`SELECT action_points, addiction_level_pct::float AS a, display_name FROM players WHERE id = $1`, [ELY]);
check('joueur : colonnes présentes seules modifiées', ely.action_points === 1 && ely.a === 7.25 && ely.display_name === 'Ely');
check('motion du moteur insérée avec valeurs par défaut', (await one(`SELECT status, required_majority FROM agora_proposals WHERE id = $1`, [newProposalId])).status === 'open');
check('indicateurs cachés écrits', (await one(`SELECT payload->>'popularite' AS p FROM role_hidden_indicators WHERE role_code = 'mayor_agri'`)).p === '70');
check('Gazette insérée', (await one(`SELECT headline FROM gazette_editions WHERE edition_date = '2026-11-27'`)).headline === 'Titre du jour');
check('événement, écriture comptable, message et appel IA ajoutés',
  (await one(`SELECT (SELECT count(*) FROM game_events WHERE event_type = 'test_event')::int AS e, (SELECT count(*) FROM ledger_entries WHERE category = 'test')::int AS l, (SELECT count(*) FROM tavern_messages WHERE content LIKE '%moteur')::int AS t, (SELECT count(*) FROM ai_calls)::int AS a`)).e === 1);
const regen = (await one(`SELECT engine_commit($1, $2::jsonb) AS r`, [rev0 + 1, JSON.stringify({ gazette_editions: [{ edition_date: '2026-11-27', headline: 'Titre corrigé', body_markdown: 'Corps 2' }] })])).r;
check('Gazette régénérée le même jour (pas de doublon)', Number(regen) === rev0 + 2 && (await one(`SELECT count(*)::int AS n, max(headline) AS h FROM gazette_editions WHERE edition_date = '2026-11-27'`)).h === 'Titre corrigé');
check('session_player() résout un jeton', (await one(`SELECT session_player($1) AS p`, [elyToken])).p === ELY);

console.log('• Épreuve de la cible');
await setToken(elyToken);
const trial = await one(`INSERT INTO carlage_duels (player_a_id, player_b_id, context, mode, round_deadline_at) VALUES ($1, $2, 'friendly', 'target', now() + interval '1 day') RETURNING id`, [ELY, LERME]);
const taps = JSON.stringify([{ index: 0, x: 0.5, y: 0.5, reaction_ms: 300 }]);
const sub = (await one(`SELECT target_submit($1, $2::jsonb) AS r`, [trial.id, taps])).r;
check('dépôt des taps de la cible', sub.side === 'a' && sub.both_submitted === false);
await expectError(db, `SELECT target_submit($1, $2::jsonb)`, [trial.id, taps], /déjà joué/, 'une seule participation par joueur');
await expectError(db, `SELECT carlage_submit_move($1, 'push')`, [trial.id], /épreuve de la cible/, 'pas de coup de Carlage sur une épreuve de la cible');
await expectError(db, `SELECT target_submit($1, $2::jsonb)`, [trial.id, JSON.stringify(Array(6).fill({}))], /déjà joué|5 taps/, '6 taps refusés');
await setToken(tiphToken);
await expectError(db, `SELECT target_submit($1, $2::jsonb)`, [trial.id, taps], /ne participez pas/, 'un tiers ne peut pas jouer');
await setToken(lermeToken);
check('le second joueur complète l\'épreuve', (await one(`SELECT target_submit($1, $2::jsonb) AS r`, [trial.id, taps])).r.both_submitted === true);
await db.exec(`SET ROLE anon`);
await setToken(tiphToken);
check('résultats secrets tant que l\'épreuve est en cours', (await one(`SELECT count(*)::int AS n FROM target_trial_results`)).n === 0);
await setToken(elyToken);
check('chacun voit son propre résultat', (await one(`SELECT count(*)::int AS n FROM target_trial_results`)).n === 1);
await db.exec(`RESET ROLE`);
await setToken(null);

// supabase/cron.sql avec des doublures de Vault, pg_cron et pg_net (absents de PGlite) :
// syntaxe, refus des valeurs non remplacées, script rejouable sans doublon.
console.log('• Planification (supabase/cron.sql, extensions simulées)');
{
  await db.exec(`
    CREATE SCHEMA IF NOT EXISTS vault; CREATE SCHEMA IF NOT EXISTS cron; CREATE SCHEMA IF NOT EXISTS net;
    CREATE TABLE vault.secrets (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text UNIQUE, secret text);
    CREATE VIEW vault.decrypted_secrets AS SELECT id, name, secret AS decrypted_secret FROM vault.secrets;
    CREATE FUNCTION vault.create_secret(p_secret text, p_name text) RETURNS uuid LANGUAGE sql AS
      $f$ INSERT INTO vault.secrets(name, secret) VALUES (p_name, p_secret) RETURNING id $f$;
    CREATE FUNCTION vault.update_secret(p_id uuid, p_secret text) RETURNS void LANGUAGE sql AS
      $f$ UPDATE vault.secrets SET secret = p_secret WHERE id = p_id $f$;
    CREATE TABLE cron.job (jobid serial PRIMARY KEY, jobname text UNIQUE, schedule text, command text);
    CREATE FUNCTION cron.schedule(p_name text, p_schedule text, p_command text) RETURNS bigint LANGUAGE sql AS
      $f$ INSERT INTO cron.job(jobname, schedule, command) VALUES (p_name, p_schedule, p_command)
          ON CONFLICT (jobname) DO UPDATE SET schedule = EXCLUDED.schedule, command = EXCLUDED.command RETURNING jobid $f$;
    CREATE TABLE net.calls (id bigserial PRIMARY KEY, url text, headers jsonb, body jsonb);
    CREATE FUNCTION net.http_post(url text, headers jsonb, body jsonb, timeout_milliseconds int) RETURNS bigint LANGUAGE sql AS
      $f$ INSERT INTO net.calls(url, headers, body) VALUES (url, headers, body) RETURNING id $f$;
  `);
  const cronSql = readFileSync(join(root, 'supabase', 'cron.sql'), 'utf8').replace(/^CREATE EXTENSION .*$/gm, '');
  const fill = (secret) => cronSql.replaceAll('<PROJECT_REF>', 'abcdefghijklmnop').replaceAll('<CRON_SECRET>', secret);
  const execError = async (sql, pattern, label) => {
    try {
      await db.exec(sql);
      check(label, false, 'aucune erreur levée');
    } catch (err) {
      check(label, pattern.test(String(err.message)), String(err.message));
    }
  };
  await execError(cronSql, /Remplacez <PROJECT_REF>/, 'valeurs entre chevrons non remplacées → refus');
  await db.exec(fill('x'.repeat(48)));
  await db.exec(fill('y'.repeat(48)));
  const jobs = (await db.query(`SELECT jobname, schedule FROM cron.job ORDER BY jobname`)).rows;
  check('2 tâches planifiées, sans doublon au second passage', jobs.length === 2 && jobs[0].schedule === '*/15 * * * *' && jobs[1].schedule === '5 23 * * *', JSON.stringify(jobs));
  const secrets = (await db.query(`SELECT name, secret FROM vault.secrets ORDER BY name`)).rows;
  check('secrets Vault mis à jour (pas de doublon)', secrets.length === 2 && secrets.find((s) => s.name === 'gaulois_cron_secret')?.secret === 'y'.repeat(48));
  await db.query(`SELECT gaulois_call_world_sync('maintenance')`);
  const call = await one(`SELECT url, headers->>'x-cron-secret' AS secret, body->>'mode' AS mode FROM net.calls ORDER BY id DESC LIMIT 1`);
  check('appel de daily-world-sync avec le secret', call.url === 'https://abcdefghijklmnop.supabase.co/functions/v1/daily-world-sync' && call.secret === 'y'.repeat(48) && call.mode === 'maintenance', JSON.stringify(call));
  check('fonction d\'appel interdite à la clé anon', (await one(`SELECT has_function_privilege('anon', 'gaulois_call_world_sync(text)', 'EXECUTE') AS ok`)).ok === false);
  await execError(fill('court'), /trop court/, 'secret trop court refusé');
}

// Contrat entre l'interface (src/app/api/supabase.ts) et la base / les Edge Functions :
// chaque RPC, relation, colonne et opération appelée par le client doit exister, avec les droits de la clé anon.
console.log('• Contrat de l\'interface Supabase (src/app/api/supabase.ts)');
{
  const clientSrc = readFileSync(join(root, 'src', 'app', 'api', 'supabase.ts'), 'utf8');
  const rpcCalls = new Map();
  for (const m of clientSrc.matchAll(/this\.rpc(?:<[^>]*>)?\('([a-z_]+)'(?:,\s*\{([\s\S]*?)\})?\)/g)) {
    const args = [...(m[2] ?? '').matchAll(/\b(p_[a-z_]+)\s*:/g)].map((a) => a[1]);
    rpcCalls.set(m[1], [...new Set([...(rpcCalls.get(m[1]) ?? []), ...args])]);
  }
  check(`${rpcCalls.size} RPC appelées par le client`, rpcCalls.size >= 20, [...rpcCalls.keys()].join(', '));
  for (const [name, args] of rpcCalls) {
    const fn = await one(
      `SELECT p.proargnames AS names, p.pronargs AS n, p.pronargdefaults AS d, has_function_privilege('anon', p.oid, 'EXECUTE') AS anon
         FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
        WHERE ns.nspname = 'public' AND p.proname = $1`,
      [name],
    );
    if (!fn) {
      check(`RPC ${name}`, false, 'fonction introuvable');
      continue;
    }
    const names = (fn.names ?? []).slice(0, fn.n);
    const required = names.slice(0, fn.n - fn.d);
    const unknown = args.filter((a) => !names.includes(a));
    const missing = required.filter((a) => !args.includes(a));
    check(`RPC ${name}(${args.join(', ')})`, fn.anon && unknown.length === 0 && missing.length === 0,
      `${fn.anon ? '' : 'EXECUTE refusé à anon ; '}${unknown.length ? `paramètres inconnus : ${unknown} ; ` : ''}${missing.length ? `paramètres manquants : ${missing}` : ''}`);
  }

  const chunks = clientSrc.split(".from('").slice(1);
  for (const chunk of chunks) {
    const relation = chunk.slice(0, chunk.indexOf("'"));
    const end = Math.min(...[chunk.indexOf(';'), chunk.indexOf('.from('), chunk.indexOf('this.rpc')].filter((i) => i >= 0));
    const body = chunk.slice(0, end);
    const cols = new Set();
    const sel = /\.select\('([^']*)'\)/.exec(body)?.[1];
    if (sel && sel !== '*') sel.split(',').forEach((c) => cols.add(c.trim()));
    for (const m of body.matchAll(/\.(?:order|eq|neq|in|gte|gt|lte|lt)\('([a-z_]+)'/g)) cols.add(m[1]);
    for (const m of body.matchAll(/\.or\(`([^`]*)`\)/g)) for (const part of m[1].split(',')) cols.add(part.split('.')[0]);
    const rel = await one(`SELECT has_table_privilege('anon', to_regclass($1), 'SELECT') AS anon`, [`public.${relation}`]).catch(() => null);
    const known = (await db.query(`SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1`, [relation])).rows.map((r) => r.column_name);
    const absent = [...cols].filter((c) => !known.includes(c));
    check(`lecture ${relation}${cols.size ? ` (${[...cols].join(', ')})` : ''}`, rel?.anon === true && absent.length === 0,
      `${rel?.anon ? '' : 'SELECT refusé à anon ou relation absente ; '}${absent.length ? `colonnes inconnues : ${absent}` : ''}`);
  }

  const handlers = readFileSync(join(root, 'supabase', 'functions', '_shared', 'runtime', 'handlers.ts'), 'utf8');
  for (const m of clientSrc.matchAll(/this\.invoke\('([a-z-]+)', \{\s*(op|mode)(?:: '([a-z_]+)')?/g)) {
    const [, fn, key, op] = m;
    const dirOk = readdirSync(join(root, 'supabase', 'functions')).includes(fn);
    const opOk = key === 'mode' || handlers.includes(`case '${op}'`) || handlers.includes(`op === '${op}'`);
    check(`Edge Function ${fn}${op ? ` op ${op}` : ` (${key})`}`, dirOk && opOk, dirOk ? 'opération non gérée' : 'fonction absente');
  }

  const realtime = /const REALTIME_TABLES = \[([\s\S]*?)\]/.exec(clientSrc)[1].match(/'([a-z_]+)'/g).map((s) => s.slice(1, -1));
  const sqlAll = readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).map((f) => readFileSync(join(migrationsDir, f), 'utf8')).join('\n');
  const published = realtime.filter((t) => new RegExp(`supabase_realtime[\\s\\S]{0,400}'${t}'|ADD TABLE public\\.${t}\\b`).test(sqlAll));
  check(`tables Realtime publiées (${realtime.length})`, published.length === realtime.length, realtime.filter((t) => !published.includes(t)).join(', '));
}

console.log('• Calendrier SQL');
const session = await one(`SELECT next_agora_session('2026-11-23T08:00:00Z') AS t`);
check('prochaine Agora = dimanche 11:00 Madrid', new Date(session.t).toISOString() === '2026-11-29T10:00:00.000Z', String(session.t));

// Appels « non fiables » simulant PostgREST (session authenticator, rôle anon).
// PGlite ne sait pas revenir d'un SET SESSION AUTHORIZATION : cette section reste donc la dernière.
console.log('• Appels PostgREST non fiables (clé anon)');
await db.exec(`SET SESSION AUTHORIZATION authenticator; SET ROLE anon;`);
await setToken(tiphToken);
await expectError(db, `SELECT restore_daily_snapshot($1)`, [snap], /administrateur/, 'restauration refusée à un joueur non administrateur');
await expectError(db, `SELECT export_full_state()`, [], /administrateur/, 'export refusé à un joueur non administrateur');
await expectError(db, `SELECT engine_commit(0, '{}'::jsonb)`, [], /permission denied/, 'engine_commit interdit à la clé anon');
await expectError(db, `SELECT session_player('00000000-0000-4000-8000-000000000000')`, [], /permission denied/, 'session_player interdit à la clé anon');
await setToken(lermeToken);
check('l\'administrateur (M. Lerme) liste les sauvegardes', (await one(`SELECT count(*)::int AS n FROM list_daily_snapshots()`)).n >= 3);

await db.close();
console.log(failures === 0 ? '\nSQL OK ✔' : `\n${failures} échec(s) ✘`);
process.exit(failures === 0 ? 0 : 1);
