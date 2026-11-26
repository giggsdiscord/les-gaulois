#!/usr/bin/env node
/**
 * Génère le PDF du GDD à partir de la source vivante docs/GDD.md.
 *  1. lit l'en-tête (version, date, titre) ;
 *  2. remplace les marqueurs <!-- AUTO:... --> par des tableaux générés depuis le moteur
 *     (constantes, actions métiers, catalogue fournisseurs) et par docs/CHANGELOG.md ;
 *  3. convertit en HTML (marked) avec une feuille de style d'impression ;
 *  4. imprime en PDF A4 avec Chrome / Edge headless (puppeteer-core).
 *
 * Sortie : « Les Gaulois - Game Design Document & Architecture Technique V<version>.pdf »
 * à la racine du projet (+ docs/build/GDD.html). Navigateur : variable CHROME_PATH sinon détection.
 * Usage : npm run gdd:pdf
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Marked } from 'marked';
import puppeteer from 'puppeteer-core';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const engine = await import(pathToFileURL(join(root, 'src', 'engine', 'index.ts')).href);

// ---------------------------------------------------------------------------
// Source & en-tête
// ---------------------------------------------------------------------------
const raw = readFileSync(join(root, 'docs', 'GDD.md'), 'utf8').replace(/\r\n/g, '\n');
const fm = raw.match(/^---\n([\s\S]*?)\n---\n/);
const meta = { version: '0.0', date: '', title: 'Game Design Document' };
if (fm) {
  for (const line of fm[1].split('\n')) {
    const m = line.match(/^(\w+):\s*(.*)$/);
    if (m) meta[m[1]] = m[2].trim();
  }
}
let markdown = fm ? raw.slice(fm[0].length) : raw;

// ---------------------------------------------------------------------------
// Annexes générées depuis le code
// ---------------------------------------------------------------------------
const esc = (v) => String(v).replace(/\|/g, '\\|').replace(/\n/g, ' ');
const fmtValue = (v) => {
  if (typeof v === 'number') return String(v).replace('.', ',');
  if (typeof v === 'string') return v;
  if (Array.isArray(v)) {
    return v
      .map((x) => (typeof x === 'object' && x !== null ? `(${Object.entries(x).map(([a, b]) => `${a}=${b}`).join(', ')})` : x))
      .join(' / ');
  }
  return Object.entries(v)
    .map(([k, x]) => `${k} : ${typeof x === 'object' && x !== null ? Object.entries(x).map(([a, b]) => `${a}=${b}`).join(', ') : x}`)
    .join(' ; ');
};

function constantsTable() {
  const rows = Object.entries(engine.constants)
    .filter(([, v]) => v !== null && ['number', 'string', 'object'].includes(typeof v))
    .map(([k, v]) => `| \`${k}\` | ${esc(fmtValue(v))} |`);
  return ['| Constante | Valeur |', '|---|---|', ...rows].join('\n');
}

const ROLE_LABEL = {
  mayor_agri: 'Ely', treasurer_physio: 'M. Lerme', civil_eng: 'Tiphaine', water_eng: 'Alex',
  smith_diplo: 'Julio', druid: 'Tanguy', priest_apoth: 'Brunel', defense_sec: 'Défense',
  transport_customs: 'Douanes', legal_media: 'Chancellerie/Médias',
};
const PORTFOLIO_LABEL = { defense: 'Défense', interior: 'Sécurité Intérieure', customs: 'Transports & Douanes', chancery: 'Chancellerie', media: 'Médias' };

function actionsTable() {
  const rows = engine.ACTIONS.map((a) => {
    const who = a.anyone
      ? 'Tous'
      : [...(a.roles ?? []).map((r) => ROLE_LABEL[r] ?? r), ...(a.portfolio ? [`Portefeuille ${PORTFOLIO_LABEL[a.portfolio]}`] : [])].join(', ');
    const locks = [
      a.requiresPlu ? 'PLU' : null,
      a.cost ? 'dépense caisse (M. Lerme si > 500 €)' : null,
      a.ecoSensitive ? 'veto éco.' : null,
      a.sundayOnly ? 'dimanche' : null,
      a.delegable === false ? 'non délégable' : null,
      a.physical ? 'effort physique' : null,
    ].filter(Boolean).join(', ');
    return `| ${esc(a.label)} | ${esc(who)} | ${a.apCost} | ${a.minAct ?? 1} | ${esc(locks || '—')} | ${esc(a.description)} |`;
  });
  return [`${engine.ACTIONS.length} actions déterministes.`, '', '| Action | Qui | PA | Acte | Verrous & contraintes | Effet |', '|---|---|---|---|---|---|', ...rows].join('\n');
}

function catalogTable() {
  const rows = engine.CATALOG.map(
    (i) => `| ${esc(i.supplier)} | ${esc(i.label)} | ${esc(i.unit)} | ${i.price_eur} € | ${i.kind === 'rental' ? 'Location' : 'Achat'} |`,
  );
  return ['Prix TTC livrés ; +40 % si la piste est sous 40 % ; validation de M. Lerme au-delà de 500 €.', '', '| Fournisseur | Article | Unité | Prix | Type |', '|---|---|---|---|---|', ...rows].join('\n');
}

const changelog = readFileSync(join(root, 'docs', 'CHANGELOG.md'), 'utf8').replace(/\r\n/g, '\n').replace(/^# .*\n/, '');
markdown = markdown
  .replace('<!-- AUTO:CONSTANTS -->', constantsTable())
  .replace('<!-- AUTO:ACTIONS -->', actionsTable())
  .replace('<!-- AUTO:CATALOG -->', catalogTable())
  .replace('<!-- AUTO:CHANGELOG -->', changelog);

// ---------------------------------------------------------------------------
// Markdown → HTML (titres numérotés pour la table des matières)
// ---------------------------------------------------------------------------
const headings = [];
const slug = (t) => t.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/<[^>]+>/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const marked = new Marked({ gfm: true });
marked.use({
  renderer: {
    heading({ tokens, depth }) {
      const text = this.parser.parseInline(tokens);
      const id = `${slug(text)}-${headings.length}`;
      if (depth === 2 || depth === 3) headings.push({ depth, text, id });
      return `<h${depth} id="${id}">${text}</h${depth}>\n`;
    },
  },
});
const body = marked.parse(markdown);
const toc = headings
  .map((h) => `<li class="toc-${h.depth}"><a href="#${h.id}">${h.text}</a></li>`)
  .join('\n');

const css = `
@page { size: A4; margin: 18mm 15mm 18mm 15mm; }
:root { --ink: #2b2118; --stone: #5b5047; --wood: #7a4b26; --moss: #4d6b2f; --parchment: #fbf7ef; --line: #d9cbb3; --sky: #e9efe6; }
* { box-sizing: border-box; }
html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
body { font-family: Georgia, 'Times New Roman', serif; color: var(--ink); font-size: 10pt; line-height: 1.45; margin: 0; background: #fff; }
.cover { height: 250mm; display: flex; flex-direction: column; justify-content: center; padding: 0 10mm; background: linear-gradient(160deg, var(--parchment), #efe4cf); border: 1px solid var(--line); page-break-after: always; }
.cover .kicker { font-family: 'Segoe UI', Arial, sans-serif; letter-spacing: .18em; text-transform: uppercase; color: var(--wood); font-size: 9pt; }
.cover h1 { font-size: 30pt; line-height: 1.1; margin: 8mm 0 4mm; border: 0; color: var(--ink); }
.cover .sub { font-size: 13pt; color: var(--stone); max-width: 150mm; }
.cover .meta { margin-top: 18mm; font-family: 'Segoe UI', Arial, sans-serif; font-size: 10pt; color: var(--stone); }
.cover .badge { display: inline-block; background: var(--moss); color: #fff; padding: 2mm 4mm; border-radius: 2mm; font-family: 'Segoe UI', Arial, sans-serif; font-weight: 600; }
nav.toc { page-break-after: always; }
nav.toc h2 { margin-top: 0; }
nav.toc ul { list-style: none; padding: 0; margin: 0; columns: 1; }
nav.toc li { margin: 1mm 0; }
nav.toc li.toc-3 { padding-left: 6mm; font-size: 9pt; color: var(--stone); }
nav.toc a { color: inherit; text-decoration: none; }
h1 { font-size: 20pt; border-bottom: 2px solid var(--wood); padding-bottom: 2mm; }
h2 { font-size: 15pt; color: var(--wood); border-bottom: 1px solid var(--line); padding-bottom: 1.5mm; margin-top: 9mm; page-break-after: avoid; }
h2:not(:first-of-type) { page-break-before: auto; }
h3 { font-size: 12pt; color: var(--moss); margin-top: 6mm; page-break-after: avoid; }
p, li { orphans: 3; widows: 3; }
table { width: 100%; border-collapse: collapse; margin: 3mm 0 4mm; font-family: 'Segoe UI', Arial, sans-serif; font-size: 8pt; line-height: 1.35; }
th { background: #eadfca; color: var(--ink); text-align: left; padding: 1.6mm; border: 1px solid var(--line); }
td { padding: 1.6mm; border: 1px solid var(--line); vertical-align: top; }
tr { page-break-inside: avoid; }
tbody tr:nth-child(even) td { background: #fcfaf5; }
blockquote { margin: 3mm 0; padding: 2.5mm 4mm; background: var(--sky); border-left: 3px solid var(--moss); font-size: 9pt; page-break-inside: avoid; }
blockquote p { margin: 1mm 0; }
code { font-family: Consolas, 'Courier New', monospace; font-size: 8pt; background: #f3ede2; padding: 0 1mm; border-radius: 1mm; }
pre { background: #2b2118; color: #f3ede2; padding: 3mm; border-radius: 2mm; font-size: 6.8pt; line-height: 1.35; white-space: pre-wrap; word-break: break-word; }
pre code { background: none; color: inherit; padding: 0; font-size: inherit; }
hr { border: 0; border-top: 1px solid var(--line); }
`;

const date = meta.date ? new Date(`${meta.date}T12:00:00Z`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }) : '';
const html = `<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><title>${meta.title} V${meta.version}</title><style>${css}</style></head>
<body>
<section class="cover">
  <div class="kicker">Game Design Document & Spécification Technique</div>
  <h1>Les Gaulois<br>Simulation coopérative de village & Micro-État</h1>
  <div class="sub">Stratégie asynchrone persistante ancrée dans les Pyrénées de Lleida — moteur déterministe TypeScript, Supabase et Maître du Jeu IA.</div>
  <div class="meta"><span class="badge">Version ${meta.version}</span>&nbsp;&nbsp;${date}</div>
</section>
<nav class="toc"><h2>Sommaire</h2><ul>${toc}</ul></nav>
${body}
</body></html>`;

const buildDir = join(root, 'docs', 'build');
mkdirSync(buildDir, { recursive: true });
const htmlPath = join(buildDir, 'GDD.html');
writeFileSync(htmlPath, html, 'utf8');

// ---------------------------------------------------------------------------
// Impression PDF
// ---------------------------------------------------------------------------
const candidates = [
  process.env.CHROME_PATH,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
].filter(Boolean);
const executablePath = candidates.find((p) => existsSync(p));
if (!executablePath) {
  console.error('Aucun Chrome / Edge trouvé : définissez CHROME_PATH. HTML disponible :', htmlPath);
  process.exit(1);
}

const pdfName = `Les Gaulois - Game Design Document & Architecture Technique V${meta.version}.pdf`;
const pdfPath = join(root, pdfName);
const browser = await puppeteer.launch({ executablePath, headless: true, args: ['--no-sandbox', '--disable-gpu'] });
try {
  const page = await browser.newPage();
  await page.goto(pathToFileURL(htmlPath).href, { waitUntil: 'load' });
  await page.pdf({
    path: pdfPath,
    format: 'A4',
    printBackground: true,
    displayHeaderFooter: true,
    headerTemplate: '<div></div>',
    footerTemplate: `<div style="width:100%;font-family:Segoe UI,Arial,sans-serif;font-size:7.5pt;color:#7a6a58;padding:0 15mm;display:flex;justify-content:space-between;"><span>Les Gaulois — Game Design Document & Spécification Technique V${meta.version}</span><span>Page <span class="pageNumber"></span> / <span class="totalPages"></span></span></div>`,
    margin: { top: '16mm', bottom: '18mm', left: '15mm', right: '15mm' },
  });
} finally {
  await browser.close();
}
console.log(`PDF généré : ${pdfName}`);
