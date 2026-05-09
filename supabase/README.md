# Supabase — schema e migrations

Estrutura adotada em 09/05/2026 (auditoria 2026-05-09 P2). Substitui o monte de `supabase-*.sql` na raiz do repo.

## `migrations/`

Migrations versionadas no formato `<timestamp>_<descricao>.sql`. Cada migration deve ser **idempotente** (rodável N vezes sem efeito colateral) e envolvida em `BEGIN; ... COMMIT;`.

- `20260509000000_baseline.sql` — snapshot do estado real de prod (projeto `zwjgjtrmsqtyyjtuotuo`) gerado a partir de `pg_dump`-style queries via Management API. Reflete o consolidado de `legacy-sql/*.sql` aplicado em prod até essa data. **Validado via dry-run com ROLLBACK contra prod**.

### Como aplicar uma migration nova

Sem CLI Supabase configurado, aplicar via Management API:

```bash
PAT="<seu PAT>"
PROJECT_REF="zwjgjtrmsqtyyjtuotuo"
SQL_FILE="supabase/migrations/<arquivo>.sql"

curl -X POST "https://api.supabase.com/v1/projects/$PROJECT_REF/database/query" \
  -H "Authorization: Bearer $PAT" \
  -H "Content-Type: application/json" \
  -H "User-Agent: claude-code" \
  -d "$(jq -n --rawfile q "$SQL_FILE" '{query: $q}')"
```

Pra **dry-run** antes de aplicar de verdade, troque `COMMIT;` por `ROLLBACK;` na cópia local.

## `legacy-sql/`

Histórico dos arquivos SQL aplicados manualmente entre o início do projeto e 2026-04-16 (data da auditoria anterior). **Não aplicar mais** — a baseline já consolida esse estado. Mantidos pra referência:

- `supabase-setup.sql` — esquema inicial
- `supabase-multitenant.sql` — adição de `federation_id` em todas as tabelas
- `supabase-organizers.sql` — tabela organizers + roles
- `supabase-referees.sql` — tabela referees + Google OAuth
- `supabase-rls-fix.sql` — primeira tentativa de RLS (permissiva)
- `supabase-rls-step5.sql` — RLS final restritiva
- `supabase-security-hardening.sql` — REVOKE de anon writes (auditoria 2026-04-16)
- `supabase-storage-logos.sql` — bucket de logos federações

Vários desses arquivos têm policies conflitantes; prod tem o último estado consolidado, não o conjunto. A migration baseline é a única fonte da verdade.
