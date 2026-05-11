-- RPCs claim_match + release_match (audit Referee v4.36, 11/05/2026)
-- Substitui o check client-side de lock de árbitro por advisory lock atômico no Postgres.
-- Aplicado em prod via Mgmt API em 11/05/2026 — este arquivo é o registro idempotente.

CREATE OR REPLACE FUNCTION public.claim_match(
  p_match_id text,
  p_lock_seconds int DEFAULT 300
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_ref record;
  v_match record;
  v_existing record;
  v_now timestamptz := now();
  v_age_secs int;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('acquired', false, 'reason', 'not_authenticated');
  END IF;
  IF p_match_id IS NULL OR p_match_id = '' THEN
    RETURN jsonb_build_object('acquired', false, 'reason', 'invalid_input');
  END IF;

  SELECT status, federation_id, COALESCE(NULLIF(name, ''), '(sem nome)') AS name
    INTO v_ref
    FROM public.referees
    WHERE id = v_uid::text;
  IF NOT FOUND OR v_ref.status <> 'autorizado' THEN
    RETURN jsonb_build_object('acquired', false, 'reason', 'not_authorized');
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_match_id, 42));

  SELECT id, federation_id, tournament_id, status
    INTO v_match FROM public.live_matches WHERE id = p_match_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('acquired', false, 'reason', 'match_not_found');
  END IF;
  IF v_match.federation_id <> v_ref.federation_id THEN
    RETURN jsonb_build_object('acquired', false, 'reason', 'wrong_federation');
  END IF;
  IF v_match.status <> 'Em Quadra' THEN
    RETURN jsonb_build_object('acquired', false, 'reason', 'match_not_in_court', 'status', v_match.status);
  END IF;

  SELECT umpire_name, updated_at, winner
    INTO v_existing
    FROM public.live_scores
    WHERE match_id = p_match_id;

  IF FOUND AND v_existing.winner IS NOT NULL THEN
    RETURN jsonb_build_object('acquired', false, 'reason', 'match_finished');
  END IF;

  IF NOT FOUND
     OR v_existing.umpire_name IS NULL
     OR v_existing.umpire_name = ''
     OR v_existing.umpire_name = v_ref.name
     OR v_now - v_existing.updated_at > make_interval(secs => p_lock_seconds)
  THEN
    INSERT INTO public.live_scores (match_id, tournament_id, federation_id, umpire_name, updated_at)
      VALUES (p_match_id, v_match.tournament_id, v_match.federation_id, v_ref.name, v_now)
    ON CONFLICT (match_id) DO UPDATE
      SET umpire_name = EXCLUDED.umpire_name,
          updated_at  = EXCLUDED.updated_at,
          federation_id = EXCLUDED.federation_id,
          tournament_id = EXCLUDED.tournament_id;
    RETURN jsonb_build_object('acquired', true, 'umpire_name', v_ref.name);
  END IF;

  v_age_secs := EXTRACT(EPOCH FROM (v_now - v_existing.updated_at))::int;
  RETURN jsonb_build_object(
    'acquired', false,
    'reason', 'locked_by_other',
    'current_umpire', v_existing.umpire_name,
    'age_seconds', v_age_secs,
    'lock_seconds', p_lock_seconds
  );
END;
$$;

REVOKE ALL ON FUNCTION public.claim_match(text, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_match(text, int) TO authenticated;

CREATE OR REPLACE FUNCTION public.release_match(p_match_id text) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_ref record;
  v_updated int;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('released', false, 'reason', 'not_authenticated');
  END IF;
  SELECT COALESCE(NULLIF(name, ''), '(sem nome)') AS name
    INTO v_ref FROM public.referees WHERE id = v_uid::text;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('released', false, 'reason', 'not_a_referee');
  END IF;
  UPDATE public.live_scores
     SET umpire_name = ''
   WHERE match_id = p_match_id
     AND umpire_name = v_ref.name
     AND winner IS NULL;
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN jsonb_build_object('released', v_updated > 0);
END;
$$;

REVOKE ALL ON FUNCTION public.release_match(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.release_match(text) TO authenticated;
