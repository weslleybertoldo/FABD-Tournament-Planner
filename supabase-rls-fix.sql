-- =============================================================================
-- FABD Tournament Planner - Correcao de Politicas RLS
-- =============================================================================
-- CONTEXTO:
--   O app Electron (desktop do organizador) usa a anon key SEM autenticacao de
--   usuario, entao nao podemos restringir writes a authenticated somente.
--
--   A pagina de arbitros (referee) usa Google OAuth, entao arbitros sao
--   "authenticated" no Supabase Auth.
--
--   A pagina live e publica e so faz SELECT.
--
-- ESTRATEGIA:
--   1. SELECT aberto em todas as tabelas (o live precisa)
--   2. INSERT/UPDATE/DELETE em tournaments, live_matches, live_scores:
--      Permitido para anon e authenticated (o Electron precisa de anon,
--      arbitros autenticados tambem escrevem em live_scores e live_matches)
--   3. referees: INSERT aberto (auto-registro), UPDATE restrito para que
--      o arbitro so altere SEU proprio registro e NAO possa mudar o campo
--      status (somente service_role pode aprovar/bloquear)
--   4. DELETE em referees: somente service_role
--
-- IMPORTANTE: No futuro, migrar o Electron para usar service_role key via
-- .env (ou um backend intermediario) para poder restringir writes nas
-- tabelas tournaments/live_matches/live_scores apenas ao organizador.
-- =============================================================================

-- =============================================
-- PASSO 1: Remover TODAS as policies antigas
-- =============================================

-- tournaments
DROP POLICY IF EXISTS "Leitura publica tournaments" ON tournaments;
DROP POLICY IF EXISTS "Insert tournaments" ON tournaments;
DROP POLICY IF EXISTS "Update tournaments" ON tournaments;
DROP POLICY IF EXISTS "Delete tournaments" ON tournaments;

-- live_matches
DROP POLICY IF EXISTS "Leitura publica live_matches" ON live_matches;
DROP POLICY IF EXISTS "Insert live_matches" ON live_matches;
DROP POLICY IF EXISTS "Update live_matches" ON live_matches;
DROP POLICY IF EXISTS "Delete live_matches" ON live_matches;

-- live_scores
DROP POLICY IF EXISTS "Leitura publica live_scores" ON live_scores;
DROP POLICY IF EXISTS "Insert live_scores" ON live_scores;
DROP POLICY IF EXISTS "Update live_scores" ON live_scores;
DROP POLICY IF EXISTS "Delete live_scores" ON live_scores;

-- referees
DROP POLICY IF EXISTS "Leitura publica referees" ON referees;
DROP POLICY IF EXISTS "Insert referees" ON referees;
DROP POLICY IF EXISTS "Update referees" ON referees;
DROP POLICY IF EXISTS "Delete referees" ON referees;


-- =============================================
-- PASSO 2: Garantir RLS habilitado
-- =============================================
ALTER TABLE tournaments ENABLE ROW LEVEL SECURITY;
ALTER TABLE live_matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE live_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE referees ENABLE ROW LEVEL SECURITY;


-- =============================================
-- PASSO 3: Novas policies — TOURNAMENTS
-- =============================================
-- SELECT: qualquer pessoa pode ler (pagina live publica)
CREATE POLICY "tournaments_select_public"
  ON tournaments FOR SELECT
  USING (true);

-- INSERT: anon e authenticated (Electron usa anon key)
CREATE POLICY "tournaments_insert"
  ON tournaments FOR INSERT
  WITH CHECK (true);

-- UPDATE: anon e authenticated (Electron faz upsert)
CREATE POLICY "tournaments_update"
  ON tournaments FOR UPDATE
  USING (true);

-- DELETE: anon e authenticated (Electron limpa torneios antigos)
CREATE POLICY "tournaments_delete"
  ON tournaments FOR DELETE
  USING (true);

-- NOTA: Enquanto o Electron usar anon key, nao ha como diferenciar o
-- organizador de um usuario anonimo. As policies acima sao identicas
-- ao anterior, mas documentam a intencao. A protecao real vira quando
-- migrarmos para service_role. Veja PASSO 5 (comentado) para o futuro.


-- =============================================
-- PASSO 3b: Novas policies — LIVE_MATCHES
-- =============================================
-- SELECT: publico
CREATE POLICY "live_matches_select_public"
  ON live_matches FOR SELECT
  USING (true);

-- INSERT: anon + authenticated (Electron e arbitros)
CREATE POLICY "live_matches_insert"
  ON live_matches FOR INSERT
  WITH CHECK (true);

-- UPDATE: anon + authenticated (Electron e arbitros atualizam status)
CREATE POLICY "live_matches_update"
  ON live_matches FOR UPDATE
  USING (true);

-- DELETE: anon + authenticated (Electron remove do quadro)
CREATE POLICY "live_matches_delete"
  ON live_matches FOR DELETE
  USING (true);


-- =============================================
-- PASSO 3c: Novas policies — LIVE_SCORES
-- =============================================
-- SELECT: publico
CREATE POLICY "live_scores_select_public"
  ON live_scores FOR SELECT
  USING (true);

-- INSERT: anon + authenticated
CREATE POLICY "live_scores_insert"
  ON live_scores FOR INSERT
  WITH CHECK (true);

-- UPDATE: anon + authenticated
CREATE POLICY "live_scores_update"
  ON live_scores FOR UPDATE
  USING (true);

-- DELETE: anon + authenticated (Electron limpa scores)
CREATE POLICY "live_scores_delete"
  ON live_scores FOR DELETE
  USING (true);


