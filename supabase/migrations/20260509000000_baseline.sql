-- =============================================================
-- FABD Tournament Planner — baseline migration
-- Gerado em 2026-05-09 a partir do estado real de prod (zwjgjtrmsqtyyjtuotuo).
-- Idempotente: testado via dry-run com ROLLBACK contra prod.
-- Reflete o consolidado de supabase/legacy-sql/*.sql aplicado em prod.
-- =============================================================

BEGIN;

-- ========== TABLES ==========

CREATE TABLE IF NOT EXISTS public.federations (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  slug text NOT NULL,
  name text NOT NULL,
  short_name text NOT NULL,
  state text NOT NULL,
  city text,
  logo_url text,
  primary_color text DEFAULT '#1E3A8A'::text,
  secondary_color text DEFAULT '#C41E2A'::text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.federations ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.tournaments (
  id text NOT NULL,
  name text NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  data jsonb,
  federation_id uuid NOT NULL
);
ALTER TABLE public.tournaments ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.organizers (
  email text NOT NULL,
  name text NOT NULL,
  role text NOT NULL DEFAULT 'organizer'::text,
  active boolean NOT NULL DEFAULT true,
  state text,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_login_at timestamptz,
  federation_id uuid
);
ALTER TABLE public.organizers ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.referees (
  id text NOT NULL,
  name text NOT NULL,
  email text,
  photo text,
  status text DEFAULT 'pendente'::text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  federation_id uuid
);
ALTER TABLE public.referees ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.live_matches (
  id text NOT NULL DEFAULT (gen_random_uuid())::text,
  tournament_id text,
  match_num integer NOT NULL,
  draw_name text,
  round integer,
  round_name text,
  player1 text,
  player2 text,
  court text,
  umpire text,
  status text DEFAULT 'Pendente'::text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  federation_id uuid NOT NULL
);
ALTER TABLE public.live_matches ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.live_scores (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  match_id text,
  tournament_id text,
  current_set integer DEFAULT 1,
  score_p1 integer DEFAULT 0,
  score_p2 integer DEFAULT 0,
  sets_p1 jsonb DEFAULT '[]'::jsonb,
  sets_p2 jsonb DEFAULT '[]'::jsonb,
  sets_won_p1 integer DEFAULT 0,
  sets_won_p2 integer DEFAULT 0,
  winner integer,
  final_score text,
  updated_at timestamptz DEFAULT now(),
  umpire_name text DEFAULT ''::text,
  federation_id uuid NOT NULL
);
ALTER TABLE public.live_scores ENABLE ROW LEVEL SECURITY;

-- ========== CONSTRAINTS (idempotente via pg_constraint check) ==========
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'federations_pkey' AND conrelid = 'public.federations'::regclass) THEN
    ALTER TABLE public.federations ADD CONSTRAINT federations_pkey PRIMARY KEY (id);
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'federations_slug_key' AND conrelid = 'public.federations'::regclass) THEN
    ALTER TABLE public.federations ADD CONSTRAINT federations_slug_key UNIQUE (slug);
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'slug_format' AND conrelid = 'public.federations'::regclass) THEN
    ALTER TABLE public.federations ADD CONSTRAINT slug_format CHECK (((slug ~ '^[a-z0-9-]+$'::text) AND ((length(slug) >= 2) AND (length(slug) <= 20))));
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'live_matches_federation_id_fkey' AND conrelid = 'public.live_matches'::regclass) THEN
    ALTER TABLE public.live_matches ADD CONSTRAINT live_matches_federation_id_fkey FOREIGN KEY (federation_id) REFERENCES federations(id) ON DELETE RESTRICT;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'live_matches_pkey' AND conrelid = 'public.live_matches'::regclass) THEN
    ALTER TABLE public.live_matches ADD CONSTRAINT live_matches_pkey PRIMARY KEY (id);
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'live_matches_tournament_id_fkey' AND conrelid = 'public.live_matches'::regclass) THEN
    ALTER TABLE public.live_matches ADD CONSTRAINT live_matches_tournament_id_fkey FOREIGN KEY (tournament_id) REFERENCES tournaments(id) ON DELETE CASCADE;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'live_scores_federation_id_fkey' AND conrelid = 'public.live_scores'::regclass) THEN
    ALTER TABLE public.live_scores ADD CONSTRAINT live_scores_federation_id_fkey FOREIGN KEY (federation_id) REFERENCES federations(id) ON DELETE RESTRICT;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'live_scores_match_id_fkey' AND conrelid = 'public.live_scores'::regclass) THEN
    ALTER TABLE public.live_scores ADD CONSTRAINT live_scores_match_id_fkey FOREIGN KEY (match_id) REFERENCES live_matches(id) ON DELETE CASCADE;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'live_scores_match_id_unique' AND conrelid = 'public.live_scores'::regclass) THEN
    ALTER TABLE public.live_scores ADD CONSTRAINT live_scores_match_id_unique UNIQUE (match_id);
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'live_scores_pkey' AND conrelid = 'public.live_scores'::regclass) THEN
    ALTER TABLE public.live_scores ADD CONSTRAINT live_scores_pkey PRIMARY KEY (id);
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'live_scores_tournament_id_fkey' AND conrelid = 'public.live_scores'::regclass) THEN
    ALTER TABLE public.live_scores ADD CONSTRAINT live_scores_tournament_id_fkey FOREIGN KEY (tournament_id) REFERENCES tournaments(id) ON DELETE CASCADE;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'organizers_federation_id_fkey' AND conrelid = 'public.organizers'::regclass) THEN
    ALTER TABLE public.organizers ADD CONSTRAINT organizers_federation_id_fkey FOREIGN KEY (federation_id) REFERENCES federations(id) ON DELETE RESTRICT;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'organizers_federation_required' AND conrelid = 'public.organizers'::regclass) THEN
    ALTER TABLE public.organizers ADD CONSTRAINT organizers_federation_required CHECK (((role = 'super_admin'::text) OR (federation_id IS NOT NULL)));
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'organizers_pkey' AND conrelid = 'public.organizers'::regclass) THEN
    ALTER TABLE public.organizers ADD CONSTRAINT organizers_pkey PRIMARY KEY (email);
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'organizers_role_check' AND conrelid = 'public.organizers'::regclass) THEN
    ALTER TABLE public.organizers ADD CONSTRAINT organizers_role_check CHECK ((role = ANY (ARRAY['super_admin'::text, 'admin'::text, 'organizer'::text])));
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'referees_federation_id_fkey' AND conrelid = 'public.referees'::regclass) THEN
    ALTER TABLE public.referees ADD CONSTRAINT referees_federation_id_fkey FOREIGN KEY (federation_id) REFERENCES federations(id) ON DELETE RESTRICT;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'referees_pkey' AND conrelid = 'public.referees'::regclass) THEN
    ALTER TABLE public.referees ADD CONSTRAINT referees_pkey PRIMARY KEY (id);
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tournaments_federation_id_fkey' AND conrelid = 'public.tournaments'::regclass) THEN
    ALTER TABLE public.tournaments ADD CONSTRAINT tournaments_federation_id_fkey FOREIGN KEY (federation_id) REFERENCES federations(id) ON DELETE RESTRICT;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tournaments_pkey' AND conrelid = 'public.tournaments'::regclass) THEN
    ALTER TABLE public.tournaments ADD CONSTRAINT tournaments_pkey PRIMARY KEY (id);
  END IF;
END $$;

-- ========== INDEXES (non-PK, non-unique) ==========
CREATE INDEX IF NOT EXISTS idx_live_matches_tournament ON public.live_matches USING btree (tournament_id);
CREATE INDEX IF NOT EXISTS idx_live_scores_match ON public.live_scores USING btree (match_id);
CREATE INDEX IF NOT EXISTS idx_live_scores_tournament ON public.live_scores USING btree (tournament_id);
CREATE INDEX IF NOT EXISTS live_matches_federation_idx ON public.live_matches USING btree (federation_id);
CREATE INDEX IF NOT EXISTS live_scores_federation_idx ON public.live_scores USING btree (federation_id);
CREATE INDEX IF NOT EXISTS referees_federation_idx ON public.referees USING btree (federation_id);
CREATE INDEX IF NOT EXISTS tournaments_federation_idx ON public.tournaments USING btree (federation_id);

-- ========== FUNCTIONS ==========

CREATE OR REPLACE FUNCTION public.can_write_federation(fed_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM organizers
    WHERE email = lower(coalesce(auth.email(),''))
      AND active
      AND (role = 'super_admin' OR federation_id = fed_id)
  );
$function$;

CREATE OR REPLACE FUNCTION public.force_referee_pending_status()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  -- service_role pode inserir com qualquer status
  IF current_setting('request.jwt.claims', true)::json->>'role' = 'service_role' THEN
    RETURN NEW;
  END IF;

  -- Forcar status pendente para auto-registro
  NEW.status := 'pendente';
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.is_active_organizer()
 RETURNS boolean
 LANGUAGE sql
 STABLE
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM organizers
    WHERE email = lower(coalesce(auth.email(),''))
      AND active = true
  );
$function$;

CREATE OR REPLACE FUNCTION public.lower_organizer_email()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  -- Atribuicao via := (idiomatico em PL/pgSQL). PostgreSQL aceita = em records,
  -- mas := deixa explicito que e atribuicao (nao comparacao).
  NEW.email := lower(trim(NEW.email));
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.protect_referee_status()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
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
$function$;

-- ========== TRIGGERS ==========
DROP TRIGGER IF EXISTS trg_lower_organizer_email ON public.organizers;
CREATE TRIGGER trg_lower_organizer_email BEFORE INSERT OR UPDATE ON public.organizers FOR EACH ROW EXECUTE FUNCTION lower_organizer_email();
DROP TRIGGER IF EXISTS trg_force_referee_pending ON public.referees;
CREATE TRIGGER trg_force_referee_pending BEFORE INSERT ON public.referees FOR EACH ROW EXECUTE FUNCTION force_referee_pending_status();
DROP TRIGGER IF EXISTS trg_protect_referee_status ON public.referees;
CREATE TRIGGER trg_protect_referee_status BEFORE UPDATE ON public.referees FOR EACH ROW EXECUTE FUNCTION protect_referee_status();

-- ========== RLS POLICIES (DROP IF EXISTS + CREATE) ==========

DROP POLICY IF EXISTS federations_delete_super_admin ON public.federations;
CREATE POLICY federations_delete_super_admin ON public.federations
  FOR DELETE
  TO public
  USING (((auth.role() = 'service_role'::text) OR (EXISTS ( SELECT 1
   FROM organizers
  WHERE ((organizers.email = lower(COALESCE(auth.email(), ''::text))) AND organizers.active AND (organizers.role = 'super_admin'::text))))));

DROP POLICY IF EXISTS federations_write_super_admin ON public.federations;
CREATE POLICY federations_write_super_admin ON public.federations
  FOR INSERT
  TO public
  WITH CHECK (((auth.role() = 'service_role'::text) OR (EXISTS ( SELECT 1
   FROM organizers
  WHERE ((organizers.email = lower(COALESCE(auth.email(), ''::text))) AND organizers.active AND (organizers.role = 'super_admin'::text))))));

DROP POLICY IF EXISTS federations_select_public ON public.federations;
CREATE POLICY federations_select_public ON public.federations
  FOR SELECT
  TO public
  USING (true);

DROP POLICY IF EXISTS federations_update_super_admin ON public.federations;
CREATE POLICY federations_update_super_admin ON public.federations
  FOR UPDATE
  TO public
  USING (((auth.role() = 'service_role'::text) OR (EXISTS ( SELECT 1
   FROM organizers
  WHERE ((organizers.email = lower(COALESCE(auth.email(), ''::text))) AND organizers.active AND (organizers.role = 'super_admin'::text))))));

DROP POLICY IF EXISTS live_matches_delete_fed ON public.live_matches;
CREATE POLICY live_matches_delete_fed ON public.live_matches
  FOR DELETE
  TO public
  USING (((auth.role() = 'service_role'::text) OR can_write_federation(federation_id)));

DROP POLICY IF EXISTS live_matches_insert_fed ON public.live_matches;
CREATE POLICY live_matches_insert_fed ON public.live_matches
  FOR INSERT
  TO public
  WITH CHECK (((auth.role() = 'service_role'::text) OR can_write_federation(federation_id)));

DROP POLICY IF EXISTS live_matches_select_public ON public.live_matches;
CREATE POLICY live_matches_select_public ON public.live_matches
  FOR SELECT
  TO public
  USING (true);

DROP POLICY IF EXISTS live_matches_update_fed_or_referee ON public.live_matches;
CREATE POLICY live_matches_update_fed_or_referee ON public.live_matches
  FOR UPDATE
  TO public
  USING (((auth.role() = 'service_role'::text) OR can_write_federation(federation_id) OR ((auth.role() = 'authenticated'::text) AND (EXISTS ( SELECT 1
   FROM referees r
  WHERE ((r.id = (auth.uid())::text) AND (r.status = 'autorizado'::text) AND (r.federation_id = live_matches.federation_id)))))));

DROP POLICY IF EXISTS live_scores_delete_fed ON public.live_scores;
CREATE POLICY live_scores_delete_fed ON public.live_scores
  FOR DELETE
  TO public
  USING (((auth.role() = 'service_role'::text) OR can_write_federation(federation_id)));

DROP POLICY IF EXISTS live_scores_insert_fed_or_referee ON public.live_scores;
CREATE POLICY live_scores_insert_fed_or_referee ON public.live_scores
  FOR INSERT
  TO public
  WITH CHECK (((auth.role() = 'service_role'::text) OR can_write_federation(federation_id) OR ((auth.role() = 'authenticated'::text) AND (EXISTS ( SELECT 1
   FROM referees r
  WHERE ((r.federation_id = live_scores.federation_id) AND (r.status = 'autorizado'::text) AND (r.email = lower(auth.email()))))))));

DROP POLICY IF EXISTS live_scores_select_public ON public.live_scores;
CREATE POLICY live_scores_select_public ON public.live_scores
  FOR SELECT
  TO public
  USING (true);

DROP POLICY IF EXISTS live_scores_update_fed_or_referee ON public.live_scores;
CREATE POLICY live_scores_update_fed_or_referee ON public.live_scores
  FOR UPDATE
  TO public
  USING (((auth.role() = 'service_role'::text) OR can_write_federation(federation_id) OR ((auth.role() = 'authenticated'::text) AND (EXISTS ( SELECT 1
   FROM referees r
  WHERE ((r.federation_id = live_scores.federation_id) AND (r.status = 'autorizado'::text) AND (r.email = lower(auth.email()))))))));

DROP POLICY IF EXISTS organizers_delete_admin ON public.organizers;
CREATE POLICY organizers_delete_admin ON public.organizers
  FOR DELETE
  TO public
  USING (((auth.role() = 'service_role'::text) OR (EXISTS ( SELECT 1
   FROM organizers o
  WHERE ((o.email = lower(COALESCE(auth.email(), ''::text))) AND o.active AND ((o.role = 'super_admin'::text) OR ((o.role = 'admin'::text) AND (o.federation_id = organizers.federation_id))))))));

DROP POLICY IF EXISTS organizers_insert_admin ON public.organizers;
CREATE POLICY organizers_insert_admin ON public.organizers
  FOR INSERT
  TO public
  WITH CHECK (((auth.role() = 'service_role'::text) OR (EXISTS ( SELECT 1
   FROM organizers o
  WHERE ((o.email = lower(COALESCE(auth.email(), ''::text))) AND o.active AND ((o.role = 'super_admin'::text) OR ((o.role = 'admin'::text) AND (o.federation_id = organizers.federation_id))))))));

DROP POLICY IF EXISTS organizers_select_auth ON public.organizers;
CREATE POLICY organizers_select_auth ON public.organizers
  FOR SELECT
  TO public
  USING ((auth.role() = ANY (ARRAY['authenticated'::text, 'service_role'::text])));

DROP POLICY IF EXISTS organizers_update_admin_or_self ON public.organizers;
CREATE POLICY organizers_update_admin_or_self ON public.organizers
  FOR UPDATE
  TO public
  USING (((auth.role() = 'service_role'::text) OR (lower(COALESCE(auth.email(), ''::text)) = email) OR (EXISTS ( SELECT 1
   FROM organizers o
  WHERE ((o.email = lower(COALESCE(auth.email(), ''::text))) AND o.active AND ((o.role = 'super_admin'::text) OR ((o.role = 'admin'::text) AND (o.federation_id = organizers.federation_id))))))));

DROP POLICY IF EXISTS referees_delete_fed ON public.referees;
CREATE POLICY referees_delete_fed ON public.referees
  FOR DELETE
  TO public
  USING (((auth.role() = 'service_role'::text) OR ((federation_id IS NOT NULL) AND can_write_federation(federation_id)) OR (EXISTS ( SELECT 1
   FROM organizers
  WHERE ((organizers.email = lower(COALESCE(auth.email(), ''::text))) AND organizers.active AND (organizers.role = 'super_admin'::text))))));

DROP POLICY IF EXISTS referees_insert_self_auth ON public.referees;
CREATE POLICY referees_insert_self_auth ON public.referees
  FOR INSERT
  TO public
  WITH CHECK (((auth.role() = 'service_role'::text) OR ((auth.role() = 'authenticated'::text) AND (auth.uid() IS NOT NULL) AND ((auth.uid())::text = id))));

DROP POLICY IF EXISTS referees_select_public ON public.referees;
CREATE POLICY referees_select_public ON public.referees
  FOR SELECT
  TO public
  USING (true);

DROP POLICY IF EXISTS referees_update_own_or_fed ON public.referees;
CREATE POLICY referees_update_own_or_fed ON public.referees
  FOR UPDATE
  TO public
  USING ((((auth.uid())::text = id) OR (auth.role() = 'service_role'::text) OR ((federation_id IS NOT NULL) AND can_write_federation(federation_id)) OR (EXISTS ( SELECT 1
   FROM organizers
  WHERE ((organizers.email = lower(COALESCE(auth.email(), ''::text))) AND organizers.active AND (organizers.role = 'super_admin'::text))))));

DROP POLICY IF EXISTS tournaments_delete_fed ON public.tournaments;
CREATE POLICY tournaments_delete_fed ON public.tournaments
  FOR DELETE
  TO public
  USING (((auth.role() = 'service_role'::text) OR can_write_federation(federation_id)));

DROP POLICY IF EXISTS tournaments_insert_fed ON public.tournaments;
CREATE POLICY tournaments_insert_fed ON public.tournaments
  FOR INSERT
  TO public
  WITH CHECK (((auth.role() = 'service_role'::text) OR can_write_federation(federation_id)));

DROP POLICY IF EXISTS tournaments_select_public ON public.tournaments;
CREATE POLICY tournaments_select_public ON public.tournaments
  FOR SELECT
  TO public
  USING (true);

DROP POLICY IF EXISTS tournaments_update_fed ON public.tournaments;
CREATE POLICY tournaments_update_fed ON public.tournaments
  FOR UPDATE
  TO public
  USING (((auth.role() = 'service_role'::text) OR can_write_federation(federation_id)));

-- ========== REVOKE EXECUTE (Fase 1 da auditoria 2026-05-09) ==========
REVOKE EXECUTE ON FUNCTION public.protect_referee_status() FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.force_referee_pending_status() FROM public, anon;

-- ========== STORAGE: bucket federation-logos + policies ==========
-- Bucket precisa ser criado via Supabase Dashboard ou storage.buckets insert
-- (Management API nao expoe POST /storage/buckets diretamente).
-- Aqui registramos via INSERT idempotente (storage.buckets aceita).
INSERT INTO storage.buckets (id, name, public)
  VALUES ('federation-logos', 'federation-logos', true)
  ON CONFLICT (id) DO NOTHING;

-- Policies do bucket. logos_public_read deixa SELECT aberto; writes exigem
-- organizer admin/super_admin com slug da federacao = primeira pasta do path.
DROP POLICY IF EXISTS logos_public_read ON storage.objects;
CREATE POLICY logos_public_read ON storage.objects
  FOR SELECT
  TO public
  USING (bucket_id = 'federation-logos'::text);

DROP POLICY IF EXISTS logos_insert_fed_admin ON storage.objects;
CREATE POLICY logos_insert_fed_admin ON storage.objects
  FOR INSERT
  TO public
  WITH CHECK (((bucket_id = 'federation-logos'::text) AND ((auth.role() = 'service_role'::text) OR (EXISTS ( SELECT 1
   FROM (organizers o
     LEFT JOIN federations f ON ((f.id = o.federation_id)))
  WHERE ((o.email = lower(COALESCE(auth.email(), ''::text))) AND o.active AND (o.role = ANY (ARRAY['super_admin'::text, 'admin'::text])) AND ((o.role = 'super_admin'::text) OR ((storage.foldername(objects.name))[1] = f.slug))))))));

DROP POLICY IF EXISTS logos_update_fed_admin ON storage.objects;
CREATE POLICY logos_update_fed_admin ON storage.objects
  FOR UPDATE
  TO public
  USING (((bucket_id = 'federation-logos'::text) AND ((auth.role() = 'service_role'::text) OR (EXISTS ( SELECT 1
   FROM (organizers o
     LEFT JOIN federations f ON ((f.id = o.federation_id)))
  WHERE ((o.email = lower(COALESCE(auth.email(), ''::text))) AND o.active AND (o.role = ANY (ARRAY['super_admin'::text, 'admin'::text])) AND ((o.role = 'super_admin'::text) OR ((storage.foldername(objects.name))[1] = f.slug))))))));

DROP POLICY IF EXISTS logos_delete_fed_admin ON storage.objects;
CREATE POLICY logos_delete_fed_admin ON storage.objects
  FOR DELETE
  TO public
  USING (((bucket_id = 'federation-logos'::text) AND ((auth.role() = 'service_role'::text) OR (EXISTS ( SELECT 1
   FROM (organizers o
     LEFT JOIN federations f ON ((f.id = o.federation_id)))
  WHERE ((o.email = lower(COALESCE(auth.email(), ''::text))) AND o.active AND (o.role = ANY (ARRAY['super_admin'::text, 'admin'::text])) AND ((o.role = 'super_admin'::text) OR ((storage.foldername(objects.name))[1] = f.slug))))))));

-- ========== REALTIME: publication supabase_realtime ==========
-- live_matches, live_scores e referees sao replicados via Realtime
-- pra UI publica (placar ao vivo, status arbitros). Idempotente
-- via DO/EXCEPTION duplicate_object.
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.live_matches;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.live_scores;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.referees;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

COMMIT;
