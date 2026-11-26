/**
 * Le mode démo doit démarrer exactement comme une base fraîchement installée :
 * mêmes joueurs, mêmes ouvrages de la carte, mêmes valeurs par défaut du village que supabase/seed.sql
 * et la migration du schéma.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { demoPlayers, demoStructures, demoVillage } from '../../src/app/demo/seed.ts';

const root = new URL('../../', import.meta.url);
const seedSql = readFileSync(new URL('supabase/seed.sql', root), 'utf8');
const schemaSql = readFileSync(new URL('supabase/migrations/20261126000100_v38_schema.sql', root), 'utf8');

const unquote = (s: string) => s.replace(/''/g, "'");

describe('seed du mode démo', () => {
  it('reprend les 10 places de supabase/seed.sql', () => {
    const rows = [...seedSql.matchAll(/\('(10000000-0000-4000-8000-\d{12})', (\d+), '((?:[^']|'')*)', '((?:[^']|'')*)', '([a-z_]+)'/g)].map((m) => ({
      id: m[1],
      slot: Number(m[2]),
      display: unquote(m[3]!),
      character: unquote(m[4]!),
      role: m[5],
    }));
    expect(rows).toHaveLength(10);
    const demo = demoPlayers().map((p) => ({ id: p.id, slot: p.slot_number, display: p.display_name, character: p.character_name, role: p.role_code }));
    expect(demo).toEqual(rows);
    expect(demoPlayers().filter((p) => p.is_admin).map((p) => p.display_name)).toEqual(['Guillem']);
    expect(demoPlayers().filter((p) => p.is_active_slot)).toHaveLength(7);
  });

  it('reprend les ouvrages de la carte (codes, statuts, coordonnées)', () => {
    const block = seedSql.slice(seedSql.indexOf('INSERT INTO map_structures'), seedSql.indexOf('INSERT INTO ledger_entries'));
    const rows = [
      ...block.matchAll(/\('([a-z_0-9]+)', '([a-z_]+)', '((?:[^']|'')*)', '([a-z_]+)', (\d+), (\d+), (\d+), (TRUE|FALSE), (TRUE|FALSE), (\d+), (\d+), (\d+), (\d+)/g),
    ].map((m) => ({
      code: m[1],
      kind: m[2],
      name: unquote(m[3]!),
      status: m[4],
      condition: Number(m[5]),
      progress: Number(m[6]),
      beds: Number(m[7]),
      power: m[8] === 'TRUE',
      plu: m[9] === 'TRUE',
      box: [Number(m[10]), Number(m[11]), Number(m[12]), Number(m[13])],
    }));
    expect(rows.length).toBeGreaterThan(25);
    const demo = demoStructures().map((s) => ({
      code: s.code,
      kind: s.kind,
      name: s.name,
      status: s.status,
      condition: s.condition_pct,
      progress: s.progress_pct,
      beds: s.beds_capacity,
      power: s.is_power_connected,
      plu: s.plu_approved,
      box: [s.x, s.y, s.width, s.height],
    }));
    expect(demo).toEqual(rows);
  });

  it('utilise les valeurs par défaut de village_state', () => {
    const block = schemaSql.slice(schemaSql.indexOf('CREATE TABLE village_state'), schemaSql.indexOf('\n);', schemaSql.indexOf('CREATE TABLE village_state')));
    const village = demoVillage('2026-11-23T08:00:00.000Z') as unknown as Record<string, unknown>;
    let compared = 0;
    for (const m of block.matchAll(/^\s+([a-z_0-9]+)\s+(?:NUMERIC|INT|BOOLEAN|BIGINT)[^\n]*?DEFAULT\s+(-?[0-9.]+|TRUE|FALSE)\b/gm)) {
      const [, column, raw] = m;
      if (column === 'singleton' || !(column! in village)) continue;
      const expected = raw === 'TRUE' ? true : raw === 'FALSE' ? false : Number(raw);
      expect([column, village[column!]]).toEqual([column, expected]);
      compared += 1;
    }
    expect(compared).toBeGreaterThan(60);
  });
});
