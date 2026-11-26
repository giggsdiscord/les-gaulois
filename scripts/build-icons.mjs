#!/usr/bin/env node
/**
 * Génère les icônes PNG de l'application installable (manifeste PWA, écran d'accueil iOS)
 * à partir du dessin de public/icons/icon.svg, avec Chrome ou Edge en mode headless.
 * Les PNG sont versionnés : ne relancer que si le dessin change.
 *
 * Usage : npm run icons
 */
import puppeteer from 'puppeteer-core';
import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'public', 'icons');
const svg = readFileSync(join(outDir, 'icon.svg'), 'utf8');
// Dessin seul (sans le fond arrondi), pour les variantes plein cadre.
const art = svg.replace(/^[\s\S]*?<rect[^>]*\/>/, '').replace(/<\/svg>\s*$/, '');

const BG = '#3b2a1c';
const variants = [
  // purpose « any » : fond arrondi transparent autour, comme la favicon
  { file: 'icon-192.png', size: 192, html: (s) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="${s}" height="${s}">${svg.replace(/^<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '')}</svg>` },
  { file: 'icon-512.png', size: 512, html: (s) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="${s}" height="${s}">${svg.replace(/^<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '')}</svg>` },
  // purpose « maskable » et iOS : fond plein, dessin réduit dans la zone sûre (80 % central)
  { file: 'icon-maskable-512.png', size: 512, html: (s) => fullBleed(s, 0.72) },
  { file: 'apple-touch-icon.png', size: 180, html: (s) => fullBleed(s, 0.86) },
];

function fullBleed(size, scale) {
  const offset = (64 * (1 - scale)) / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="${size}" height="${size}"><rect width="64" height="64" fill="${BG}"/><g transform="translate(${offset} ${offset - 2 * scale}) scale(${scale})">${art}</g></svg>`;
}

const candidates = [
  process.env.CHROME_PATH,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
].filter(Boolean);
const executablePath = candidates.find((p) => existsSync(p));
if (!executablePath) {
  console.error('Chrome ou Edge introuvable : définissez CHROME_PATH.');
  process.exit(1);
}

const browser = await puppeteer.launch({ executablePath, headless: true, args: ['--no-sandbox', '--disable-gpu'] });
try {
  const page = await browser.newPage();
  for (const v of variants) {
    await page.setViewport({ width: v.size, height: v.size, deviceScaleFactor: 1 });
    await page.setContent(`<!doctype html><html><body style="margin:0;background:transparent">${v.html(v.size)}</body></html>`);
    await page.screenshot({ path: join(outDir, v.file), omitBackground: true, clip: { x: 0, y: 0, width: v.size, height: v.size } });
    console.log(`  ✓ public/icons/${v.file} (${v.size}×${v.size})`);
  }
} finally {
  await browser.close();
}
