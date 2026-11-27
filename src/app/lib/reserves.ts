/**
 * Réserves du hameau expliquées (V4.6) : pour chaque stock, ce qui le remplit et le vide chaque
 * jour (mêmes formules que le moteur : potager, cheptel, rations par habitant, gasoil du groupe,
 * usure des outils), combien de jours il tient, ce qui le consomme ponctuellement et comment
 * s'en procurer (actions des métiers, catalogue des fournisseurs).
 * Pur (aucun DOM) : testé dans tests/app/priorities.test.ts.
 */
import {
  calendarSeasonOfKey,
  CATALOG,
  computeEnergyBalance,
  computeGardenHarvest,
  computeWaterBalance,
  constants as C,
  countPopulation,
  dailyFoodConsumption,
  dayKey,
  forestBan,
  heatingNeed,
  structureLevel,
  UPGRADABLE_KINDS,
  wornStructures,
  lifeOf,
  marketQuote,
  planBuildingsNight,
  pantryAmount,
  planSupplyNight,
  storageFactor,
  planResidentWork,
  purchaseCost,
  type CalendarSeason,
  type GameSnapshot,
  type VillageState,
} from '../engine.ts';
import type { ActionInput, GameData } from '../api/types.ts';
import { eur, num } from './format.ts';
import { actorsOf } from './priorities.ts';

export interface ReserveSource {
  label: string;
  detail: string;
  /** Action à lancer pour s'en procurer (null : se fait tout seul). */
  actionCode: string | null;
  preset?: Partial<ActionInput>;
  who: string;
  mine: boolean;
}

export interface ReserveLine {
  key: string;
  emoji: string;
  label: string;
  amount: number;
  /** Quantité affichée (avec unité). */
  display: string;
  /** Variation automatique par jour (production − consommation), null s'il n'y a pas de flux quotidien. */
  perDay: number | null;
  /** Rythme résumé pour la tuile (« −6,3 / jour », « 2 séances »…). */
  rate: string;
  /** Jours avant épuisement au rythme actuel (null : ne baisse pas tout seul). */
  daysLeft: number | null;
  low: boolean;
  /** Ce qui remplit et vide la réserve chaque jour. */
  daily: string[];
  /** Ce qui la consomme ponctuellement, et à quoi elle sert. */
  uses: string[];
  /** Comment s'en procurer. */
  sources: ReserveSource[];
}

const SEASON: Record<CalendarSeason, string> = { winter: 'hiver', spring: 'printemps', summer: 'été', autumn: 'automne' };

export type ReserveData = Pick<GameData, 'me' | 'village' | 'players' | 'migrants' | 'children' | 'structures' | 'constitution'>;

function snapshotOf(data: ReserveData): GameSnapshot {
  return {
    village: data.village,
    players: data.players,
    migrants: data.migrants,
    children: data.children,
    structures: data.structures,
    unions: [],
    approvals: [],
    temptations: [],
    constitution: data.constitution,
  } as unknown as GameSnapshot;
}

const round1 = (x: number) => Math.round(x * 10) / 10;
const signed = (x: number) => `${x > 0 ? '+' : x < 0 ? '−' : ''}${num(Math.abs(round1(x)))}`;

