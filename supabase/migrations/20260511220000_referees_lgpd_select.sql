-- LGPD: restringe SELECT em referees. Antes: QUAL=true (qualquer um lê emails de todos).
-- Agora: só o próprio árbitro, organizadores da federação, ou super_admin.
-- Live e Referee PWAs não lêem outros árbitros direto — usam live_scores.umpire_name.
-- Planner sempre roda com organizer logado (currentOrganizer check em src/main.js:1410).

-- Helper SECURITY DEFINER pra anon poder avaliar a policy sem ter GRANT em organizers
CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.organizers
    WHERE email = lower(coalesce(auth.email(), ''))
      AND active
      AND role = 'super_admin'
  );
$$;
GRANT EXECUTE ON FUNCTION public.is_super_admin() TO anon, authenticated;

-- can_write_federation já existe; tornar SECURITY DEFINER pra mesma razão (anon avaliar policy)
ALTER FUNCTION public.can_write_federation(uuid) SECURITY DEFINER;

DROP POLICY IF EXISTS referees_select_public ON public.referees;
DROP POLICY IF EXISTS referees_select_scoped ON public.referees;

CREATE POLICY referees_select_scoped ON public.referees
FOR SELECT
TO public
USING (
  auth.role() = 'service_role'
  OR (auth.uid() IS NOT NULL AND (auth.uid())::text = id)
  OR ((federation_id IS NOT NULL) AND public.can_write_federation(federation_id))
  OR public.is_super_admin()
);
