/** Écran 3 — L'Agora, Bureau de l'Immigration, Tribunal Public, Constitution & duels. */
import { useMemo, useState } from 'react';
import { nextAgoraSession, type ActionDef } from '../engine.ts';
import type { MotionKind, Proposal } from '../api/types.ts';
import { ActionSheet } from '../components/ActionSheet.tsx';
import { ProposalCard } from '../components/ProposalCard.tsx';
import { Badge, Button, Card, Empty, Field, Gauge, Input, SectionTitle, Select, Tabs, TextArea } from '../components/ui.tsx';
import { availableActions, canFight, nextAgoraWeek, playerName, population } from '../lib/game.ts';
import { countdown, dateTime } from '../lib/format.ts';
import { CATEGORY_LABEL, DUEL_CONTEXT, DUEL_MODE, MIGRANT_STATUS, PORTFOLIO_LABEL, SENTENCE_LABEL, SPECIALTY_LABEL } from '../lib/labels.ts';
import { navigate, useRoute } from '../lib/router.ts';
import { useData, useGame, useNow } from '../state/GameContext.tsx';

type Tab = 'initiatives' | 'immigration' | 'tribunal' | 'constitution' | 'duels';

function sortProposals(list: Proposal[]): Proposal[] {
  const rank = (p: Proposal) => (p.status === 'open' ? 0 : p.status === 'passed' && !p.executed_at ? 1 : p.status === 'vetoed' ? 2 : 3);
  return [...list].sort((a, b) => rank(a) - rank(b) || (b.created_at ?? '').localeCompare(a.created_at ?? ''));
}