export function reserveReport(data: ReserveData, now: Date): ReserveLine[] {
  const v = data.village;
  const s = snapshotOf(data);
  const season = calendarSeasonOfKey(dayKey(now));
  const pop = countPopulation(s);
  const water = computeWaterBalance(s, season);
  const harvest = computeGardenHarvest(s, season, water.gardenSupplyRatio);
  const energy = computeEnergyBalance(s);
  const pen = data.structures.find((st) => st.code === 'cleda');
  const penReady = pen?.status === 'operational';
  // Travail des résidents (V4.9) : ce que leurs postes rapportent cette nuit
  const work = planResidentWork(s, season, now).totals;
  const ban = forestBan(v);
  const hasResidents = work.workers + work.idle + work.unassigned > 0;
  const assign = (post: string, label: string, detail: string): ReserveSource | null =>
    hasResidents ? act('assign_work_post', label, detail, { params: { post } }) : null;

  const act = (code: string, label: string, detail: string, preset?: Partial<ActionInput>): ReserveSource => ({ label, detail, actionCode: code, preset, ...actorsOf(code, data) });
  const buy = (id: string): ReserveSource | null => {
    const item = CATALOG.find((c) => c.id === id);
    if (!item) return null;
    const gains = Object.entries(item.effects)
      .map(([k, x]) => (k === 'food_rations' ? `+${x} rations` : k === 'wood_stock' ? `+${x} bois` : k === 'stone_stock' ? `+${x} pierres` : k === 'iron_stock' ? `+${x} fers` : k === 'tools_stock' ? `+${x} outils` : k === 'medicine_stock' ? `+${x} remèdes` : k === 'fuel_stock_l' ? `+${x} L` : null))
      .filter(Boolean)
      .join(', ');
    const cost = purchaseCost(item, 1, v as VillageState);
    return { label: `${item.supplier} : ${item.label}`, detail: `${eur(cost)} → ${gains}${item.customs_sensitive ? ' (passage en douane)' : ''}`, actionCode: 'buy_supplies', preset: { catalog_item_id: item.id }, ...actorsOf('buy_supplies', data) };
  };
  const sources = (...xs: (ReserveSource | null)[]) => xs.filter((x): x is ReserveSource => x !== null);
  /** Prix du jour au marché d'Organyà pour une unité. */
  const sale = (id: string) => {
    const q = marketQuote(v as VillageState, id, 1, now);
    return q ? `${eur(q.unitPrice, true)} le ${q.item.unit} aujourd'hui${q.saturday ? ' (jour de marché)' : ' (+30 % le samedi)'}, encore ${q.remaining} ${q.item.unit} cette semaine` : 'indisponible';
  };
  const lines: ReserveLine[] = [];
  const surcharge = v.track_condition_pct < C.TRACK_SURCHARGE_THRESHOLD ? ` Piste abîmée : livraisons +${C.TRACK_SURCHARGE_PCT} %.` : '';

  // --- Rations ---------------------------------------------------------------
  const consumption = dailyFoodConsumption(s);
  const herd = v.livestock_count * C.LIVESTOCK_RATIONS_PER_HEAD_DAY;
  const builds = planBuildingsNight(s, season);
  const foodNet = harvest.rations + herd + work.rations + builds.rations - consumption;
  const foodDays = foodNet < 0 ? Math.floor(v.food_rations / -foodNet) : null;
  lines.push({
    key: 'food', emoji: '🥖', label: 'Rations', amount: v.food_rations, display: num(Math.floor(v.food_rations)),
    perDay: round1(foodNet), rate: `${signed(foodNet)} / jour`, daysLeft: foodDays, low: foodDays !== null && foodDays < 5,
    daily: [
      `Consommation : ${pop.adults} ${pop.adults > 1 ? 'adultes' : 'adulte'} × ${C.RATIONS_ADULT_DAY}${pop.children > 0 ? ` + ${pop.children} enfant(s) × ${C.RATIONS_CHILD_DAY}` : ''} = −${num(round1(consumption))} par jour${v.rationing_active ? ` (rationnement : ×${C.RATIONING_FACTOR})` : ''}.`,
      `Potager : +${num(round1(harvest.rations))} par jour (${SEASON[season]}${water.gardenSupplyRatio < 1 ? `, arrosé à ${Math.round(water.gardenSupplyRatio * 100)} % faute d'eau` : ''}).`,
      `Cheptel : +${num(round1(herd))} par jour (${v.livestock_count} ${v.livestock_count > 1 ? 'bêtes' : 'bête'} × ${num(C.LIVESTOCK_RATIONS_PER_HEAD_DAY)}).`,
      ...(work.rations > 0 ? [`Résidents au potager et au pâturage : +${num(round1(work.rations))} par nuit.`] : []),
      ...(builds.rations > 0 ? [`Nouveaux bâtiments (four, serre, poulailler…) : +${num(round1(builds.rations))} par nuit.`] : []),
      foodDays !== null ? `Au rythme actuel, la réserve tient environ ${foodDays} ${foodDays > 1 ? 'jours' : 'jour'}. À zéro : faim, santé et moral en chute.` : 'La production couvre la consommation : la réserve ne baisse pas.',
    ],
    uses: [
      'Nourrir tous les habitants, chaque jour (voir ci-dessus).',
      `Vendre le surplus au marché d'Organyà : ${sale('rations')}.`,
      `Lancer de tomates sur les BOR : −${C.TOMATO_THROW_RATIONS} rations. Les sangliers en volent parfois quand le périmètre est mal gardé.`,
    ],
    sources: sources(
      act('fish_hunt', 'Pêche & chasse', 'Environ 6 (hiver) à 14 (automne) rations par séance.'),
      act('garden_tend', 'Entretenir le potager', 'Récolte immédiate de la saison.'),
      act('butcher_livestock', 'Boucherie du cheptel', '1 bête → 25 rations.'),
      act('make_preserves', 'Faire des conserves', `${C.PRESERVES_TOMATOES_KG} kg de tomates + ${C.PRESERVES_JARS_EUR} € de bocaux → ${C.PRESERVES_RATIONS} rations qui se gardent.`),
      buy('andorre_conserves'),
      assign('garden', 'Mettre un résident au potager', `Chaque nuit, environ ${num(round1(C.RESIDENT_GARDEN_RATIONS * C.SEASON_HARVEST_COEFF[season]))} ration(s) en ${SEASON[season]} (bien plus pour un maraîcher) ; un jardinier par ${C.RESIDENT_GARDEN_M2_PER_WORKER} m².`),
      act('expand_garden', 'Agrandir le potager', '+100 m² : plus de récolte chaque jour, pour toujours (150 €).'),
      act('plan_building', 'Bâtir un four, une serre, un poulailler…', 'Sur une parcelle libre de la carte : des rations chaque nuit, pour toujours.'),
    ),
  });

  // --- Tomates ---------------------------------------------------------------
  const tomatoShare = C.TOMATO_SHARE[season];
  lines.push({
    key: 'tomatoes', emoji: '🍅', label: 'Tomates', amount: v.tomatoes_stock, display: `${num(Math.floor(v.tomatoes_stock))} kg`,
    perDay: harvest.tomatoesKg + work.tomatoes > 0 ? round1(harvest.tomatoesKg + work.tomatoes) : null,
    rate: harvest.tomatoesKg + work.tomatoes > 0 ? `${signed(harvest.tomatoesKg + work.tomatoes)} kg / jour` : 'pas de récolte',
    daysLeft: null, low: v.tomatoes_stock < C.TOMATO_THROW_TOMATOES,
    daily: [
      tomatoShare > 0
        ? `Le potager en produit seul : +${num(round1(harvest.tomatoesKg))} kg par jour (${Math.round(tomatoShare * 100)} % de la récolte en ${SEASON[season]}).`
        : 'Aucune tomate en hiver : la réserve attend le printemps.',
      ...(work.tomatoes > 0 ? [`Résidents au potager : +${num(round1(work.tomatoes))} kg par nuit.`] : []),
      'Personne n\'en mange au quotidien : vendez-les ou mettez-les en conserve (l\'été, sans chambre froide, elles se gâtent).',
    ],
    uses: [
      `Vendre au marché d'Organyà : ${sale('tomatoes')}.`,
      `Faire des conserves : ${C.PRESERVES_TOMATOES_KG} kg → ${C.PRESERVES_RATIONS} rations pour l'hiver (${C.PRESERVES_JARS_EUR} € de bocaux).`,
      `Lancer de tomates sur les BOR : −${C.TOMATO_THROW_TOMATOES} kg et −${C.TOMATO_THROW_RATIONS} rations, moral +${C.TOMATO_THROW_MORALE} % (une fois par saison).`,
    ],
    sources: sources(act('garden_tend', 'Entretenir le potager', 'Récolte immédiate, tomates comprises (printemps à automne ; surtout l\'été).')),
  });

  // --- Bétail ----------------------------------------------------------------
  lines.push({
    key: 'livestock', emoji: '🐐', label: 'Bétail', amount: v.livestock_count, display: `${v.livestock_count} / ${C.LIVESTOCK_PEN_CAPACITY}`,
    perDay: null,
    rate: penReady && v.livestock_count >= 4 ? '+8 % / saison' : penReady ? 'trop peu pour naître' : 'enclos à bâtir',
    daysLeft: null, low: false,
    daily: [
      `Chaque bête donne ${C.LIVESTOCK_RATIONS_PER_HEAD_DAY} ration par jour et boit ${C.WATER_L_PER_LIVESTOCK} L d'eau.`,
      penReady
        ? v.livestock_count >= 4
          ? `Naissances : +8 % du cheptel (au moins 1 bête) à chaque fin de saison, jusqu'à ${C.LIVESTOCK_PEN_CAPACITY} places.`
          : 'Il faut au moins 4 bêtes pour qu\'elles se reproduisent.'
        : 'Pas d\'élevage possible tant que l\'enclos (Cleda) n\'est pas construit.',
      `À partir de ${C.LIVESTOCK_FERTILIZER_THRESHOLD} bêtes, le fumier ajoute ${Math.round(C.LIVESTOCK_FERTILIZER_BONUS * 100)} % à la récolte du potager.`,
    ],
    uses: ['Boucherie : 1 bête → 25 rations (en cas de disette).', `Faire du fromage (au moins ${C.CHEESE_MIN_LIVESTOCK} bêtes) : environ ${C.CHEESE_MAKE_KG} kg par séance, à vendre au marché.`],
    sources: sources(
      penReady ? null : act('build_livestock_pen', 'Construire l\'enclos (Cleda)', '350 € par séance de chantier, 8 bois.', pen ? { target_structure_id: pen.id } : undefined),
      act('buy_livestock', 'Acheter du bétail (foire de Lleida)', `${eur(C.LIVESTOCK_PRICE_EUR)} par tête, enclos requis.`),
    ),
  });

  // --- Bois, pierre, fer : uniquement les chantiers -------------------------
  const sessions = (stock: number, per: number, what = 'séance') => {
    const n = Math.floor(stock / per);
    return `${n} ${what}${n > 1 ? 's' : ''}`;
  };
  const heat = heatingNeed(s);
  const insulated = s.structures.filter((st) => st.status === 'operational' && UPGRADABLE_KINDS.includes(st.kind) && structureLevel(st) > 1).length;
  const worn = wornStructures(s);
  const cuts = lifeOf(v).wood_cuts ?? 0;
  const woodNet = round1(work.wood - heat.wood - builds.wood);
  const woodDays = woodNet < 0 ? Math.floor(v.wood_stock / -woodNet) : null;
  lines.push({
    key: 'wood', emoji: '🪵', label: 'Bois', amount: v.wood_stock, display: num(v.wood_stock),
    perDay: heat.wood > 0 || work.wood > 0 ? woodNet : null,
    rate: heat.wood > 0 || work.wood > 0 ? `${signed(woodNet)} / nuit${heat.wood > 0 ? ' (chauffage)' : ' (bûcherons)'}` : sessions(v.wood_stock, 5),
    daysLeft: woodDays,
    low: v.wood_stock < 5 || (woodDays !== null && woodDays < 5),
    daily: [
      heat.wood > 0
        ? `Chauffage : ${heat.buildings} ${heat.buildings > 1 ? 'bâtisses habitées' : 'bâtisse habitée'} × ${heat.perBuilding} = −${heat.wood} stères par nuit (minimale réelle ${Math.round(heat.tempMin)} °C${v.energy_tier >= 4 ? ', moitié moins grâce au palier 4' : ''}${insulated > 0 ? `, isolation de ${insulated} ${insulated > 1 ? 'bâtisses améliorées' : 'bâtisse améliorée'} comprise` : ''}). ${woodDays !== null ? `Au rythme actuel${work.wood > 0 ? ' (bûcherons compris)' : ''}, la réserve tient environ ${woodDays} nuit${woodDays === 1 ? '' : 's'}.` : 'Les bûcherons résidents couvrent le chauffage.'}`
        : `Pas de chauffage cette nuit (minimale réelle ${Math.round(heat.tempMin)} °C) : on chauffe sous 10 °C (1 stère par bâtisse habitée), sous 5 °C (2) et sous 0 °C (3).`,
      ...(builds.wood > 0 ? [`Four à pain : −${builds.wood} stère par nuit de cuisson.`] : []),
      `Sans bois une nuit de froid : moral −${C.HEATING_COLD_MORALE} % et santé −${C.HEATING_COLD_HEALTH} pour chaque fondateur.`,
      ...(work.wood > 0 ? [`Bûcherons résidents : +${num(round1(work.wood))} stères par nuit.`] : []),
      `Coupes cette semaine : ${num(cuts)} / ${C.WOOD_CUT_SUSTAINABLE} soutenables (au-delà, la forêt souffre et les agents rurals peuvent verbaliser ; une nuit de bûcheron résident compte pour ${num(C.RESIDENT_FOREST_CUT_SHARE)} coupe).`,
      ...(ban ? [`🚫 Ely a interdit les coupes jusqu'à lundi : « ${ban.reason} ». Les bûcherons résidents entretiennent la forêt.`] : []),
    ],
    uses: [
      'Chauffer les bâtisses habitées les nuits froides.',
      'Rénover une bâtisse : 5 par séance.',
      `Améliorer une bâtisse : ${C.UPGRADE_STEPS.map((u) => `${u.wood} (niveau ${u.level})`).join(', ')} ; une bâtisse améliorée brûle moins de bois.`,
      'Construire l\'enclos : 8.',
      'Poser un mirador ou une herse : 6.',
      `Vendre au marché d'Organyà : ${sale('wood')}.`,
    ],
    sources: sources(
      act('cut_wood', 'Couper du bois', ban ? "Interdit par Ely jusqu'à lundi." : `Environ ${C.WOOD_CUT_BASE} stères par séance, gratuit (forêt communale).`),
      assign('forest', 'Mettre un résident en forêt', `Environ ${C.RESIDENT_FOREST_WOOD} stères par nuit (plus pour un charpentier), gratuit.`),
      buy('kiloutou_tronconneuse'),
      buy('gedimat_charpente'),
      buy('bigmat_tuiles'),
    ),
  });
  lines.push({
    key: 'stone', emoji: '🪨', label: 'Pierre', amount: v.stone_stock, display: num(v.stone_stock),
    perDay: work.stone_used > 0 ? -work.stone_used : null,
    rate: work.stone_used > 0 ? `−${work.stone_used} / nuit (résidents)` : sessions(v.stone_stock, 5),
    daysLeft: work.stone_used > 0 ? Math.floor(v.stone_stock / work.stone_used) : null,
    low: v.stone_stock < 5,
    daily: [
      work.stone_used > 0
        ? `Résidents au chantier : −${work.stone_used} pierre${work.stone_used > 1 ? 's' : ''} par nuit (${C.RESIDENT_BUILD_STONE} par maçon). Sans pierre, ils s'arrêtent.`
        : 'Rien ne la consomme toute seule : elle part dans les chantiers et l\'entretien.',
      ...(worn.length > 0 ? [`À entretenir : ${worn.map((st) => `${st.name} (${st.condition_pct} %)`).join(', ')}. Sous ${C.WEAR_DAMAGED_AT} %, une bâtisse est endommagée.`] : []),
    ],
    uses: ['Rénover une bâtisse : 5 par séance.', `Entretenir une bâtisse : ${C.MAINTAIN_STONE} par séance.`, `Améliorer une bâtisse : ${C.UPGRADE_STEPS.map((u) => `${u.stone} (niveau ${u.level})`).join(', ')}.`, `Résident au chantier : ${C.RESIDENT_BUILD_STONE} par nuit.`, 'Empierrer la piste : 5.', 'Micro-barrage : 10 par séance.'],
    sources: sources(
      act('clear_rubble', 'Déblayer les gravats d\'une ruine', 'Environ 6 pierres, gratuit.'),
      act('demolish_building', 'Démolir une bâtisse', '+10 pierres (accord PLU).'),
      buy('bigmat_chaux'), buy('bigmat_parpaings'), buy('sograma_grave'),
    ),
  });
  lines.push({
    key: 'iron', emoji: '⛓️', label: 'Fer', amount: v.iron_stock, display: num(v.iron_stock),
    perDay: null, rate: sessions(v.iron_stock, C.IRON_PER_TOOL, 'fournée'), daysLeft: null, low: v.iron_stock < C.IRON_PER_TOOL,
    daily: [
      'Rien ne le consomme tout seul : il part à la forge, dans l\'entretien des bâtisses et les gros ouvrages.',
      ...(work.iron > 0 ? [`Résidents à la forge : +${work.iron} fer par nuit (ferraille recyclée).`] : []),
    ],
    uses: [`Forger des outils : ${C.IRON_PER_TOOL} par fournée.`, `Entretenir une bâtisse : ${C.MAINTAIN_IRON} par séance.`, `Améliorer une bâtisse : ${C.UPGRADE_STEPS.map((u) => `${u.iron} (niveau ${u.level})`).join(', ')}.`, 'Herses & équipements de garde : 5.', 'Micro-barrage : 5 par séance.'],
    sources: sources(act('recycle_scrap', 'Recycler la ferraille', '4 ferrailles → 2 fers (les outils cassés deviennent de la ferraille).'), buy('gedimat_quincaillerie')),
  });

  // --- Outils ----------------------------------------------------------------
  const wearPerDay = (pop.workers * C.TOOLS_WEAR_PER_WORKER_DAY) / 100;
  const daysPerTool = wearPerDay > 0 ? Math.round(1 / wearPerDay) : null;
  lines.push({
    key: 'tools', emoji: '🛠️', label: 'Outils', amount: v.tools_stock, display: `${v.tools_stock} / ${pop.workers}`,
    perDay: wearPerDay > 0 ? -Math.round(wearPerDay * 100) / 100 : null,
    rate: daysPerTool ? `−1 tous les ${daysPerTool} j` : 'pas d\'usure',
    daysLeft: daysPerTool ? Math.max(0, v.tools_stock - pop.workers + 1) * daysPerTool : null,
    low: v.tools_stock < pop.workers,
    daily: [
      `Il en faut un par travailleur (${pop.workers}) : en dessous, tout le village perd ${C.TOOLS_MALUS} % de rendement.`,
      daysPerTool ? `Usure : ${pop.workers} travailleurs × ${C.TOOLS_WEAR_PER_WORKER_DAY} % par jour → un outil cassé environ tous les ${daysPerTool} jours (plus vite quand l'alcool circule).` : 'Personne ne travaille : pas d\'usure.',
      'Quand l\'insécurité dépasse 30 %, des outils disparaissent.',
      ...(work.tools_wear > 0 ? [`Résidents à la forge : usure réparée de ${num(round1(work.tools_wear))} % par nuit.`] : []),
    ],
    uses: ['Chaque outil cassé devient de la ferraille (recyclable en fer).'],
    sources: sources(
      act('forge_tools', 'Forger des outils', `${C.IRON_PER_TOOL} fers par fournée, rendement selon la productivité.`),
      assign('forge', 'Mettre un résident à la forge', `Répare ${C.RESIDENT_FORGE_WEAR} % d'usure par nuit (plus pour un soudeur ou un mécanicien), puis recycle la ferraille.`),
      buy('bigmat_outillage'),
    ),
  });

  // --- Remèdes ---------------------------------------------------------------
  lines.push({
    key: 'medicine', emoji: '💊', label: 'Remèdes', amount: v.medicine_stock, display: num(v.medicine_stock),
    perDay: null, rate: `${v.medicine_stock} soin${v.medicine_stock > 1 ? 's' : ''}`, daysLeft: null, low: v.medicine_stock < 2,
    daily: ['Rien ne les consomme tout seul : ils servent aux soins.'],
    uses: ['Soigner une maladie infectieuse : 1.', 'Cure de sevrage : 1.', 'En cas d\'épidémie, il en faut vite plusieurs.'],
    sources: sources(act('brew_remedies', 'Préparer remèdes & décoctions', 'Environ +3 par séance (selon la productivité).'), buy('gedimat_pharmacie')),
  });

  // --- Gasoil ----------------------------------------------------------------
  const litres = v.energy_tier === 2 ? Math.ceil(energy.consumptionKwh * (C.ENERGY_TIERS[2]?.fuelLitresPerKwh ?? 0)) : 0;
  const fuelDays = litres > 0 ? Math.floor(v.fuel_stock_l / litres) : null;
  lines.push({
    key: 'fuel', emoji: '⛽', label: 'Gasoil', amount: v.fuel_stock_l, display: `${num(Math.floor(v.fuel_stock_l))} L`,
    perDay: litres > 0 ? -litres : null,
    rate: litres > 0 ? `−${litres} L / jour` : v.energy_tier === 1 ? 'pas encore utile' : 'plus utile',
    daysLeft: fuelDays, low: fuelDays !== null && fuelDays < 5,
    daily: [
      v.energy_tier === 1
        ? 'Pas encore utile : le groupe électrogène n\'est pas installé (il arrive avec 100 L).'
        : v.energy_tier === 2
          ? `Le groupe électrogène brûle ${C.ENERGY_TIERS[2]?.fuelLitresPerKwh} L par kWh : ${num(round1(energy.consumptionKwh))} kWh par jour → ${litres} L par jour, soit environ ${fuelDays} jour(s) de réserve. À sec : retour aux bougies et moral en baisse.`
          : 'Plus nécessaire : le hameau est passé au réseau électrique.',
    ],
    uses: ['Uniquement le groupe électrogène (palier 2).'],
    sources: sources(buy('andorre_gasoil')),
  });

  if (surcharge) for (const l of lines) if (l.sources.some((x) => x.actionCode === 'buy_supplies')) l.uses.push(surcharge.trim());
  // --- Filières (V5.6) : fromage, prunes, ratafia ---------------------------
  const supply = planSupplyNight(s, season);
  const lotsToSell = (n: number) => (n >= 2 ? (Math.floor(n / 2) > 1 ? Math.floor(n / 2) + ' lots à vendre' : '1 lot à vendre') : 'à fabriquer');
  const cheese = pantryAmount(v, 'cheese_kg');
  lines.push({
    key: 'cheese', emoji: '🧀', label: 'Fromage', amount: cheese, display: `${num(round1(cheese))} kg`,
    perDay: supply.cheese > 0 ? supply.cheese : null,
    rate: supply.cheese > 0 ? `${signed(supply.cheese)} kg / nuit` : lotsToSell(cheese),
    daysLeft: null, low: false,
    daily: [
      supply.cheese > 0
        ? `La fromagerie affine +${num(supply.cheese)} kg par nuit.`
        : `Rien ne se fait tout seul sans fromagerie (et au moins ${C.CHEESE_MIN_LIVESTOCK} bêtes).`,
      'Le fromage se garde : il ne se gâte pas l’été.',
    ],
    uses: [`Vendre au marché d'Organyà : ${sale('cheese')}.`],
    sources: sources(
      act('make_cheese', 'Faire du fromage', `${C.CHEESE_MAKE_RATIONS} rations de lait → environ ${C.CHEESE_MAKE_KG} kg (au moins ${C.CHEESE_MIN_LIVESTOCK} bêtes ; +${C.CHEESE_MAKE_DAIRY_BONUS} kg avec la fromagerie).`),
      act('plan_building', 'Bâtir une fromagerie', `Du fromage chaque nuit (${C.CHEESE_DAIRY_KG} kg avec au moins ${C.CHEESE_MIN_LIVESTOCK} bêtes).`),
    ),
  });
  const plums = pantryAmount(v, 'plums_kg');
  lines.push({
    key: 'plums', emoji: '🫐', label: 'Prunes', amount: plums, display: `${num(Math.floor(plums))} kg`,
    perDay: supply.plums > 0 ? supply.plums : null,
    rate: supply.plums > 0 ? `${signed(supply.plums)} kg / nuit` : 'hors saison',
    daysLeft: null, low: false,
    daily: [
      supply.plums > 0 ? `Le verger en donne +${supply.plums} kg par nuit en ${SEASON[season]}.` : 'Le verger ne donne des prunes que l’été et l’automne.',
      'Fruits frais : l’été, sans chambre froide, ils se gâtent vite.',
    ],
    uses: [`Distiller du ratafia : ${C.RATAFIA_PLUMS_KG} kg → ${C.RATAFIA_BOTTLES} bouteilles (${C.RATAFIA_COST_EUR} € d'eau-de-vie et de droits).`],
    sources: [{ label: 'Verger du hameau', detail: `Cueillette toute seule, chaque nuit d’été (+${C.PLUMS_PER_NIGHT.summer} kg) et d’automne (+${C.PLUMS_PER_NIGHT.autumn} kg).`, actionCode: null, who: 'personne : se fait tout seul', mine: false }],
  });
  const ratafia = pantryAmount(v, 'ratafia_bottles');
  lines.push({
    key: 'ratafia', emoji: '🍶', label: 'Ratafia', amount: ratafia, display: num(Math.floor(ratafia)),
    perDay: null, rate: lotsToSell(ratafia), daysLeft: null, low: false,
    daily: ['Ratafia légal, droits d’accise payés : il se garde sans fin.'],
    uses: [`Vendre au marché d'Organyà : ${sale('ratafia')}.`],
    sources: sources(act('make_ratafia', 'Distiller du ratafia', `${C.RATAFIA_PLUMS_KG} kg de prunes + ${C.RATAFIA_COST_EUR} € → ${C.RATAFIA_BOTTLES} bouteilles.`)),
  });

  // --- Stockage & péremption (V5.6) -------------------------------------------
  const STORE: Record<string, C.StorageKey> = { food: 'food_rations', tomatoes: 'tomatoes_stock', wood: 'wood_stock', stone: 'stone_stock', iron: 'iron_stock', cheese: 'cheese_kg', plums: 'plums_kg', ratafia: 'ratafia_bottles' };
  const shed = storageFactor(s);
  for (const line of lines) {
    const key = STORE[line.key];
    if (!key) continue;
    const cap = supply.caps[key];
    const full = line.amount >= cap * 0.9;
    line.daily.push(`Capacité : ${num(Math.floor(line.amount))} / ${num(cap)}${shed > 1 ? ` (hangar ×${num(shed)})` : ''}. Au-delà, le surplus se perd la nuit${shed > 1 ? '' : ' — un hangar la relève'}.`);
    const spoil = supply.spoiled[key];
    if (spoil) line.daily.push(`Chaleur sans chambre froide : −${num(spoil)} se gâtent cette nuit.`);
    if (full) line.low = true;
  }
  return lines;
}
