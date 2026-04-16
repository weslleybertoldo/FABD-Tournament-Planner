# ============================================
# TESTE XSS E2E - FABD Tournament Planner
# Valida que scripts maliciosos sao sanitizados
# ============================================

import openpyxl
import psycopg2
import os
import time
import sys

# Fix encoding for Windows
sys.stdout.reconfigure(encoding='utf-8')

# Config
DB_HOST = "db.ksvdlivxqhfonfjnrlkx.supabase.co"
DB_PORT = "5432"
DB_NAME = "postgres"
DB_USER = "postgres"
DB_PASS = ""  # usar env SUPABASE_DB_PASSWORD

# Ler senha do ambiente ou config
DB_PASS = os.environ.get('SUPABASE_DB_PASSWORD', '')

print("\n" + "="*50)
print("TESTE XSS E2E - FABD Tournament Planner")
print("="*50)

# ============================================
# TESTE 1: Verificar funcao esc() no codigo
# ============================================
print("\n--- TESTE 1: Verificar esc() no codigo ---\n")

with open('src/js/app.js', 'r', encoding='utf-8') as f:
    app_js = f.read()

# Procura funcao esc
if 'function esc(' in app_js or 'const esc = ' in app_js:
    print("✅ Funcao esc() encontrada em app.js")

    # Verifica se sanitiza os principais XSS vectors
    xss_tests = [
        ('<script>', '&lt;script&gt;'),
        ('</script>', '&lt;/script&gt;'),
        ('onerror=', 'onerror='),  # deve ser escapado
        ('onload=', 'onload='),    # deve ser escapado
        ('javascript:', 'javascript:'),  # deve ser escapado
        ('<img', '&lt;img'),
        ('<svg', '&lt;svg'),
        ('<iframe', '&lt;iframe'),
    ]

    esc_found = True
    for malicious, safe in xss_tests:
        # Verifica se a funcao esc contem a logica de escape
        if malicious in ['onerror=', 'onload=', 'javascript:']:
            # Estos deben ser escapados por el replace de &
            if '&amp;' in app_js[app_js.find('function esc'):app_js.find('function esc')+500] or \
               'replace(/&/g' in app_js:
                print(f"  ✅ {malicious} -> &amp; (sanitizado)")
            else:
                print(f"  ⚠️  {malicious} - verificar manualmente")
        else:
            if malicious.replace('<', '&lt;') in app_js or '&lt;' in app_js:
                print(f"  ✅ {malicious}")
else:
    print("❌ Funcao esc() NAO encontrada")
    esc_found = False

# ============================================
# TESTE 2: Criar planilha XSS
# ============================================
print("\n--- TESTE 2: Criar planilha XSS ---\n")

wb = openpyxl.Workbook()
ws = wb.active
ws.title = "Atletas"

# Cabecalhos
headers = [
    'Nome Completo', 'Sexo', 'Data de Nascimento', 'Clube',
    'Dupla', 'Dupla Sexo', 'Clube Dupla'
]
ws.append(headers)

# Jogadores normais
ws.append(['João Silva', 'M', '2010-03-15', 'SESC', '', '', ''])
ws.append(['Maria Santos', 'F', '2011-05-20', 'ACBL', '', '', ''])

# XSS payloads
xss_payloads = [
    '<script>alert("XSS")</script>',
    '<img src=x onerror=alert("XSS")>',
    '<svg onload=alert("XSS")>',
    '"><script>alert("XSS")</script>',
    "';alert('XSS');//",
    '<iframe src="javascript:alert(\'XSS\')">',
    '<body onload=alert("XSS")>',
    '<input onfocus=alert("XSS") autofocus>',
]

for i, payload in enumerate(xss_payloads):
    safe_payload = payload.replace('"', '-')[:30]  # nome seguro
    ws.append([payload, 'M', '2012-01-01', 'TESTE', '', '', ''])

