-- =============================================================
-- Adiciona partial index em organizers(federation_id)
-- Auditoria 2026-05-09 P2b — achado: policies de federations/referees/etc
-- fazem `EXISTS (SELECT 1 FROM organizers WHERE email=... AND federation_id=...)`
-- a cada query. Sem index em federation_id, vira seqscan a cada policy check.
-- email já é coberto pela PK (organizers_pkey é UNIQUE BTREE em email).
-- Aplicado em prod via Management API; migration para versionamento.
-- =============================================================

CREATE INDEX IF NOT EXISTS organizers_federation_idx
  ON public.organizers (federation_id)
  WHERE federation_id IS NOT NULL;
