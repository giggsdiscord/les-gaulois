/**
 * Aller-retour réel moteur ↔ base : setup_complete.sql dans PGlite, état relu en JSON (comme PostgREST),
 * action jouée par GameSession, puis écriture par engine_commit. Garde-fou contre un écart entre
 * la charge produite par le moteur (buildCommitPayload) et ce qu'accepte la RPC SQL.
 */
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { createGm } from '../../supabase/functions/_shared/core/gm/runner.ts';
import { GameSession } from '../../supabase/functions/_shared/core/session.ts';
import type { GameState } from '../../supabase/functions/_shared/core/types.ts';

const root = join(import.meta.dirname, '..', '..');
const GUILLEM = '10000000-0000-4000-8000-000000000002';
const TIPHAINE = '10000000-0000-4000-8000-000000000003';
let db: PGlite;

async function rows<T>(sql: string): Promise<T[]> {
  const res = await db.query<{ j: T }>(`SELECT row_to_json(t) AS j FROM (${sql}) t`);
  return res.rows.map((r) => r.j);
}

async function loadState(): Promise<GameState> {
  const [village] = await rows<GameState['snapshot']['village']>('SELECT * FROM village_state LIMIT 1');
  return {
    snapshot: {
      village,
      players: await rows('SELECT * FROM players ORDER BY slot_number'),
      migrants: await rows(`SELECT * FROM village_migrants WHERE status IN ('candidate','accepted','forced_labor')`),
      children: await rows(`SELECT * FROM village_children WHERE status <> 'departed'`),
      structures: await rows('SELECT * FROM map_structures'),
      unions: await rows('SELECT * FROM unions WHERE is_active'),
      approvals: await rows(`SELECT * FROM pending_approvals WHERE status IN ('pending','approved')`),
      temptations: await rows(`SELECT * FROM temptations WHERE choice = 'pending'`),
      constitution: await rows('SELECT * FROM constitution_articles ORDER BY article_number'),
    },
    proposals: await rows(`SELECT * FROM agora_proposals WHERE status = 'open'`),
    duels: [],
    moves: [],
    targetResults: [],
    chat: [],
    recentEvents: [],
  };
}

async function play(actionCode: string, playerId: string, now: Date, params?: Record<string, unknown>, structureCode?: string, migrantId?: string) {
  const state = await loadState();
  const session = new GameSession(state, { now, gm: createGm(null, { seed: 'roundtrip' }) });
  session.tick();
  await session.maintainAgora();
  const target = structureCode ? state.snapshot.structures.find((st) => st.code === structureCode)?.id : undefined;
  const result = await session.action(playerId, { action_code: actionCode, ...(params ? { params } : {}), ...(target ? { target_structure_id: target } : {}), ...(migrantId ? { target_migrant_id: migrantId } : {}) });
  const payload = session.commitPayload();
  const revision = (await db.query<{ r: number }>('SELECT engine_commit($1, $2::jsonb) AS r', [state.snapshot.village.revision, JSON.stringify(payload)])).rows[0].r;
  return { result, revision: Number(revision), before: state.snapshot.village.revision };
}

describe('engine_commit accepte ce que produit le moteur (base réelle)', () => {
  beforeAll(async () => {
    db = new PGlite({ extensions: { pgcrypto } });
    await db.exec(`CREATE SCHEMA IF NOT EXISTS extensions;
      CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN; CREATE ROLE authenticator NOLOGIN;
      GRANT USAGE ON SCHEMA public, extensions TO anon, authenticated, service_role;
      GRANT anon, authenticated, service_role TO authenticator;`);
    await db.exec(readFileSync(join(root, 'supabase', 'setup_complete.sql'), 'utf8'));
  }, 60_000);

  it('cours d\'espagnol / catalan : écrit et relu', async () => {
    const before = await loadState();
    const out = await play('spanish_lesson', GUILLEM, new Date(Date.now() + 60_000));
    expect(out.result.ok).toBe(true);
    expect(out.revision).toBe(out.before + 1);
    const after = await loadState();
    expect(Number(after.snapshot.village.spanish_fluency_pct)).toBeCloseTo(Number(before.snapshot.village.spanish_fluency_pct) + 2, 1);
    const guillem = after.snapshot.players.find((p) => p.id === GUILLEM)!;
    expect(guillem.action_points).toBe(before.snapshot.players.find((p) => p.id === GUILLEM)!.action_points - 1);
  });

  it('nouveau bâtiment (V5.4) : la ligne map_structures est insérée avec variante et coordonnées', async () => {
    const out = await play('plan_building', TIPHAINE, new Date(Date.now() + 120_000), { variant: 'henhouse', parcel: 'era_baixa' });
    expect(out.result.ok, out.result.error ?? '').toBe(true);
    const [row] = await rows<{ kind: string; variant: string; status: string; x: string; y: string; width: string; upgrade_level: number }>(
      `SELECT kind, variant, status, x, y, width, upgrade_level FROM map_structures WHERE code = 'nb_henhouse'`,
    );
    expect(row).toMatchObject({ kind: 'building', variant: 'henhouse', status: 'planned', upgrade_level: 1 });
    expect(Number(row!.x)).toBe(135);
    expect(Number(row!.width)).toBe(48);
    const [v] = await rows<{ life: { parcels?: Record<string, string> } }>('SELECT life FROM village_state LIMIT 1');
    expect(Object.keys(v!.life.parcels ?? {})).toEqual(['era_baixa']);
  });

  it('entretien puis amélioration (V5.5) : état, niveau et lits écrits', async () => {
    const m = await play('maintain_building', TIPHAINE, new Date(Date.now() + 180_000), undefined, 'casa_gran');
    expect(m.result.ok, m.result.error ?? '').toBe(true);
    const u = await play('upgrade_building', GUILLEM, new Date(Date.now() + 240_000), undefined, 'casa_gran');
    expect(u.result.ok, u.result.error ?? '').toBe(true);
    const [row] = await rows<{ condition_pct: number; upgrade_level: number; beds_capacity: number }>(
      `SELECT condition_pct, upgrade_level, beds_capacity FROM map_structures WHERE code = 'casa_gran'`,
    );
    expect(row).toMatchObject({ upgrade_level: 2, beds_capacity: 8 });
    expect(row!.condition_pct).toBeGreaterThanOrEqual(60);
  });

  it('encourager un résident (V5.7) : humeur écrite dans traits', async () => {
    const { rows: [m] } = await db.query<{ id: string }>(
      `INSERT INTO village_migrants (full_name, age, origin, religion, political_leaning, physical_strength, specialty_code, value_proposition, status, traits)
       VALUES ('Aina Puig', 30, 'Lleida', 'Athée/Laïque', 'Centre', 50, 'farmer', 'Potagère', 'accepted', '{"temper":"joker","mood":20}'::jsonb) RETURNING id`,
    );
    const out = await play('cheer_resident', GUILLEM, new Date(Date.now() + 300_000), undefined, undefined, m!.id);
    expect(out.result.ok, out.result.error ?? '').toBe(true);
    const [row] = await rows<{ traits: { temper: string; mood: number; cheered_day: string } }>(`SELECT traits FROM village_migrants WHERE id = '${m!.id}'`);
    expect(row!.traits).toMatchObject({ temper: 'joker', mood: 35 });
    expect(row!.traits.cheered_day).toHaveLength(10);
  });
});
