/**
 * Point d'accès unique de l'interface au moteur déterministe.
 * On importe la copie embarquée par les Edge Functions (identique à src/engine, vérifiée par
 * `npm run engine:check`) pour n'avoir qu'un seul exemplaire du moteur dans le bundle.
 */
export * from '../../supabase/functions/_shared/engine/index.ts';
