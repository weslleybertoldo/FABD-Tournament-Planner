# Testes de Validacao - FABD Planner v3.51

## Teste 1: Serial Excel (Data)
**Arquivo:** `test_serial_excel.xlsx`
**Objetivo:** Validar que `normalizeDate` converte serial Excel (45985 = 2025-11-15)

### Passos:
1. Abra o FABD Tournament Planner
2. Va para: **Jogadores** > **Importar Planilha**
3. Selecione o arquivo `test_serial_excel.xlsx`
4. Clique em **Visualizar Importacao**

### Esperado:
- **Joao Silva** deve mostrar DOB como `2025-11-15` (nao 45985)
- **Maria Santos** deve mostrar DOB como `2015-11-15`

### Resultado:
- [ ] Joao Silva: `2025-11-15` (OK) / `45985` (BUG)
- [ ] Maria Santos: `2015-11-15` (OK) / outro (BUG)

---

## Teste 2: Clube Dupla (findCol asymmetry)
**Arquivo:** `test_clube_dupla.xlsx`
**Objetivo:** Validar que `findCol` NAO confunde "Clube" com "Clube Dupla"

### Passos:
1. Va para: **Jogadores** > **Importar Planilha**
2. Selecione o arquivo `test_clube_dupla.xlsx`
3. Clique em **Visualizar Importacao**

### Esperado:
- **Pedro Oliveira** deve ter **Clube: SESC** (coluna 4)
- **Pedro Oliveira** deve ter **Clube Dupla: ACBL** (coluna 5)

### Resultado:
- [ ] Clube = SESC (OK) / Clube = SESC e ACBL juntos (BUG)
- [ ] Clube Dupla = ACBL (OK) / vazio ou errado (BUG)

---

## Teste 3: XSS Injection
**Objetivo:** Validar que `esc()` sanitiza nomes com `<script>` tags

### Passos:
1. Va para: **Jogadores** > **Novo Jogador**
2. No campo **Nome**, digite: `<script>alert(1)</script>`
3. Clique em **Salvar**
4. Observe a lista de jogadores

### Esperado:
- Nome deve aparecer como texto: `<script>alert(1)</script>`
- NENHUM popup de alert deve aparecer
- Verifique no DevTools (F12) se o HTML mostra `&lt;script&gt;`

### Resultado:
- [ ] Nome exibido como texto (OK)
- [ ] Nenhum alert executado (OK)
- [ ] HTML mostra `&lt;script&gt;` no DevTools (OK)

---

## Teste 4: Importar Jogador com Nome Malicioso
**Objetivo:** Validar XSS na importacao XLSX

### Passos:
1. Edite `test_serial_excel.xlsx`
2. Mude "Joao Silva" para `<img src=x onerror=alert(1)>`
3. Salve e reimporte

### Esperado:
- Nome nao deve executar JavaScript
- Deve aparecer como texto escapado

### Resultado:
- [ ] Nome escapado (OK)
- [ ] Nenhum erro JS no console (OK)
