-- ============================================================================
-- LES GAULOIS — Planification des tâches automatiques (pg_cron + pg_net)
-- À exécuter dans Supabase > SQL Editor, APRÈS le premier déploiement des Edge Functions.
-- Remplacez les deux valeurs entre chevrons (toutes leurs occurrences) avant d'exécuter :
--   <PROJECT_REF>  : identifiant du projet (Settings > General > Project ID), ex. abcdefghijklmnop
--   <CRON_SECRET>  : la même valeur que le secret CRON_SECRET des Edge Functions
-- Les valeurs sont rangées dans Supabase Vault (chiffrées), jamais en clair dans les tâches.
-- Le script peut être rejoué (changement de secret, de projet) : il met à jour au lieu de dupliquer.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

DO $$
DECLARE
  v_url    text := 'https://<PROJECT_REF>.supabase.co';
  v_secret text := '<CRON_SECRET>';
  v_id     uuid;
BEGIN
  IF position('<' IN v_url) > 0 OR position('<' IN v_secret) > 0 THEN
    RAISE EXCEPTION 'Remplacez <PROJECT_REF> et <CRON_SECRET> par vos valeurs avant d''exécuter ce script.';
  END IF;
  IF length(v_secret) < 24 THEN
    RAISE EXCEPTION 'CRON_SECRET trop court (24 caractères minimum).';
  END IF;

  SELECT id INTO v_id FROM vault.secrets WHERE name = 'gaulois_project_url';
  IF v_id IS NULL THEN PERFORM vault.create_secret(v_url, 'gaulois_project_url');
  ELSE PERFORM vault.update_secret(v_id, v_url); END IF;

  SELECT id INTO v_id FROM vault.secrets WHERE name = 'gaulois_cron_secret';
  IF v_id IS NULL THEN PERFORM vault.create_secret(v_secret, 'gaulois_cron_secret');
  ELSE PERFORM vault.update_secret(v_id, v_secret); END IF;
END;
$$;

-- Appelle daily-world-sync avec le mode demandé
CREATE OR REPLACE FUNCTION gaulois_call_world_sync(p_mode text) RETURNS bigint
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT net.http_post(
    url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'gaulois_project_url') || '/functions/v1/daily-world-sync',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'gaulois_cron_secret')),
    body := jsonb_build_object('mode', p_mode),
    timeout_milliseconds := 120000
  );
$$;
REVOKE ALL ON FUNCTION gaulois_call_world_sync(text) FROM PUBLIC, anon, authenticated;

-- Chaque nuit à 23:05 UTC (00:05 à Madrid en hiver, 01:05 en été) : sauvegarde, météo, RSS, Gazette...
-- (cron.schedule met à jour une tâche existante du même nom)
SELECT cron.schedule('gaulois-nightly', '5 23 * * *', $$SELECT gaulois_call_world_sync('nightly')$$);

-- Toutes les 15 minutes : clôture de l'Agora (dimanche 11:00), exécution après veto, duels abandonnés,
-- sauvegarde pré-Agora du dimanche matin. N'écrit rien s'il n'y a rien à faire.
SELECT cron.schedule('gaulois-maintenance', '*/15 * * * *', $$SELECT gaulois_call_world_sync('maintenance')$$);

-- Vérification : SELECT jobid, jobname, schedule, active FROM cron.job;
-- Historique   : SELECT * FROM cron.job_run_details ORDER BY start_time DESC LIMIT 20;
-- Réponses HTTP : SELECT id, status_code, left(content, 200) FROM net._http_response ORDER BY id DESC LIMIT 10;
-- Désactivation : SELECT cron.unschedule('gaulois-maintenance'); SELECT cron.unschedule('gaulois-nightly');
