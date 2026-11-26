/** Lecture des variables d'environnement des Edge Functions (anciennes et nouvelles clés Supabase). */
import { describe, expect, it } from 'vitest';
import { readEnv, serverSecretKey } from '../../supabase/functions/_shared/runtime/env.ts';

const envOf = (vars: Record<string, string>) => (key: string) => vars[key];

describe('Variables des Edge Functions', () => {
  it('ancienne clé service_role prioritaire', () => {
    expect(serverSecretKey(envOf({ SUPABASE_SERVICE_ROLE_KEY: 'eyJ.legacy', SUPABASE_SECRET_KEYS: '{"default":"sb_secret_x"}' }))).toBe('eyJ.legacy');
  });

  it('nouvelle clé sb_secret_ lue dans SUPABASE_SECRET_KEYS', () => {
    expect(serverSecretKey(envOf({ SUPABASE_SECRET_KEYS: '{"default":"sb_secret_abc"}' }))).toBe('sb_secret_abc');
    expect(serverSecretKey(envOf({ SUPABASE_SECRET_KEYS: '{"gaulois":"sb_secret_def"}' }))).toBe('sb_secret_def');
  });

  it('secret manuel en dernier recours, erreur explicite sinon', () => {
    expect(serverSecretKey(envOf({ SUPABASE_SECRET_KEYS: 'pas du json', SB_SECRET_KEY: 'sb_secret_manuel' }))).toBe('sb_secret_manuel');
    expect(() => serverSecretKey(envOf({}))).toThrow(/SUPABASE_SECRET_KEYS/);
  });

  it('valeurs par défaut : Haiku 5.5, effort low, CORS ouvert, 20 % de tentations', () => {
    const env = readEnv(envOf({ SUPABASE_URL: 'https://abc.supabase.co', SUPABASE_SECRET_KEYS: '{"default":"sb_secret_abc"}' }));
    expect(env.gmModel).toBe('claude-haiku-5-5');
    expect(env.gmEffort).toBe('low');
    expect(env.allowedOrigin).toBe('*');
    expect(env.anthropicApiKey).toBeNull();
    expect(env.cronSecret).toBeNull();
    expect(env.temptationChancePct).toBe(20);
  });
});