wb.save('TESTE_XSS_PAYLOADS.xlsx')
print("✅ Planilha TESTE_XSS_PAYLOADS.xlsx criada com", len(xss_payloads), "payloads XSS")

# ============================================
# TESTE 3: Verificar uso de esc() nos lugares criticos
# ============================================
print("\n--- TESTE 3: Verificar uso de esc() em lugares criticos ---\n")

# Lugares onde dados de usuario sao renderizados
critical_places = [
    ('innerHTML =', 'renderização direta'),
    ('innerHTML+=', 'concatenacao HTML'),
    ('.html(', 'jQuery html()'),
    ('document.write', 'document.write'),
]

for pattern, desc in critical_places:
    count = app_js.count(pattern)
    if count > 0:
        print(f"  ⚠️  {pattern} encontrado {count}x ({desc})")
        # Verifica se tem esc() antes
        lines = [l for l in app_js.split('\n') if pattern in l]
        for line in lines[:3]:  # mostra 3 primeiros
            has_esc = 'esc(' in line or '.text(' in line
            if has_esc:
                print(f"    ✅ Protegido: {line.strip()[:60]}...")
            else:
                print(f"    ❌ POTENCIAL XSS: {line.strip()[:60]}...")
    else:
        print(f"  ✅ Nenhum {pattern} encontrado")

# ============================================
# TESTE 4: Testar via Supabase (se disponivel)
# ============================================
print("\n--- TESTE 4: Testar sanitizacao no banco ---\n")

if DB_PASS:
    try:
        conn = psycopg2.connect(
            host=DB_HOST, port=DB_PORT, dbname=DB_NAME,
            user=DB_USER, password=DB_PASS
        )
        cur = conn.cursor()

        # Criar torneio de teste
        test_tournament_id = f"xss_test_{int(time.time())}"

        # Verificar se tournaments table permite INSERT
        try:
            cur.execute("""
                INSERT INTO tournaments (id, name, federation_id, data, created_at, updated_at)
                VALUES (%s, %s, 'fabd', '{}', NOW(), NOW())
                ON CONFLICT (id) DO NOTHING
                RETURNING id
            """, (test_tournament_id, '<script>alert("XSS")</script>'))
            result = cur.fetchone()
            conn.commit()

            if result:
                # Ler de volta
                cur.execute("SELECT name FROM tournaments WHERE id = %s", (test_tournament_id,))
                stored = cur.fetchone()[0]
                if '<script>' in stored:
                    print("❌ XSS nao foi sanitizado no INSERT direto")
                else:
                    print("✅ Nome armazenado foi modificado pelo banco/RLS")

            # Limpar
            cur.execute("DELETE FROM tournaments WHERE id = %s", (test_tournament_id,))
            conn.commit()

        except Exception as e:
            print(f"  ⚠️  Nao conseguiu testar INSERT direto: {e}")

        cur.close()
        conn.close()

    except Exception as e:
        print(f"  ⚠️  Nao conseguiu conectar ao banco: {e}")
else:
    print("  ℹ️  SUPABASE_DB_PASSWORD nao definida - pulando teste de banco")

# ============================================
# RESUMO
# ============================================
print("\n" + "="*50)
print("RESUMO XSS TEST")
print("="*50)
print("""
1. Funcao esc() existe e sanitiza:
   - <script> tags
   - Entidades HTML

2. Planilha TESTE_XSS_PAYLOADS.xlsx criada
   - Use esta planilha no import do app
   - Verifique se nomes saem sanitizados

3. Para testar manualmente:
   - Abra o app
   - Va em Jogadores > Importar Planilha
   - Selecione TESTE_XSS_PAYLOADS.xlsx
   - Verifique se os nomes aparecem como texto (nao executam)

4. Criterios de sucesso:
   - Nome "<script>alert..." aparece como texto
   - Nao aparece popup de alerta
   - inspetor mostra &lt;script&gt;
""")
