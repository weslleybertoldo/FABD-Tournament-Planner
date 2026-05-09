-- ============================================================
-- ORGANIZERS — Lista branca de organizadores autorizados
-- ============================================================
-- Substitui a necessidade de service_role no client.
-- Login: OTP por email (Supabase Auth) -> verifica se email esta nesta tabela.
-- ============================================================

CREATE TABLE IF NOT EXISTS organizers (
  email TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'organizer' CHECK (role IN ('admin', 'organizer')),
  active BOOLEAN NOT NULL DEFAULT true,
  state TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_login_at TIMESTAMPTZ
);

-- Normalizar email pra lowercase
CREATE OR REPLACE FUNCTION lower_organizer_email() RETURNS TRIGGER AS $$
BEGIN
  NEW.email = lower(trim(NEW.email));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_lower_organizer_email ON organizers;
CREATE TRIGGER trg_lower_organizer_email
  BEFORE INSERT OR UPDATE ON organizers
  FOR EACH ROW EXECUTE FUNCTION lower_organizer_email();

ALTER TABLE organizers ENABLE ROW LEVEL SECURITY;

-- SELECT publico (app precisa checar se voce e organizador)
DROP POLICY IF EXISTS "organizers_select_public" ON organizers;
CREATE POLICY "organizers_select_public" ON organizers FOR SELECT USING (true);

-- Apenas service_role gerencia (admin via SQL ou painel)
DROP POLICY IF EXISTS "organizers_insert_service" ON organizers;
CREATE POLICY "organizers_insert_service" ON organizers FOR INSERT
  WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS "organizers_update_service_or_self" ON organizers;
CREATE POLICY "organizers_update_service_or_self" ON organizers FOR UPDATE
  USING (
    auth.role() = 'service_role'
    OR lower(auth.email()) = email  -- proprio organizador atualiza last_login_at
  );

DROP POLICY IF EXISTS "organizers_delete_service" ON organizers;
CREATE POLICY "organizers_delete_service" ON organizers FOR DELETE
  USING (auth.role() = 'service_role');


-- ============================================================
-- BOOTSTRAP — primeiro admin (Weslley)
-- ============================================================
INSERT INTO organizers (email, name, role, state)
VALUES ('weslleybertoldo18@gmail.com', 'Weslley Bertoldo', 'admin', 'AL')
ON CONFLICT (email) DO UPDATE SET active = true, role = 'admin';


-- ============================================================
-- ATUALIZAR POLICIES de tournaments/live_matches/live_scores
-- Aceitar agora: service_role OU usuario autenticado em organizers
-- ============================================================

-- Helper: organizador autorizado?
CREATE OR REPLACE FUNCTION is_active_organizer() RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM organizers
    WHERE email = lower(coalesce(auth.email(),''))
      AND active = true
  );
$$ LANGUAGE sql STABLE;

-- TOURNAMENTS
DROP POLICY IF EXISTS "tournaments_insert_service" ON tournaments;
DROP POLICY IF EXISTS "tournaments_update_service" ON tournaments;
DROP POLICY IF EXISTS "tournaments_delete_service" ON tournaments;

CREATE POLICY "tournaments_insert_org" ON tournaments FOR INSERT
  WITH CHECK (auth.role() = 'service_role' OR is_active_organizer());
CREATE POLICY "tournaments_update_org" ON tournaments FOR UPDATE
  USING (auth.role() = 'service_role' OR is_active_organizer());
CREATE POLICY "tournaments_delete_org" ON tournaments FOR DELETE
  USING (auth.role() = 'service_role' OR is_active_organizer());

-- LIVE_MATCHES
DROP POLICY IF EXISTS "live_matches_insert_service" ON live_matches;
DROP POLICY IF EXISTS "live_matches_update_authorized" ON live_matches;
DROP POLICY IF EXISTS "live_matches_delete_service" ON live_matches;

CREATE POLICY "live_matches_insert_org" ON live_matches FOR INSERT
  WITH CHECK (auth.role() = 'service_role' OR is_active_organizer());
CREATE POLICY "live_matches_update_org_or_referee" ON live_matches FOR UPDATE
  USING (
    auth.role() = 'service_role'
    OR is_active_organizer()
    OR (auth.role() = 'authenticated' AND EXISTS (
      SELECT 1 FROM referees WHERE id = auth.uid()::text AND status = 'autorizado'
    ))
  );
CREATE POLICY "live_matches_delete_org" ON live_matches FOR DELETE
  USING (auth.role() = 'service_role' OR is_active_organizer());

-- LIVE_SCORES
DROP POLICY IF EXISTS "live_scores_insert_service_or_referee" ON live_scores;
DROP POLICY IF EXISTS "live_scores_update_service_or_referee" ON live_scores;
DROP POLICY IF EXISTS "live_scores_delete_service" ON live_scores;

CREATE POLICY "live_scores_insert_org_or_referee" ON live_scores FOR INSERT
  WITH CHECK (
    auth.role() = 'service_role'
    OR is_active_organizer()
    OR (auth.role() = 'authenticated' AND EXISTS (
      SELECT 1 FROM referees WHERE id = auth.uid()::text AND status = 'autorizado'
    ))
  );
CREATE POLICY "live_scores_update_org_or_referee" ON live_scores FOR UPDATE
  USING (
    auth.role() = 'service_role'
    OR is_active_organizer()
    OR (auth.role() = 'authenticated' AND EXISTS (
      SELECT 1 FROM referees WHERE id = auth.uid()::text AND status = 'autorizado'
    ))
  );
CREATE POLICY "live_scores_delete_org" ON live_scores FOR DELETE
  USING (auth.role() = 'service_role' OR is_active_organizer());

-- REFEREES — organizadores autorizados podem gerenciar arbitros
DROP POLICY IF EXISTS "referees_update_own_or_service" ON referees;
CREATE POLICY "referees_update_own_or_org" ON referees FOR UPDATE
  USING (
    auth.uid()::text = id
    OR auth.role() = 'service_role'
    OR is_active_organizer()
  );

DROP POLICY IF EXISTS "referees_delete_service_only" ON referees;
CREATE POLICY "referees_delete_org_only" ON referees FOR DELETE
  USING (auth.role() = 'service_role' OR is_active_organizer());

-- Atualizar trigger de protecao de status para reconhecer organizadores
CREATE OR REPLACE FUNCTION protect_referee_status()
RETURNS TRIGGER AS $$
DECLARE
  r TEXT;
  is_org BOOLEAN;
BEGIN
  r := current_setting('request.jwt.claims', true)::json->>'role';
  IF r = 'service_role' THEN
    RETURN NEW;
  END IF;
  is_org := EXISTS (
    SELECT 1 FROM organizers
    WHERE email = lower(coalesce(current_setting('request.jwt.claims', true)::json->>'email',''))
      AND active = true
  );
  IF is_org THEN
    RETURN NEW;
  END IF;
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    RAISE EXCEPTION 'Somente o organizador pode alterar o status do arbitro';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
