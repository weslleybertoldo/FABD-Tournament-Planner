-- ============================================================
-- PASSO 5: Restringir writes a service_role + arbitros autorizados
-- Aplicar APOS supabase-rls-fix.sql ja estar em vigor.
-- ============================================================

-- TOURNAMENTS — somente service_role escreve
DROP POLICY IF EXISTS "tournaments_insert" ON tournaments;
DROP POLICY IF EXISTS "tournaments_update" ON tournaments;
DROP POLICY IF EXISTS "tournaments_delete" ON tournaments;

CREATE POLICY "tournaments_insert_service" ON tournaments FOR INSERT
  WITH CHECK (auth.role() = 'service_role');
CREATE POLICY "tournaments_update_service" ON tournaments FOR UPDATE
  USING (auth.role() = 'service_role');
CREATE POLICY "tournaments_delete_service" ON tournaments FOR DELETE
  USING (auth.role() = 'service_role');


-- LIVE_MATCHES — service_role escreve livre; arbitros autorizados podem UPDATE
DROP POLICY IF EXISTS "live_matches_insert" ON live_matches;
DROP POLICY IF EXISTS "live_matches_update" ON live_matches;
DROP POLICY IF EXISTS "live_matches_delete" ON live_matches;

CREATE POLICY "live_matches_insert_service" ON live_matches FOR INSERT
  WITH CHECK (auth.role() = 'service_role');
CREATE POLICY "live_matches_update_authorized" ON live_matches FOR UPDATE
  USING (
    auth.role() = 'service_role'
    OR (auth.role() = 'authenticated' AND EXISTS (
      SELECT 1 FROM referees WHERE id = auth.uid()::text AND status = 'autorizado'
    ))
  );
CREATE POLICY "live_matches_delete_service" ON live_matches FOR DELETE
  USING (auth.role() = 'service_role');


-- LIVE_SCORES — service_role escreve livre; arbitros autorizados podem INSERT/UPDATE
DROP POLICY IF EXISTS "live_scores_insert" ON live_scores;
DROP POLICY IF EXISTS "live_scores_update" ON live_scores;
DROP POLICY IF EXISTS "live_scores_delete" ON live_scores;

CREATE POLICY "live_scores_insert_service_or_referee" ON live_scores FOR INSERT
  WITH CHECK (
    auth.role() = 'service_role'
    OR (auth.role() = 'authenticated' AND EXISTS (
      SELECT 1 FROM referees WHERE id = auth.uid()::text AND status = 'autorizado'
    ))
  );
CREATE POLICY "live_scores_update_service_or_referee" ON live_scores FOR UPDATE
  USING (
    auth.role() = 'service_role'
    OR (auth.role() = 'authenticated' AND EXISTS (
      SELECT 1 FROM referees WHERE id = auth.uid()::text AND status = 'autorizado'
    ))
  );
CREATE POLICY "live_scores_delete_service" ON live_scores FOR DELETE
  USING (auth.role() = 'service_role');


-- REFEREES — desktop nao usa mais anon (agora usa service_role)
DROP POLICY IF EXISTS "referees_update_own" ON referees;
CREATE POLICY "referees_update_own_or_service" ON referees FOR UPDATE
  USING (
    auth.uid()::text = id
    OR auth.role() = 'service_role'
  );


-- Atualizar trigger de protecao de status: anon NAO mais permitido
CREATE OR REPLACE FUNCTION protect_referee_status()
RETURNS TRIGGER AS $$
BEGIN
  IF current_setting('request.jwt.claims', true)::json->>'role' = 'service_role' THEN
    RETURN NEW;
  END IF;
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    RAISE EXCEPTION 'Somente o organizador pode alterar o status do arbitro';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
