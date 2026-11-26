// FICHIER GÉNÉRÉ par scripts/sync-engine.mjs — ne pas modifier. Source : src/engine/justice.ts
/**
 * Tribunal Public de l'Agora [GDD §4.5] : travaux forcés & pilori, bannissement, exécution
 * sur la place publique (majorité des deux tiers).
 */
import { addDays } from './calendar.ts';
import { pushEvent } from './effects.ts';
import { clamp, gauge } from './math.ts';
import { findMigrant, findPlayer, holdsPortfolio } from './population.ts';
import type { Rng } from './rng.ts';
import type { EngineEffects, GameSnapshot } from './types.ts';

export type Sentence = 'forced_labor' | 'expulsion' | 'execution';

export interface SentenceInput {
  sentence: Sentence;
  targetMigrantId?: string | null;
  targetPlayerId?: string | null;
  days?: number;
}

export interface SentenceResult {
  ok: boolean;
  error: string | null;
  summary: string;
}

export function applySentence(s: GameSnapshot, fx: EngineEffects, rng: Rng, now: Date, input: SentenceInput): SentenceResult {
  const v = s.village;
  const migrant = findMigrant(s, input.targetMigrantId);
  const player = findPlayer(s, input.targetPlayerId);
  if (!migrant && !player) return { ok: false, error: 'Accusé introuvable.', summary: '' };
  const name = migrant?.full_name ?? player!.display_name;
  const leftScore = migrant?.left_wing_score ?? 25;

  switch (input.sentence) {
    case 'forced_labor': {
      const days = clamp(Math.round(input.days ?? 3), 3, 7);
      const until = addDays(now, days).toISOString();
      // Risque d'évasion ou de mutinerie : 15 %
      if (rng.chance(15)) {
        v.insecurity_offset = Math.round((v.insecurity_offset + 10) * 100) / 100;
        pushEvent(fx, s, { event_type: 'mutiny', title: 'Évasion du pilori', body: `${name} a faussé compagnie à la garde armée.` });
        if (migrant) migrant.faction_type = 'union_agitator';
        return { ok: true, error: null, summary: `${name} s'est évadé(e) avant d'effectuer sa peine.` };
      }
      if (migrant) {
        migrant.status = 'forced_labor';
        migrant.forced_labor_until = until;
      } else if (player) {
        player.status = 'forced_labor';
        player.forced_labor_until = until;
      }
      pushEvent(fx, s, {
        event_type: 'sentence_forced_labor',
        title: 'Travaux forcés',
        body: `${name} est condamné(e) à ${days} jours d'empierrement de la piste sous bonne garde.`,
      });
      return { ok: true, error: null, summary: `${days} jours de travaux forcés pour ${name}.` };
    }

    case 'expulsion': {
      const insecurityDrop = rng.int(10, 25);
      const leftDrop = Math.round(5 + (7 * clamp(leftScore, 0, 100)) / 100);
      if (migrant) {
        migrant.status = 'expelled';
        migrant.private_employer_id = null;
        migrant.private_wage_eur_week = 0;
        for (const c of s.children) if (c.parent_migrant_id === migrant.id && c.status !== 'departed') c.status = 'departed';
      } else if (player) {
        player.status = 'banished';
        player.action_points = 0;
        player.ministerial_portfolios = [];
        player.veto_tokens = 0;
      }
      v.insecurity_offset = Math.round((v.insecurity_offset - insecurityDrop) * 100) / 100;
      v.left_wing_ideology_pct = gauge(v.left_wing_ideology_pct - leftDrop);
      let reprisal = '';
      if (rng.chance(25)) {
        if (rng.chance(50)) {
          const stolen = Math.min(v.tools_stock, rng.int(2, 4));
          v.tools_stock -= stolen;
          reprisal = ` En partant, il/elle emporte ${stolen} outils.`;
        } else {
          v.admin_pressure_pct = gauge(v.admin_pressure_pct + 15);
          reprisal = ' Une dénonciation parvient aux Mossos d\'Esquadra.';
        }
      }
      pushEvent(fx, s, {
        event_type: 'sentence_expulsion',
        title: 'Bannissement',
        body: `${name} est reconduit(e) jusqu'à la route de Lleida.${reprisal}`,
      });
      return { ok: true, error: null, summary: `${name} est banni(e) du hameau.${reprisal}` };
    }

    case 'execution': {
      if (migrant) {
        migrant.status = 'executed';
        migrant.private_employer_id = null;
        for (const c of s.children) if (c.parent_migrant_id === migrant.id && c.status !== 'departed') c.status = 'departed';
      } else if (player) {
        player.status = 'executed';
        player.action_points = 0;
        player.ministerial_portfolios = [];
        player.veto_tokens = 0;
      }
      v.insecurity_offset = Math.round((v.insecurity_offset - 35) * 100) / 100;
      v.left_wing_ideology_pct = gauge(v.left_wing_ideology_pct - 20);
      v.morale_pct = gauge(v.morale_pct - 18);
      v.penance_required = true;
      let diplomatic = '';
      if (v.act_number < 3) {
        v.admin_pressure_pct = gauge(v.admin_pressure_pct + 45);
        diplomatic = ' Les Mossos d\'Esquadra et la Guardia Civil ouvrent une enquête criminelle.';
      } else if (holdsPortfolio(s, 'media') || holdsPortfolio(s, 'chancery')) {
        v.international_notoriety_pct = gauge(v.international_notoriety_pct - 10);
        v.eu_sympathy_pct = gauge(v.eu_sympathy_pct - 10);
        diplomatic = ' La Chancellerie et les Médias contiennent la crise diplomatique.';
      } else {
        v.international_notoriety_pct = gauge(v.international_notoriety_pct - 25);
        v.eu_sympathy_pct = gauge(v.eu_sympathy_pct - 30);
        diplomatic = ' Crise diplomatique internationale.';
      }
      pushEvent(fx, s, {
        event_type: 'sentence_execution',
        title: 'Exécution sur la place publique',
        body: `Sentence capitale exécutée contre ${name}. Choc moral collectif : une Messe de pénitence s'impose.${diplomatic}`,
      });
      return { ok: true, error: null, summary: `${name} a été exécuté(e).${diplomatic}` };
    }
  }
}
