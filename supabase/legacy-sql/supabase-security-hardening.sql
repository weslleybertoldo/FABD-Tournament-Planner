-- supabase-security-hardening.sql
-- Aplicacao: 2026-04-16
-- Motivacao: auditoria 2026-04-16 identificou 3 criticos (C1+C2+C3).
-- Idempotente: seguro rodar multiplas vezes.

-- =========================================================================
-- C3: REVOKE writes de anon/authenticated em tabelas public
-- =========================================================================
-- Antes: anon/authenticated tinham INSERT/UPDATE/DELETE/TRUNCATE por padrao
-- do Supabase. RLS blindava, mas se uma policy futura quebrar, anon pode
-- destruir dados de producao.
-- Depois: anon so pode SELECT; authenticated pode SELECT/INSERT/UPDATE/DELETE
-- (RLS ainda filtra quais linhas). service_role mantem poder total.
-- =========================================================================

REVOKE INSERT, UPDATE, DELETE, TRUNCATE, TRIGGER, REFERENCES ON public.federations    FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, TRIGGER, REFERENCES ON public.tournaments    FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, TRIGGER, REFERENCES ON public.live_matches   FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, TRIGGER, REFERENCES ON public.live_scores    FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, TRIGGER, REFERENCES ON public.organizers     FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, TRIGGER, REFERENCES ON public.referees       FROM anon;

REVOKE TRUNCATE, TRIGGER, REFERENCES ON public.federations    FROM authenticated;
REVOKE TRUNCATE, TRIGGER, REFERENCES ON public.tournaments    FROM authenticated;
REVOKE TRUNCATE, TRIGGER, REFERENCES ON public.live_matches   FROM authenticated;
REVOKE TRUNCATE, TRIGGER, REFERENCES ON public.live_scores    FROM authenticated;
REVOKE TRUNCATE, TRIGGER, REFERENCES ON public.organizers     FROM authenticated;
REVOKE TRUNCATE, TRIGGER, REFERENCES ON public.referees       FROM authenticated;

-- authenticated MANTEM INSERT/UPDATE/DELETE porque arbitros autenticados
-- via Google OAuth e organizadores via OTP precisam escrever (RLS filtra).
-- anon mantem APENAS SELECT (dados publicos do live/tournaments/federations).

-- Confirmar SELECT preservado
GRANT SELECT ON public.federations  TO anon, authenticated;
GRANT SELECT ON public.tournaments  TO anon, authenticated;
GRANT SELECT ON public.live_matches TO anon, authenticated;
GRANT SELECT ON public.live_scores  TO anon, authenticated;
GRANT SELECT ON public.referees     TO anon, authenticated;
-- organizers: SELECT NAO e publico (restrito abaixo em C1).

GRANT INSERT, UPDATE, DELETE ON public.federations  TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.tournaments  TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.live_matches TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.live_scores  TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.organizers   TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.referees     TO authenticated;

-- =========================================================================
-- C1: organizers_select_public expoe PII (email + last_login) para anon
-- =========================================================================
-- Antes: USING: true -- qualquer anon listava todos admins com email e
-- last_login_at em claro.
-- Depois: SELECT so para authenticated. Como authenticated sao organizadores
-- logados via OTP ou arbitros via Google, isso e um escopo razoavel.
-- Site live publico NAO precisa ler organizers.
-- =========================================================================

DROP POLICY IF EXISTS organizers_select_public ON public.organizers;

CREATE POLICY organizers_select_auth ON public.organizers
    FOR SELECT
    USING (auth.role() IN ('authenticated', 'service_role'));

REVOKE SELECT ON public.organizers FROM anon;
GRANT  SELECT ON public.organizers TO   authenticated;

-- =========================================================================
-- C2: referees_insert_self WITH CHECK true deixa anon floodar tabela
-- =========================================================================
-- Antes: WITH CHECK: true -- qualquer anon inseria linhas ilimitadas;
-- trigger force_referee_pending_status apenas forcava status='pendente',
-- nao bloqueava criacao.
-- Depois: exige auth.uid() = id (ou seja, exige login Google OAuth do
-- arbitro E que o id inserido bata com o JWT uid).
-- =========================================================================

DROP POLICY IF EXISTS referees_insert_self ON public.referees;

CREATE POLICY referees_insert_self_auth ON public.referees
    FOR INSERT
    WITH CHECK (
        auth.role() = 'service_role'
        OR (
            auth.role() = 'authenticated'
            AND auth.uid() IS NOT NULL
            AND (auth.uid())::text = id
        )
    );

-- =========================================================================
-- Validacao pos-aplicacao (inline SELECT para manual review)
-- =========================================================================
-- Use estes SELECTs para confirmar estado pos-migracao:

-- 1) organizers select policy deve ser organizers_select_auth
-- SELECT polname, pg_get_expr(polqual, polrelid) FROM pg_policy
-- WHERE polrelid='public.organizers'::regclass AND polcmd='r';

-- 2) referees insert policy deve exigir auth.uid()=id
-- SELECT polname, pg_get_expr(polwithcheck, polrelid) FROM pg_policy
-- WHERE polrelid='public.referees'::regclass AND polcmd='a';

-- 3) anon nao deve ter INSERT em nenhuma tabela public
-- SELECT table_name, privilege_type FROM information_schema.role_table_grants
-- WHERE grantee='anon' AND table_schema='public' AND privilege_type<>'SELECT'
-- ORDER BY table_name;
-- (esperado: 0 linhas; so deve sobrar SELECT em tournaments/live_*/federations/referees)

-- 4) authenticated nao deve ter TRUNCATE
-- SELECT table_name FROM information_schema.role_table_grants
-- WHERE grantee='authenticated' AND privilege_type='TRUNCATE'
-- AND table_schema='public';
-- (esperado: 0 linhas)
