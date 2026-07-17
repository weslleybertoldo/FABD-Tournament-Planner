
CREATE SCHEMA IF NOT EXISTS staging;
CREATE TABLE IF NOT EXISTS staging.federations   (LIKE public.federations   INCLUDING ALL);
CREATE TABLE IF NOT EXISTS staging.organizers    (LIKE public.organizers    INCLUDING ALL);
CREATE TABLE IF NOT EXISTS staging.referees      (LIKE public.referees      INCLUDING ALL);
CREATE TABLE IF NOT EXISTS staging.tournaments   (LIKE public.tournaments   INCLUDING ALL);
CREATE TABLE IF NOT EXISTS staging.live_matches  (LIKE public.live_matches  INCLUDING ALL);
CREATE TABLE IF NOT EXISTS staging.live_scores   (LIKE public.live_scores   INCLUDING ALL);

ALTER TABLE staging.federations  ENABLE ROW LEVEL SECURITY;
ALTER TABLE staging.organizers   ENABLE ROW LEVEL SECURITY;
ALTER TABLE staging.referees     ENABLE ROW LEVEL SECURITY;
ALTER TABLE staging.tournaments  ENABLE ROW LEVEL SECURITY;
ALTER TABLE staging.live_matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE staging.live_scores  ENABLE ROW LEVEL SECURITY;

-- Leitura publica apenas no que o site ao vivo consome
DROP POLICY IF EXISTS s_select_public ON staging.federations;
CREATE POLICY s_select_public ON staging.federations  FOR SELECT USING (true);
DROP POLICY IF EXISTS s_select_public ON staging.tournaments;
CREATE POLICY s_select_public ON staging.tournaments  FOR SELECT USING (true);
DROP POLICY IF EXISTS s_select_public ON staging.live_matches;
CREATE POLICY s_select_public ON staging.live_matches FOR SELECT USING (true);
DROP POLICY IF EXISTS s_select_public ON staging.live_scores;
CREATE POLICY s_select_public ON staging.live_scores  FOR SELECT USING (true);
DROP POLICY IF EXISTS s_select_auth ON staging.organizers;
CREATE POLICY s_select_auth ON staging.organizers FOR SELECT USING (auth.role() IN ('authenticated','service_role'));
DROP POLICY IF EXISTS s_select_auth ON staging.referees;
CREATE POLICY s_select_auth ON staging.referees   FOR SELECT USING (auth.role() IN ('authenticated','service_role'));

-- Escrita: ambiente de TESTE — service_role e authenticated (sem matriz fina de prod)
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['federations','organizers','referees','tournaments','live_matches','live_scores'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS s_write_auth ON staging.%I', t);
    EXECUTE format('CREATE POLICY s_write_auth ON staging.%I FOR ALL USING (auth.role() IN (''authenticated'',''service_role'')) WITH CHECK (auth.role() IN (''authenticated'',''service_role''))', t);
  END LOOP;
END $$;

GRANT USAGE ON SCHEMA staging TO anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA staging TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA staging GRANT ALL ON TABLES TO anon, authenticated, service_role;

-- Realtime para o site/app beta
ALTER PUBLICATION supabase_realtime ADD TABLE staging.live_matches;
ALTER PUBLICATION supabase_realtime ADD TABLE staging.live_scores;

-- Seed: dados de referencia (federacao, organizadores, arbitros) copiados de prod
INSERT INTO staging.federations SELECT * FROM public.federations ON CONFLICT DO NOTHING;
INSERT INTO staging.organizers  SELECT * FROM public.organizers  ON CONFLICT DO NOTHING;
INSERT INTO staging.referees    SELECT * FROM public.referees    ON CONFLICT DO NOTHING;
