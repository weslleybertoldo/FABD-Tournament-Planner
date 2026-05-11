-- live_scores.version: contador monotônico atualizado por trigger.
-- Prepara terreno para optimistic concurrency (cliente envia "If-Match: version"
-- via RPC futura). Hoje é só observabilidade — Referee/Planner ainda fazem
-- last-write-wins, mas a coluna fica disponível para detectar divergência.

ALTER TABLE public.live_scores
  ADD COLUMN IF NOT EXISTS version int NOT NULL DEFAULT 1;

CREATE OR REPLACE FUNCTION public.bump_live_scores_version()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF (TG_OP = 'UPDATE') THEN
    NEW.version := COALESCE(OLD.version, 0) + 1;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_bump_live_scores_version ON public.live_scores;
CREATE TRIGGER trg_bump_live_scores_version
BEFORE UPDATE ON public.live_scores
FOR EACH ROW
EXECUTE FUNCTION public.bump_live_scores_version();
