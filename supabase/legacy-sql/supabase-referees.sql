-- Tabela de arbitros (login Google + autorizacao)
CREATE TABLE IF NOT EXISTS referees (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT,
  photo TEXT,
  status TEXT DEFAULT 'pendente', -- pendente, autorizado, bloqueado
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE referees ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Leitura publica referees" ON referees FOR SELECT USING (true);
CREATE POLICY "Insert referees" ON referees FOR INSERT WITH CHECK (true);
CREATE POLICY "Update referees" ON referees FOR UPDATE USING (true);
CREATE POLICY "Delete referees" ON referees FOR DELETE USING (true);

ALTER PUBLICATION supabase_realtime ADD TABLE referees;
