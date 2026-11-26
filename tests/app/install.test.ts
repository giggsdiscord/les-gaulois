import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { installMode, isIosDevice } from '../../src/app/lib/installMode.ts';

const root = join(import.meta.dirname, '..', '..');
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 19_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/19.0 Mobile/15E148 Safari/604.1';
const IPAD_AS_MAC = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/19.0 Safari/605.1.15';
const ANDROID = 'Mozilla/5.0 (Linux; Android 16; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0 Mobile Safari/537.36';

describe('Installation de l’appli (GDD §7.6, V4.2)', () => {
  it('détecte iPhone et iPad (même déguisé en Mac), pas Android ni un vrai Mac', () => {
    expect(isIosDevice(IPHONE, 5)).toBe(true);
    expect(isIosDevice(IPAD_AS_MAC, 5)).toBe(true);
    expect(isIosDevice(IPAD_AS_MAC, 0)).toBe(false);
    expect(isIosDevice(ANDROID, 5)).toBe(false);
  });

  it('choisit le bon mode', () => {
    expect(installMode({ standalone: true, hasPrompt: true, userAgent: ANDROID, maxTouchPoints: 5 })).toBe('installed');
    expect(installMode({ standalone: false, hasPrompt: true, userAgent: ANDROID, maxTouchPoints: 5 })).toBe('prompt');
    expect(installMode({ standalone: false, hasPrompt: false, userAgent: IPHONE, maxTouchPoints: 5 })).toBe('ios');
    expect(installMode({ standalone: false, hasPrompt: false, userAgent: ANDROID, maxTouchPoints: 5 })).toBe('manual');
  });

  it('manifeste installable, chemins relatifs (GitHub Pages sous /les-gaulois/)', () => {
    const manifest = JSON.parse(readFileSync(join(root, 'public', 'manifest.webmanifest'), 'utf8'));
    expect(manifest.display).toBe('standalone');
    expect(manifest.start_url).toBe('./');
    expect(manifest.scope).toBe('./');
    expect(manifest.lang).toBe('fr');
    const sizes = manifest.icons.map((i: { sizes: string }) => i.sizes);
    expect(sizes).toContain('192x192');
    expect(sizes).toContain('512x512');
    expect(manifest.icons.some((i: { purpose: string }) => i.purpose === 'maskable')).toBe(true);
    for (const icon of manifest.icons as { src: string }[]) {
      expect(icon.src.startsWith('/')).toBe(false);
      expect(existsSync(join(root, 'public', icon.src))).toBe(true);
    }
  });

  it('index.html relie le manifeste et l’icône iOS ; le service worker ignore les appels Supabase', () => {
    const html = readFileSync(join(root, 'index.html'), 'utf8');
    expect(html).toContain('rel="manifest"');
    expect(html).toContain('rel="apple-touch-icon"');
    expect(existsSync(join(root, 'public', 'icons', 'apple-touch-icon.png'))).toBe(true);
    const sw = readFileSync(join(root, 'public', 'sw.js'), 'utf8');
    expect(sw).toContain("request.method !== 'GET'");
    expect(sw).toContain('url.origin !== self.location.origin');
  });
});
