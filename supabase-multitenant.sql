-- ============================================================
-- FASE 1: MULTI-TENANCY — Federacoes
-- ============================================================
-- Modelo:
--   federations (UUID + slug)
--   organizers.federation_id UUID -> federations.id
--   tournaments.federation_id UUID -> federations.id (denormalizado)
--   live_matches/live_scores/referees.federation_id UUID
--
-- Roles em organizers:
--   'super_admin' = global, gerencia todas federacoes (federation_id NULL)
--   'admin' = admin da propria federacao
--   'organizer' = organizador comum da federacao
-- ============================================================

-- ============================================
-- 1. TABELA federations
-- ============================================
CREATE TABLE IF NOT EXISTS federations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  short_name TEXT NOT NULL,
  state TEXT NOT NULL,
  city TEXT,
  logo_url TEXT,
  primary_color TEXT DEFAULT '#1E3A8A',
  secondary_color TEXT DEFAULT '#C41E2A',
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT slug_format CHECK (slug ~ '^[a-z0-9-]+$' AND length(slug) BETWEEN 2 AND 20)
);

ALTER TABLE federations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "federations_select_public" ON federations;
CREATE POLICY "federations_select_public" ON federations FOR SELECT USING (true);

DROP POLICY IF EXISTS "federations_write_super_admin" ON federations;
CREATE POLICY "federations_write_super_admin" ON federations FOR INSERT
  WITH CHECK (
    auth.role() = 'service_role'
    OR EXISTS (SELECT 1 FROM organizers WHERE email = lower(coalesce(auth.email(),'')) AND active AND role = 'super_admin')
  );

DROP POLICY IF EXISTS "federations_update_super_admin" ON federations;
CREATE POLICY "federations_update_super_admin" ON federations FOR UPDATE
  USING (
    auth.role() = 'service_role'
    OR EXISTS (SELECT 1 FROM organizers WHERE email = lower(coalesce(auth.email(),'')) AND active AND role = 'super_admin')
  );

DROP POLICY IF EXISTS "federations_delete_super_admin" ON federations;
CREATE POLICY "federations_delete_super_admin" ON federations FOR DELETE
  USING (
    auth.role() = 'service_role'
    OR EXISTS (SELECT 1 FROM organizers WHERE email = lower(coalesce(auth.email(),'')) AND active AND role = 'super_admin')
  );


-- ============================================
-- 2. BOOTSTRAP — federacao FABD-AL
-- ============================================
INSERT INTO federations (slug, name, short_name, state, city, primary_color, secondary_color)
VALUES ('fabd', 'Federacao Alagoana de Badminton', 'FABD', 'AL', 'Maceio', '#1E3A8A', '#C41E2A')
ON CONFLICT (slug) DO NOTHING;


-- ============================================
-- 3. ALTER organizers — federation_id + role super_admin
-- ============================================
ALTER TABLE organizers ADD COLUMN IF NOT EXISTS federation_id UUID REFERENCES federations(id) ON DELETE RESTRICT;

-- Atualizar CHECK do role para incluir super_admin
ALTER TABLE organizers DROP CONSTRAINT IF EXISTS organizers_role_check;
ALTER TABLE organizers ADD CONSTRAINT organizers_role_check
  CHECK (role IN ('super_admin', 'admin', 'organizer'));

-- Backfill: organizers existentes -> FABD
UPDATE organizers
SET federation_id = (SELECT id FROM federations WHERE slug = 'fabd')
WHERE federation_id IS NULL;

-- Promover Weslley a super_admin
UPDATE organizers SET role = 'super_admin', federation_id = NULL
WHERE email = 'weslleybertoldo18@gmail.com';

-- CHECK: federation_id NOT NULL exceto para super_admin
ALTER TABLE organizers DROP CONSTRAINT IF EXISTS organizers_federation_required;
ALTER TABLE organizers ADD CONSTRAINT organizers_federation_required
  CHECK (role = 'super_admin' OR federation_id IS NOT NULL);


-- ============================================
-- 4. ALTER tournaments — federation_id NOT NULL
-- ============================================
ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS federation_id UUID REFERENCES federations(id) ON DELETE RESTRICT;

UPDATE tournaments
SET federation_id = (SELECT id FROM federations WHERE slug = 'fabd')
WHERE federation_id IS NULL;

ALTER TABLE tournaments ALTER COLUMN federation_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS tournaments_federation_idx ON tournaments(federation_id);


-- ============================================
-- 5. ALTER live_matches — federation_id desnormalizado
-- ============================================
ALTER TABLE live_matches ADD COLUMN IF NOT EXISTS federation_id UUID REFERENCES federations(id) ON DELETE RESTRICT;