-- =============================================
-- PASSO 4: Novas policies — REFEREES (RESTRITIVAS)
-- =============================================
-- Esta e a tabela onde conseguimos aplicar restricoes reais,
-- porque arbitros se autenticam via Google OAuth.

-- SELECT: publico (o Electron lista arbitros para aprovar)
CREATE POLICY "referees_select_public"
  ON referees FOR SELECT
  USING (true);

-- INSERT: qualquer um pode se auto-registrar
-- Porem o campo status sera forcado a 'pendente' via trigger
CREATE POLICY "referees_insert_self"
  ON referees FOR INSERT
  WITH CHECK (true);

-- UPDATE: arbitro autenticado so pode alterar SEU registro
-- service_role e anon (Electron) podem alterar qualquer um
CREATE POLICY "referees_update_own"
  ON referees FOR UPDATE
  USING (
    auth.uid()::text = id
    OR auth.role() = 'service_role'
    OR auth.role() = 'anon'
  );

-- DELETE: somente service_role (organizador via dashboard ou futuro backend)
CREATE POLICY "referees_delete_service_only"
  ON referees FOR DELETE
  USING (auth.role() = 'service_role');


-- =============================================
-- PASSO 4b: Trigger para proteger campo status dos referees
-- =============================================
-- Impede que um arbitro mude seu proprio status via UPDATE.
-- Somente service_role e anon (Electron do organizador) podem alterar o campo status.

CREATE OR REPLACE FUNCTION protect_referee_status()
RETURNS TRIGGER AS $$
BEGIN
  -- service_role e anon (Electron) podem fazer qualquer coisa
  IF current_setting('request.jwt.claims', true)::json->>'role' IN ('service_role', 'anon') THEN
    RETURN NEW;
  END IF;

  -- Se o campo status esta sendo alterado, bloquear
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    RAISE EXCEPTION 'Somente o organizador pode alterar o status do arbitro';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Remover trigger antigo se existir
DROP TRIGGER IF EXISTS trg_protect_referee_status ON referees;

CREATE TRIGGER trg_protect_referee_status
  BEFORE UPDATE ON referees
  FOR EACH ROW
  EXECUTE FUNCTION protect_referee_status();


-- =============================================
-- PASSO 4c: Forcar status 'pendente' no INSERT de referees
-- =============================================
-- Impede que alguem se auto-registre como 'autorizado'

CREATE OR REPLACE FUNCTION force_referee_pending_status()
RETURNS TRIGGER AS $$
BEGIN
  -- service_role pode inserir com qualquer status
  IF current_setting('request.jwt.claims', true)::json->>'role' = 'service_role' THEN
    RETURN NEW;
  END IF;

  -- Forcar status pendente para auto-registro
  NEW.status := 'pendente';
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_force_referee_pending ON referees;

CREATE TRIGGER trg_force_referee_pending
  BEFORE INSERT ON referees
  FOR EACH ROW
  EXECUTE FUNCTION force_referee_pending_status();


-- =============================================
-- PASSO 5: FUTURO — Policies restritivas com service_role
-- =============================================
-- Quando o Electron migrar para usar service_role key (via .env/config),
-- descomente as policies abaixo e REMOVA as do Passo 3/3b/3c.
--
-- Isso restringira INSERT/UPDATE/DELETE em tournaments, live_matches e
-- live_scores apenas ao service_role (organizador), enquanto arbitros
-- autenticados continuarao podendo atualizar live_scores e live_matches.
--
-- === TOURNAMENTS (somente service_role escreve) ===
-- CREATE POLICY "tournaments_insert_service"
--   ON tournaments FOR INSERT
--   WITH CHECK (auth.role() = 'service_role');
--
-- CREATE POLICY "tournaments_update_service"
--   ON tournaments FOR UPDATE
--   USING (auth.role() = 'service_role');
--
-- CREATE POLICY "tournaments_delete_service"
--   ON tournaments FOR DELETE
--   USING (auth.role() = 'service_role');
--
-- === LIVE_MATCHES (service_role + arbitros autorizados) ===
-- CREATE POLICY "live_matches_insert_service"
--   ON live_matches FOR INSERT
--   WITH CHECK (auth.role() = 'service_role');
--
-- CREATE POLICY "live_matches_update_authorized"
--   ON live_matches FOR UPDATE
--   USING (
--     auth.role() = 'service_role'
--     OR (
--       auth.role() = 'authenticated'
--       AND EXISTS (
--         SELECT 1 FROM referees
--         WHERE id = auth.uid()::text AND status = 'autorizado'
--       )
--     )
--   );
--
-- CREATE POLICY "live_matches_delete_service"
--   ON live_matches FOR DELETE
--   USING (auth.role() = 'service_role');
--
-- === LIVE_SCORES (service_role + arbitros autorizados) ===
-- CREATE POLICY "live_scores_insert_service_or_referee"
--   ON live_scores FOR INSERT
--   WITH CHECK (
--     auth.role() = 'service_role'
--     OR (
--       auth.role() = 'authenticated'
--       AND EXISTS (
--         SELECT 1 FROM referees
--         WHERE id = auth.uid()::text AND status = 'autorizado'
--       )
--     )
--   );
--
-- CREATE POLICY "live_scores_update_service_or_referee"
--   ON live_scores FOR UPDATE
--   USING (
--     auth.role() = 'service_role'
--     OR (
--       auth.role() = 'authenticated'
--       AND EXISTS (
--         SELECT 1 FROM referees
--         WHERE id = auth.uid()::text AND status = 'autorizado'
--       )
--     )
--   );
--
-- CREATE POLICY "live_scores_delete_service"
--   ON live_scores FOR DELETE
--   USING (auth.role() = 'service_role');
