-- FABD Tournament Planner - Supabase Tables Setup
-- Execute este SQL no SQL Editor do Supabase (https://supabase.com/dashboard)

-- Tabela: torneios ativos (para sincronizar entre apps)
CREATE TABLE IF NOT EXISTS tournaments (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  data JSONB -- dados completos do torneio
);

-- Tabela: partidas em tempo real
CREATE TABLE IF NOT EXISTS live_matches (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tournament_id TEXT REFERENCES tournaments(id) ON DELETE CASCADE,
  match_num INTEGER NOT NULL,
  draw_name TEXT,
  round INTEGER,
  round_name TEXT,
  player1 TEXT,
  player2 TEXT,
  court TEXT,
  umpire TEXT,
  status TEXT DEFAULT 'Pendente', -- Pendente, Em Quadra, Finalizada, WO
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tabela: placar em tempo real (cada ponto registrado)
CREATE TABLE IF NOT EXISTS live_scores (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  match_id TEXT REFERENCES live_matches(id) ON DELETE CASCADE,
  tournament_id TEXT REFERENCES tournaments(id) ON DELETE CASCADE,
  current_set INTEGER DEFAULT 1,
  score_p1 INTEGER DEFAULT 0,
  score_p2 INTEGER DEFAULT 0,
  sets_p1 JSONB DEFAULT '[]', -- array de pontos por set do jogador 1
  sets_p2 JSONB DEFAULT '[]', -- array de pontos por set do jogador 2
  sets_won_p1 INTEGER DEFAULT 0,
  sets_won_p2 INTEGER DEFAULT 0,
  winner INTEGER, -- 1 ou 2 quando jogo terminar
  final_score TEXT, -- ex: "21-15 / 21-18"
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Habilitar Realtime nas tabelas
ALTER PUBLICATION supabase_realtime ADD TABLE live_matches;
ALTER PUBLICATION supabase_realtime ADD TABLE live_scores;

-- Politicas de seguranca (RLS)
ALTER TABLE tournaments ENABLE ROW LEVEL SECURITY;
ALTER TABLE live_matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE live_scores ENABLE ROW LEVEL SECURITY;

-- Permitir leitura publica (qualquer um pode ver os placares)
CREATE POLICY "Leitura publica tournaments" ON tournaments FOR SELECT USING (true);
CREATE POLICY "Leitura publica live_matches" ON live_matches FOR SELECT USING (true);
CREATE POLICY "Leitura publica live_scores" ON live_scores FOR SELECT USING (true);

-- Permitir escrita com anon key (arbitros podem enviar pontos)
CREATE POLICY "Insert live_matches" ON live_matches FOR INSERT WITH CHECK (true);
CREATE POLICY "Update live_matches" ON live_matches FOR UPDATE USING (true);
CREATE POLICY "Insert live_scores" ON live_scores FOR INSERT WITH CHECK (true);
CREATE POLICY "Update live_scores" ON live_scores FOR UPDATE USING (true);
CREATE POLICY "Insert tournaments" ON tournaments FOR INSERT WITH CHECK (true);
CREATE POLICY "Update tournaments" ON tournaments FOR UPDATE USING (true);
CREATE POLICY "Delete tournaments" ON tournaments FOR DELETE USING (true);
CREATE POLICY "Delete live_matches" ON live_matches FOR DELETE USING (true);
CREATE POLICY "Delete live_scores" ON live_scores FOR DELETE USING (true);

-- Indice para busca rapida
CREATE INDEX IF NOT EXISTS idx_live_matches_tournament ON live_matches(tournament_id);
CREATE INDEX IF NOT EXISTS idx_live_scores_match ON live_scores(match_id);
CREATE INDEX IF NOT EXISTS idx_live_scores_tournament ON live_scores(tournament_id);