UPDATE live_matches SET federation_id = (
  SELECT t.federation_id FROM tournaments t WHERE t.id = live_matches.tournament_id
)
WHERE federation_id IS NULL;

ALTER TABLE live_matches ALTER COLUMN federation_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS live_matches_federation_idx ON live_matches(federation_id);


-- ============================================
-- 6. ALTER live_scores — federation_id desnormalizado
-- ============================================
ALTER TABLE live_scores ADD COLUMN IF NOT EXISTS federation_id UUID REFERENCES federations(id) ON DELETE RESTRICT;

UPDATE live_scores SET federation_id = (
  SELECT t.federation_id FROM tournaments t WHERE t.id = live_scores.tournament_id
)
WHERE federation_id IS NULL;

ALTER TABLE live_scores ALTER COLUMN federation_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS live_scores_federation_idx ON live_scores(federation_id);


-- ============================================
-- 7. ALTER referees — federation_id (pode ser NULL na auto-registro)
-- ============================================
ALTER TABLE referees ADD COLUMN IF NOT EXISTS federation_id UUID REFERENCES federations(id) ON DELETE RESTRICT;

-- Referees existentes (se houver) -> FABD
UPDATE referees
SET federation_id = (SELECT id FROM federations WHERE slug = 'fabd')
WHERE federation_id IS NULL;

CREATE INDEX IF NOT EXISTS referees_federation_idx ON referees(federation_id);


-- ============================================
-- 8. HELPERS atualizados
-- ============================================

-- Organizador autorizado para ESTA federacao? (super_admin sempre passa)
CREATE OR REPLACE FUNCTION can_write_federation(fed_id UUID) RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM organizers
    WHERE email = lower(coalesce(auth.email(),''))
      AND active
      AND (role = 'super_admin' OR federation_id = fed_id)
  );
$$ LANGUAGE sql STABLE;


-- ============================================
-- 9. RLS POLICIES — tournaments scoped por federacao
-- ============================================
DROP POLICY IF EXISTS "tournaments_insert_org" ON tournaments;
DROP POLICY IF EXISTS "tournaments_update_org" ON tournaments;
DROP POLICY IF EXISTS "tournaments_delete_org" ON tournaments;

CREATE POLICY "tournaments_insert_fed" ON tournaments FOR INSERT
  WITH CHECK (auth.role() = 'service_role' OR can_write_federation(federation_id));
CREATE POLICY "tournaments_update_fed" ON tournaments FOR UPDATE
  USING (auth.role() = 'service_role' OR can_write_federation(federation_id));
CREATE POLICY "tournaments_delete_fed" ON tournaments FOR DELETE
  USING (auth.role() = 'service_role' OR can_write_federation(federation_id));


-- ============================================
-- 10. RLS POLICIES — live_matches
-- ============================================
DROP POLICY IF EXISTS "live_matches_insert_org" ON live_matches;
DROP POLICY IF EXISTS "live_matches_update_org_or_referee" ON live_matches;
DROP POLICY IF EXISTS "live_matches_delete_org" ON live_matches;

CREATE POLICY "live_matches_insert_fed" ON live_matches FOR INSERT
  WITH CHECK (auth.role() = 'service_role' OR can_write_federation(federation_id));

CREATE POLICY "live_matches_update_fed_or_referee" ON live_matches FOR UPDATE
  USING (
    auth.role() = 'service_role'
    OR can_write_federation(federation_id)
    OR (auth.role() = 'authenticated' AND EXISTS (
      SELECT 1 FROM referees r
      WHERE r.id = auth.uid()::text
        AND r.status = 'autorizado'
        AND r.federation_id = live_matches.federation_id
    ))
  );

CREATE POLICY "live_matches_delete_fed" ON live_matches FOR DELETE
  USING (auth.role() = 'service_role' OR can_write_federation(federation_id));


-- ============================================
-- 11. RLS POLICIES — live_scores
-- ============================================
DROP POLICY IF EXISTS "live_scores_insert_org_or_referee" ON live_scores;
DROP POLICY IF EXISTS "live_scores_update_org_or_referee" ON live_scores;
DROP POLICY IF EXISTS "live_scores_delete_org" ON live_scores;

CREATE POLICY "live_scores_insert_fed_or_referee" ON live_scores FOR INSERT
  WITH CHECK (
    auth.role() = 'service_role'
    OR can_write_federation(federation_id)
    OR (auth.role() = 'authenticated' AND EXISTS (
      SELECT 1 FROM referees r
      WHERE r.id = auth.uid()::text
        AND r.status = 'autorizado'
        AND r.federation_id = live_scores.federation_id
    ))
  );

