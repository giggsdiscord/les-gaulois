/** Réponses JSON, CORS (GitHub Pages) et gestion d'erreurs communes aux Edge Functions. */

export class HttpError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
    this.name = 'HttpError';
  }
}

export function corsHeaders(allowedOrigin: string, requestOrigin: string | null): Record<string, string> {
  const origin = allowedOrigin === '*' ? '*' : requestOrigin === allowedOrigin ? allowedOrigin : allowedOrigin;
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-player-token, x-cron-secret',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

export type JsonBody = Record<string, unknown>;
export type Handler = (req: Request, body: JsonBody) => Promise<JsonBody>;

const MAX_BODY_BYTES = 64 * 1024;

export function createHttpHandler(allowedOrigin: string, handler: Handler): (req: Request) => Promise<Response> {
  return async (req: Request): Promise<Response> => {
    const cors = corsHeaders(allowedOrigin, req.headers.get('origin'));
    const reply = (status: number, body: unknown) =>
      new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json; charset=utf-8' } });
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (req.method !== 'POST') return reply(405, { ok: false, error: 'Méthode non autorisée (POST attendu).' });
    try {
      const text = await req.text();
      if (text.length > MAX_BODY_BYTES) throw new HttpError(413, 'Requête trop volumineuse.');
      let body: JsonBody = {};
      if (text.trim().length > 0) {
        const parsed: unknown = JSON.parse(text);
        if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) throw new HttpError(400, 'Corps JSON objet attendu.');
        body = parsed as JsonBody;
      }
      const result = await handler(req, body);
      return reply(200, result);
    } catch (err) {
      if (err instanceof HttpError) return reply(err.status, { ok: false, error: err.message });
      if (err instanceof SyntaxError) return reply(400, { ok: false, error: 'JSON invalide.' });
      console.error(err);
      return reply(500, { ok: false, error: 'Erreur interne du moteur.' });
    }
  };
}

export function str(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.length === 0) throw new HttpError(400, `Champ « ${field} » manquant.`);
  return value;
}

export function optStr(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

/** Comparaison en temps constant (secret partagé avec pg_cron). */
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