function InitiativeForm() {
  const data = useData();
  const { api, perform } = useGame();
  const now = useNow(60_000);
  const week = nextAgoraWeek(data.village, now);
  const done = data.proposals.some((p) => p.kind === 'initiative' && p.proposer_id === data.me.id && p.week_number === week);
  const [title, setTitle] = useState('');
  const [text, setText] = useState('');
  const [category, setCategory] = useState('economy');
  if (done) return <Card tone="moss">Votre initiative de la semaine est déposée. Rendez-vous dimanche à l'Agora.</Card>;
  return (
    <Card title="Mon initiative de la semaine" subtitle="Une idée ou mesure par semaine, avec un détail explicatif complet (objectifs, financement, modalités).">
      <div className="space-y-3">
        <Field label="Titre">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex. : Création d'un fonds souverain à la norvégienne" maxLength={160} />
        </Field>
        <Field label="Catégorie">
          <Select value={category} onChange={(e) => setCategory(e.target.value)}>
            {Object.entries(CATEGORY_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Détail explicatif" hint={`${text.trim().length}/80 caractères minimum`}>
          <TextArea value={text} onChange={(e) => setText(e.target.value)} className="min-h-36" placeholder="Objectif, financement, modalités, durée, qui s'en charge…" />
        </Field>
        <Button
          className="w-full"
          disabled={title.trim().length < 5 || text.trim().length < 80}
          onClick={() =>
            void perform(() => api.submitProposal(title, text, category), 'Initiative déposée à l\'Agora.').then(() => {
              setTitle('');
              setText('');
            })
          }
        >
          Déposer mon initiative
        </Button>
      </div>
    </Card>
  );
}

function MotionForm() {
  const data = useData();
  const { api, perform } = useGame();
  const act = data.village.act_number;
  const [kind, setKind] = useState<MotionKind>('prohibition');
  const [target, setTarget] = useState('alcohol');
  const [active, setActive] = useState(true);
  const [portfolio, setPortfolio] = useState('defense');
  const [player, setPlayer] = useState('');
  const [why, setWhy] = useState('');
  const kinds: { id: MotionKind; label: string; minAct: number }[] = [
    { id: 'prohibition', label: 'Prohibition (alcool, stupéfiants, tomates)', minAct: 1 },
    { id: 'rationing', label: 'Rationnement', minAct: 1 },
    { id: 'collectivization', label: 'Collectivisation des patrimoines', minAct: 1 },
    { id: 'decollectivization', label: 'Retour de la propriété privée', minAct: 1 },
    { id: 'ministry_election', label: 'Élection à un portefeuille', minAct: 2 },
    { id: 'independence', label: "Proclamation d'indépendance", minAct: 3 },
  ];
  const titles: Record<string, string> = {
    prohibition: `${active ? 'Prohibition' : 'Fin de la prohibition'} : ${target === 'alcohol' ? 'alcool' : target === 'drugs' ? 'stupéfiants' : 'tomates'}`,
    rationing: active ? 'Instaurer le rationnement' : 'Lever le rationnement',
    collectivization: 'Réquisition des comptes privés',
    decollectivization: 'Retour de la propriété privée',
    ministry_election: `Élection : ${PORTFOLIO_LABEL[portfolio]} → ${playerName(data.players, player)}`,
    independence: "Proclamation d'indépendance de la Principauté",
  };
  const payload = (): Record<string, unknown> => {
    if (kind === 'prohibition') return { target, active };
    if (kind === 'rationing') return { active };
    if (kind === 'ministry_election') return { portfolio, player_id: player };
    return {};
  };
  return (
    <Card title="Déposer une motion" subtitle="Hors quota hebdomadaire (3 motions ouvertes au plus).">
      <div className="space-y-3">
        <Field label="Type de motion">
          <Select value={kind} onChange={(e) => setKind(e.target.value as MotionKind)}>
            {kinds.filter((k) => act >= k.minAct).map((k) => (
              <option key={k.id} value={k.id}>
                {k.label}
              </option>
            ))}
          </Select>
        </Field>
        {kind === 'prohibition' && (
          <Field label="Cible">
            <Select value={target} onChange={(e) => setTarget(e.target.value)}>
              <option value="alcohol">Alcool</option>
              <option value="drugs">Stupéfiants</option>
              <option value="tomatoes">Tomates</option>
            </Select>
          </Field>
        )}
        {(kind === 'prohibition' || kind === 'rationing') && (
          <Field label="Effet">
            <Select value={active ? '1' : '0'} onChange={(e) => setActive(e.target.value === '1')}>
              <option value="1">Instaurer</option>
              <option value="0">Lever</option>
            </Select>
          </Field>
        )}
        {kind === 'ministry_election' && (
          <>
            <Field label="Portefeuille">
              <Select value={portfolio} onChange={(e) => setPortfolio(e.target.value)}>
                {Object.entries(PORTFOLIO_LABEL)
                  .filter(([k]) => act >= (k === 'chancery' || k === 'media' ? 3 : 2))
                  .map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
              </Select>
            </Field>
            <Field label="Candidat">
              <Select value={player} onChange={(e) => setPlayer(e.target.value)}>
                <option value="">— Choisir —</option>
                {data.players.filter((p) => p.is_active_slot).map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.display_name}
                  </option>
                ))}
              </Select>
            </Field>
          </>
        )}
        <Field label="Motifs">
          <TextArea value={why} onChange={(e) => setWhy(e.target.value)} className="min-h-20" />
        </Field>
        <Button className="w-full" disabled={why.trim().length < 10 || (kind === 'ministry_election' && !player)} onClick={() => void perform(() => api.submitMotion(kind, titles[kind] ?? kind, why, payload()), 'Motion déposée.').then(() => setWhy(''))}>
          Déposer la motion
        </Button>
      </div>
    </Card>
  );
}

function Initiatives() {
  const data = useData();
  const now = useNow(1000);
  const list = sortProposals(data.proposals.filter((p) => !['tribunal', 'migrant_admission', 'constitution_article'].includes(p.kind)));
  return (
    <div className="space-y-4">
      <Card tone="warning">
        <p className="text-sm">
          Prochaine séance de l'Agora : <strong>{dateTime(nextAgoraSession(now).toISOString())}</strong> (dans {countdown(nextAgoraSession(now).toISOString(), now)}). Majorité simple, voix prépondérante d'Ely ; veto possible 6 h après l'adoption.
        </p>
      </Card>
      <InitiativeForm />
      {list.length === 0 ? <Empty>Aucun scrutin pour le moment.</Empty> : list.map((p) => <ProposalCard key={p.id} p={p} />)}
      <MotionForm />
    </div>
  );
}