CREATE POLICY "live_scores_update_fed_or_referee" ON live_scores FOR UPDATE
  USING (
    auth.role() = 'service_role'
    OR can_write_federation(federation_id)
    OR (auth.role() = 'authenticated' AND EXISTS (
      SELECT 1 FROM referees r
      WHERE r.id = auth.uid()::text
        AND r.status = 'autorizado'
        AND r.federation_id = live_scores.federation_id
    ))
  );

CREATE POLICY "live_scores_delete_fed" ON live_scores FOR DELETE
  USING (auth.role() = 'service_role' OR can_write_federation(federation_id));


-- ============================================
-- 12. RLS POLICIES — referees
-- ============================================
DROP POLICY IF EXISTS "referees_update_own_or_org" ON referees;
DROP POLICY IF EXISTS "referees_delete_org_only" ON referees;

CREATE POLICY "referees_update_own_or_fed" ON referees FOR UPDATE
  USING (
    auth.uid()::text = id
    OR auth.role() = 'service_role'
    OR (federation_id IS NOT NULL AND can_write_federation(federation_id))
    OR EXISTS (SELECT 1 FROM organizers WHERE email = lower(coalesce(auth.email(),'')) AND active AND role = 'super_admin')
  );

CREATE POLICY "referees_delete_fed" ON referees FOR DELETE
  USING (
    auth.role() = 'service_role'
    OR (federation_id IS NOT NULL AND can_write_federation(federation_id))
    OR EXISTS (SELECT 1 FROM organizers WHERE email = lower(coalesce(auth.email(),'')) AND active AND role = 'super_admin')
  );


-- ============================================
-- 13. RLS POLICIES — organizers
-- ============================================
-- Super_admin gerencia todos; admin de federacao gerencia da propria federacao
DROP POLICY IF EXISTS "organizers_insert_service" ON organizers;
DROP POLICY IF EXISTS "organizers_update_service_or_self" ON organizers;
DROP POLICY IF EXISTS "organizers_delete_service" ON organizers;

CREATE POLICY "organizers_insert_admin" ON organizers FOR INSERT
  WITH CHECK (
    auth.role() = 'service_role'
    OR EXISTS (
      SELECT 1 FROM organizers o
      WHERE o.email = lower(coalesce(auth.email(),''))
        AND o.active
        AND (
          o.role = 'super_admin'
          OR (o.role = 'admin' AND o.federation_id = organizers.federation_id)
        )
    )
  );

CREATE POLICY "organizers_update_admin_or_self" ON organizers FOR UPDATE
  USING (
    auth.role() = 'service_role'
    OR lower(coalesce(auth.email(),'')) = email  -- proprio organizador (last_login_at)
    OR EXISTS (
      SELECT 1 FROM organizers o
      WHERE o.email = lower(coalesce(auth.email(),''))
        AND o.active
        AND (
          o.role = 'super_admin'
          OR (o.role = 'admin' AND o.federation_id = organizers.federation_id)
        )
    )
  );

CREATE POLICY "organizers_delete_admin" ON organizers FOR DELETE
  USING (
    auth.role() = 'service_role'
    OR EXISTS (
      SELECT 1 FROM organizers o
      WHERE o.email = lower(coalesce(auth.email(),''))
        AND o.active
        AND (
          o.role = 'super_admin'
          OR (o.role = 'admin' AND o.federation_id = organizers.federation_id)
        )
    )
  );


-- ============================================
-- 14. Trigger protect_referee_status — atualizar pra reconhecer super_admin
-- ============================================
CREATE OR REPLACE FUNCTION protect_referee_status()
RETURNS TRIGGER AS $$
DECLARE
  r TEXT;
  email_caller TEXT;
  is_authorized BOOLEAN;
BEGIN
  r := current_setting('request.jwt.claims', true)::json->>'role';
  email_caller := lower(coalesce(current_setting('request.jwt.claims', true)::json->>'email',''));
  IF r = 'service_role' THEN
    RETURN NEW;
  END IF;
  is_authorized := EXISTS (
    SELECT 1 FROM organizers
    WHERE email = email_caller
      AND active
      AND (role = 'super_admin' OR federation_id = NEW.federation_id)
  );
  IF is_authorized THEN
    RETURN NEW;
  END IF;
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    RAISE EXCEPTION 'Somente o organizador pode alterar o status do arbitro';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
