-- Sumula preenchida com o ponto a ponto (padrao BWF), 19/10/2026.
-- O app do arbitro grava cada rali: 1 item por game
--   {"srv": linha, "rcv": linha, "pts": [[lado 1|2, linha do proximo sacador], ...]}
-- Linhas da grade: 0 = 1o nome do lado 1, 1 = parceiro, 2 = 1o nome do lado 2,
-- 3 = parceiro (simples: 0 e 2). O Planner copia pro jogo quando o resultado
-- chega (o live_scores e apagado quando o jogo sai da quadra).
-- Coluna nova com default constante: so metadado, sem reescrever a tabela.
-- Idempotente. Aplicar em staging (referee-beta) e em public (referee).

ALTER TABLE staging.live_scores ADD COLUMN IF NOT EXISTS rallies jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.live_scores ADD COLUMN IF NOT EXISTS rallies jsonb NOT NULL DEFAULT '[]'::jsonb;

-- PostgREST passa a enxergar a coluna na hora
NOTIFY pgrst, 'reload schema';