function Immigration() {
  const data = useData();
  const { api, perform } = useGame();
  const [action, setAction] = useState<{ def: ActionDef; migrantId: string } | null>(null);
  const v = data.village;
  const pop = population(data);
  const myActions = availableActions(data.me, v.act_number);
  const screenings = myActions.filter((a) => a.code.startsWith('screen_migrant_'));
  const candidates = data.migrants.filter((m) => m.status === 'candidate');
  const residents = data.migrants.filter((m) => m.status !== 'candidate');
  const ages = useMemo(() => {
    const list = [...residents.map((m) => m.age), ...data.children.map((c) => c.age_years)];
    const buckets = [
      ['0-11', 0, 11],
      ['12-17', 12, 17],
      ['18-30', 18, 30],
      ['31-45', 31, 45],
      ['46-65', 46, 65],
      ['66+', 66, 200],
    ] as const;
    return buckets.map(([label, min, max]) => ({ label, count: list.filter((a) => a >= min && a <= max).length + (label === '31-45' ? pop.founders : 0) }));
  }, [residents, data.children, pop.founders]);
  const maxBucket = Math.max(1, ...ages.map((a) => a.count));
  const admissionFor = (id: string) => data.proposals.find((p) => p.kind === 'migrant_admission' && p.target_migrant_id === id);

  return (
    <div className="space-y-4">
      <Card title="Démographie du hameau" subtitle={`${pop.total} habitants : ${pop.founders} fondateurs, ${pop.residents} résidents, ${pop.children} enfants`}>
        <div className="grid gap-3 sm:grid-cols-2">
          <Gauge label="Pérennité démographique" value={Math.round(v.demographic_viability_pct)} hint={v.low_viability_seasons > 0 ? `${v.low_viability_seasons} saison(s) à 0 % — extinction à 2` : undefined} />
          <Gauge label="Taux d'homosexualité" value={Math.round(v.homosexuality_rate_pct * 10) / 10} good="low" hint="Au-delà de 45 % : déclin démographique" />
          <Gauge label="Friction culturelle" value={Math.round(v.cultural_friction_pct)} good="low" />
          <Gauge label="Natalité de base" value={v.birth_rate_pct} suffix=" %" good="neutral" max={10} hint={`${v.births_this_season} naissance(s) cette saison`} />
        </div>
        <div className="mt-4">
          <p className="mb-1 text-sm text-ink-soft">Spectre politique (Droite ↔ Gauche)</p>
          <div className="relative h-3 rounded-full bg-gradient-to-r from-river-600 via-parchment-300 to-ember-600">
            <span className="absolute -top-1 h-5 w-1.5 rounded bg-ink" style={{ left: `calc(${v.left_wing_ideology_pct}% - 3px)` }} />
          </div>
          <div className="mt-1 flex justify-between text-xs text-ink-soft">
            <span>Droite</span>
            <span>{Math.round(v.left_wing_ideology_pct)} % à gauche</span>
            <span>Gauche</span>
          </div>
          {v.left_wing_ideology_pct > 55 && <p className="mt-1 text-sm font-semibold text-ember-600">Pénuries collectivistes en cours.</p>}
        </div>
        <div className="mt-4">
          <p className="mb-2 text-sm text-ink-soft">Pyramide des âges</p>
          <div className="space-y-1">
            {ages.map((a) => (
              <div key={a.label} className="flex items-center gap-2 text-xs">
                <span className="w-12 text-right text-ink-soft">{a.label}</span>
                <span className="h-3 rounded-r bg-wood-500" style={{ width: `${(a.count / maxBucket) * 70}%`, minWidth: a.count ? 6 : 0 }} />
                <span className="tabular-nums">{a.count}</span>
              </div>
            ))}
          </div>
        </div>
      </Card>

      <SectionTitle>Dossiers de candidats ({candidates.length})</SectionTitle>
      {candidates.length === 0 && <Empty>Aucun candidat sur la piste. Le Maître du Jeu en amène les lundis, mercredis et vendredis.</Empty>}
      {candidates.map((m) => {
        const proposal = admissionFor(m.id);
        const mine = data.screenings.filter((s) => s.migrant_id === m.id);
        return (
          <Card key={m.id} title={`${m.full_name}, ${m.age} ans`} subtitle={m.origin}>
            <div className="mb-2 flex flex-wrap gap-1.5">
              <Badge>{m.religion}</Badge>
              <Badge tone="river">{m.political_leaning}</Badge>
              <Badge tone="wood">
                {SPECIALTY_LABEL[m.specialty_code]} · niv. {m.specialty_level}
              </Badge>
              <Badge>Force {m.physical_strength}</Badge>
              {m.children_count > 0 && <Badge tone="moss">{m.children_count} enfant(s)</Badge>}
              {m.spanish_speaker && <Badge tone="gold">Hispanophone</Badge>}
            </div>
            <p className="text-sm">{m.value_proposition}</p>
            {mine.map((s) => (
              <div key={s.id} className="mt-2 rounded-xl bg-river-100 px-3 py-2 text-xs">
                <p className="font-semibold">🔒 Votre auscultation ({s.screening_type})</p>
                {Object.entries(s.findings).map(([k, val]) => (
                  <p key={k}>
                    {k} : <strong>{String(val)}</strong>
                  </p>
                ))}
              </div>
            ))}
            <div className="mt-3 flex flex-wrap gap-2">
              {screenings.map((a) => (
                <Button key={a.code} size="sm" variant="secondary" onClick={() => setAction({ def: a, migrantId: m.id })}>
                  {a.label}
                </Button>
              ))}
              {proposal && <Badge tone="gold">Vote d'admission : {proposal.votes_yes.length} OUI / {proposal.votes_no.length} NON</Badge>}
            </div>
            {proposal?.status === 'open' && (
              <div className="mt-3 grid grid-cols-2 gap-2">
                <Button variant="moss" size="sm" onClick={() => void perform(() => api.vote(proposal.id, true), 'Vous votez pour son admission.')}>
                  Admettre
                </Button>
                <Button variant="danger" size="sm" onClick={() => void perform(() => api.vote(proposal.id, false), 'Vous votez contre.')}>
                  Refuser
                </Button>
              </div>
            )}
          </Card>
        );
      })}

      <SectionTitle>Résidents ({residents.length})</SectionTitle>
      {residents.length === 0 ? (
        <Empty>Aucun résident pour l'instant.</Empty>
      ) : (
        <Card>
          <ul className="divide-y divide-parchment-200">
            {residents.map((m) => (
              <li key={m.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                <span>
                  <strong>{m.full_name}</strong> · {SPECIALTY_LABEL[m.specialty_code]} {m.specialty_level} · {m.origin}
                  {m.patron_player_id && <span className="text-ink-soft"> · protégé de {playerName(data.players, m.patron_player_id)}</span>}
                </span>
                <span className="flex gap-1">
                  {m.is_naturalized && <Badge tone="moss">Citoyen</Badge>}
                  <Badge tone={m.status === 'forced_labor' ? 'ember' : 'neutral'}>{MIGRANT_STATUS[m.status]}</Badge>
                  {v.act_number >= 3 && !m.is_naturalized && (
                    <Button size="sm" variant="ghost" onClick={() => void perform(() => api.submitMotion('naturalization', `Naturalisation de ${m.full_name}`, 'Résident loyal, intégré au hameau.', { migrant_id: m.id }), 'Motion de naturalisation déposée.')}>
                      Naturaliser
                    </Button>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}
      {data.children.length > 0 && (
        <Card title={`Enfants du hameau (${data.children.length})`}>
          <ul className="space-y-1 text-sm">
            {data.children.map((c) => (
              <li key={c.id}>
                {c.full_name}, {c.age_years} ans — {c.status === 'apprentice' ? `apprenti (${playerName(data.players, c.mentor_player_id)})` : c.status === 'law_student' ? 'études de droit à Lleida' : c.status === 'graduated' ? 'diplômé' : c.born_in_village ? 'né au hameau' : 'école du hameau'}
              </li>
            ))}
          </ul>
        </Card>
      )}
      {action && <ActionSheet def={action.def} holderId={null} preset={{ target_migrant_id: action.migrantId }} onClose={() => setAction(null)} />}
    </div>
  );
}

function Tribunal() {
  const data = useData();
  const { api, perform } = useGame();
  const [accused, setAccused] = useState('');
  const [sentence, setSentence] = useState('forced_labor');
  const [days, setDays] = useState(3);
  const [charge, setCharge] = useState('');
  const list = sortProposals(data.proposals.filter((p) => p.kind === 'tribunal'));
  const residents = data.migrants.filter((m) => m.status === 'accepted' || m.status === 'forced_labor');
  const players = data.players.filter((p) => p.is_active_slot && p.id !== data.me.id && (p.status === 'active' || p.status === 'forced_labor'));
  const submit = () => {
    const payload: Record<string, unknown> = { sentence, ...(sentence === 'forced_labor' ? { days } : {}) };
    if (accused.startsWith('m:')) payload.target_migrant_id = accused.slice(2);
    else payload.target_player_id = accused;
    const name = accused.startsWith('m:') ? residents.find((m) => `m:${m.id}` === accused)?.full_name : playerName(data.players, accused);
    return perform(() => api.submitMotion('tribunal', `${SENTENCE_LABEL[sentence]} — ${name}`, charge, payload), 'Le Tribunal Public est saisi.').then(() => setCharge(''));
  };
  return (
    <div className="space-y-4">
      <Card title="Saisir le Tribunal Public" subtitle="Vote de l'Agora ; l'exécution exige la majorité des deux tiers. Une sentence peut être frappée de veto puis contestée en duel." tone="danger">
        <div className="space-y-3">
          <Field label="Accusé">
            <Select value={accused} onChange={(e) => setAccused(e.target.value)}>
              <option value="">— Choisir —</option>
              {residents.length > 0 && (
                <optgroup label="Résidents">
                  {residents.map((m) => (
                    <option key={m.id} value={`m:${m.id}`}>
                      {m.full_name}
                    </option>
                  ))}
                </optgroup>
              )}
              <optgroup label="Joueurs">
                {players.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.display_name}
                  </option>
                ))}
              </optgroup>
            </Select>
          </Field>
          <Field label="Peine demandée">
            <Select value={sentence} onChange={(e) => setSentence(e.target.value)}>
              {Object.entries(SENTENCE_LABEL).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </Select>
          </Field>
          {sentence === 'forced_labor' && (
            <Field label="Durée (jours)">
              <Input type="number" min={3} max={7} value={days} onChange={(e) => setDays(Math.min(7, Math.max(3, Number(e.target.value) || 3)))} />
            </Field>
          )}
          <Field label="Chef d'accusation">
            <TextArea value={charge} onChange={(e) => setCharge(e.target.value)} className="min-h-20" placeholder="Vols répétés, trafic, sabotage, tentative de coup d'État…" />
          </Field>
          <Button variant="danger" className="w-full" disabled={!accused || charge.trim().length < 10} onClick={() => void submit()}>
            Saisir le Tribunal
          </Button>
        </div>
      </Card>
      {list.length === 0 ? <Empty>Aucune affaire en cours.</Empty> : list.map((p) => <ProposalCard key={p.id} p={p} />)}
    </div>
  );
}

function Constitution() {
  const data = useData();
  const { api, perform } = useGame();
  const [number, setNumber] = useState(1);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const act = data.village.act_number;
  if (act < 3) return <Empty>La Constitution du Micro-État se rédige à l'Acte III (85 % d'autonomie). Autonomie actuelle : {data.village.autonomy_pct} %.</Empty>;
  const votes = sortProposals(data.proposals.filter((p) => p.kind === 'constitution_article' || p.kind === 'independence'));
  const edit = (n: number) => {
    const a = data.constitution.find((x) => x.article_number === n);
    setNumber(n);
    setTitle(a?.title ?? '');
    setBody(a?.body ?? '');
  };
  return (
    <div className="space-y-4">
      {data.village.independence_proclaimed && <Card tone="moss">🏴 La Principauté des Gaulois a proclamé son indépendance.</Card>}
      <Card title="Articles">
        {data.constitution.length === 0 ? (
          <Empty>Aucun article. Rédigez le premier !</Empty>
        ) : (
          <ul className="space-y-3">
            {data.constitution.map((a) => (
              <li key={a.id} className="rounded-xl border border-parchment-200 bg-white p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-serif">
                    Article {a.article_number} — {a.title}
                  </p>
                  <Badge tone={a.status === 'adopted' ? 'moss' : a.status === 'proposed' ? 'gold' : 'neutral'}>{a.status === 'adopted' ? 'Adopté' : a.status === 'proposed' ? 'Au vote' : 'Brouillon'}</Badge>
                </div>
                <p className="mt-1 whitespace-pre-line text-sm">{a.body}</p>
                {a.status === 'draft' && (
                  <div className="mt-2 flex gap-2">
                    <Button size="sm" variant="secondary" onClick={() => edit(a.article_number)}>
                      Modifier
                    </Button>
                    <Button size="sm" onClick={() => void perform(() => api.submitMotion('constitution_article', `Article ${a.article_number} — ${a.title}`, a.body, { article_number: a.article_number }), 'Article soumis au vote.')}>
                      Soumettre au vote
                    </Button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
      <Card title="Rédiger / modifier un article" subtitle="Éditeur collaboratif : tout le monde peut amender un brouillon.">
        <div className="space-y-3">
          <Field label="Numéro">
            <Input type="number" min={1} value={number} onChange={(e) => edit(Math.max(1, Number(e.target.value) || 1))} />
          </Field>
          <Field label="Titre">
            <Input value={title} onChange={(e) => setTitle(e.target.value)} />
          </Field>
          <Field label="Texte">
            <TextArea value={body} onChange={(e) => setBody(e.target.value)} className="min-h-32" />
          </Field>
          <Button className="w-full" disabled={!title.trim() || !body.trim()} onClick={() => void perform(() => api.editConstitution(number, title, body), 'Article enregistré.')}>
            Enregistrer le brouillon
          </Button>
        </div>
      </Card>
      {data.constitution.some((a) => a.status === 'adopted') && !data.village.independence_proclaimed && (
        <Button variant="danger" className="w-full" onClick={() => void perform(() => api.submitMotion('independence', "Proclamation d'indépendance de la Principauté des Gaulois", 'Le hameau, autonome et doté de sa Constitution, proclame sa souveraineté.', {}), 'Motion d\'indépendance déposée (2/3 requis).')}>
          Proposer la proclamation d'indépendance
        </Button>
      )}
      {votes.map((p) => (
        <ProposalCard key={p.id} p={p} />
      ))}
    </div>
  );
}

function Duels() {
  const data = useData();
  const { api, perform } = useGame();
  const now = useNow(1000);
  const [opponent, setOpponent] = useState('');
  const [mode, setMode] = useState<'carlage' | 'target'>('target');
  const active = data.duels.filter((d) => d.status === 'active');
  const finished = data.duels.filter((d) => d.status !== 'active');
  const name = (id: string | null, migrant: string | null) => (id ? playerName(data.players, id) : data.migrants.find((m) => m.id === migrant)?.full_name ?? 'le meneur');
  const fit = canFight(data.me, now);
  const canRepress = data.me.ministerial_portfolios.some((p) => (p === 'defense' || p === 'interior') && data.village.act_number >= 2);
  return (
    <div className="space-y-4">
      <Card title="Comment se règlent les différends" subtitle="Le challenger choisit l'épreuve.">
        <ul className="space-y-1 text-sm">
          <li>
            <strong>Carlage 2×2</strong> — en direct, 5 manches de 10 s, les deux joueurs connectés. Pousser, Pivoter, Ancrer, Épaule. Blessure possible (Franchise Carlage).
          </li>
          <li>
            <strong>Épreuve de la cible</strong> — en différé sous 24 h : 5 cibles, la touche la plus proche et la plus rapide marque le plus. Aucun risque physique.
          </li>
        </ul>
      </Card>
      <SectionTitle>Duels en cours</SectionTitle>
      {active.length === 0 ? (
        <Empty>Aucun duel en cours.</Empty>
      ) : (
        active.map((d) => {
          const mine = d.player_a_id === data.me.id || d.player_b_id === data.me.id;
          return (
            <Card key={d.id} tone={mine ? 'warning' : 'default'}>
              <div className="mb-1 flex flex-wrap gap-1.5">
                <Badge tone="wood">{DUEL_MODE[d.mode]}</Badge>
                <Badge>{DUEL_CONTEXT[d.context]}</Badge>
              </div>
              <p className="font-serif text-lg">
                {name(d.player_a_id, null)} contre {name(d.player_b_id, d.opponent_migrant_id)}
              </p>
              <p className="text-sm text-ink-soft">
                {d.mode === 'target' ? `À jouer avant ${dateTime(d.round_deadline_at)} (${countdown(d.round_deadline_at, now)})` : `Manche ${d.current_round}/5 — échéance ${countdown(d.round_deadline_at, now)}`}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button onClick={() => navigate('duel', d.id)}>{mine ? (d.mode === 'target' ? 'Jouer mon épreuve' : "Entrer dans l'arène") : 'Regarder'}</Button>
                {d.context === 'putsch' && canRepress && (
                  <Button variant="danger" onClick={() => void perform(() => api.repressPutsch(d.id), 'Putsch réprimé.')}>
                    Réprimer le putsch (1 PA)
                  </Button>
                )}
              </div>
            </Card>
          );
        })
      )}
      <Card title="Défier un joueur (duel amical)">
        <div className="space-y-3">
          <Field label="Adversaire">
            <Select value={opponent} onChange={(e) => setOpponent(e.target.value)}>
              <option value="">— Choisir —</option>
              {data.players.filter((p) => p.is_active_slot && p.id !== data.me.id && p.status === 'active').map((p) => (
                <option key={p.id} value={p.id}>
                  {p.display_name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Épreuve" hint={mode === 'carlage' && !fit ? 'Vous ne remplissez pas les conditions des 3 PA : Carlage interdit.' : undefined}>
            <Select value={mode} onChange={(e) => setMode(e.target.value as 'carlage' | 'target')}>
              <option value="target">{DUEL_MODE.target}</option>
              <option value="carlage">{DUEL_MODE.carlage}</option>
            </Select>
          </Field>
          <Button className="w-full" disabled={!opponent || (mode === 'carlage' && !fit)} onClick={() => void perform(() => api.challengeDuel({ targetPlayerId: opponent, mode }), 'Défi lancé !').then((r) => r?.duel_id && navigate('duel', String(r.duel_id)))}>
            Lancer le défi
          </Button>
        </div>
      </Card>
      {finished.length > 0 && (
        <>
          <SectionTitle>Derniers résultats</SectionTitle>
          {finished.map((d) => (
            <Card key={d.id}>
              <p className="text-sm">
                {DUEL_MODE[d.mode]} · {DUEL_CONTEXT[d.context]} — vainqueur : <strong>{d.winner_side === 'a' ? name(d.player_a_id, null) : name(d.player_b_id, d.opponent_migrant_id)}</strong>
              </p>
              <Button size="sm" variant="ghost" onClick={() => navigate('duel', d.id)}>
                Détails
              </Button>
            </Card>
          ))}
        </>
      )}
    </div>
  );
}

const TABS: readonly Tab[] = ['initiatives', 'immigration', 'tribunal', 'constitution', 'duels'];

export function AgoraScreen() {
  const data = useData();
  const route = useRoute();
  // Sous-onglet dans l'adresse (#/agora/duels) : liens de l'accueil et des notifications (V4.4)
  const tab: Tab = TABS.includes(route.param as Tab) ? (route.param as Tab) : 'initiatives';
  const setTab = (t: Tab) => navigate('agora', t === 'initiatives' ? null : t, { replace: true });
  const openCount = (kinds: string[] | null) => data.proposals.filter((p) => p.status === 'open' && (kinds ? kinds.includes(p.kind) : !['tribunal', 'migrant_admission', 'constitution_article'].includes(p.kind))).length;
  return (
    <div>
      <Tabs<Tab>
        value={tab}
        onChange={setTab}
        tabs={[
          { id: 'initiatives', label: 'Initiatives', badge: openCount(null) },
          { id: 'immigration', label: 'Immigration', badge: data.migrants.filter((m) => m.status === 'candidate').length },
          { id: 'tribunal', label: 'Tribunal', badge: openCount(['tribunal']) },
          { id: 'constitution', label: 'Constitution' },
          { id: 'duels', label: 'Duels', badge: data.duels.filter((d) => d.status === 'active').length },
        ]}
      />
      {tab === 'initiatives' && <Initiatives />}
      {tab === 'immigration' && <Immigration />}
      {tab === 'tribunal' && <Tribunal />}
      {tab === 'constitution' && <Constitution />}
      {tab === 'duels' && <Duels />}
    </div>
  );
}
