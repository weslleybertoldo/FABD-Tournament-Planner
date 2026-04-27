# Roteiro de testes E2E — v4.0+

8 cenários × 5-10 min total. Marcar ✅ ou ❌ em cada item. Se algo falhar, anotar o sintoma e me reportar.

Pré-requisito: Planner v4.0+ instalado, torneio ativo, pelo menos 2 árbitros logados no Referee PWA, dois browsers/aparelhos pra testar paralelo.

## Cenário 1 — Aba Partidas não pisca a cada ponto (v3.95)

1. Abre Planner, abre torneio ativo
2. Coloca um jogo de quadra (qualquer)
3. Abre Referee PWA noutro aparelho, pega esse jogo, marca pontos rapidamente
4. No Planner, vai pra aba **Partidas**, **digita** algo no campo de busca

- [ ] Aba não pisca a cada ponto que o árbitro marca
- [ ] Foco do campo de busca permanece, consigo digitar normal
- [ ] Após sair do campo de busca (clicar fora), tabela atualiza com placar mais recente

## Cenário 2 — Mensagem clara em falha de rede (v4.0)

Pra simular: tirar Wi-Fi do PC ou usar DevTools → Network → Offline.

1. Com Planner aberto, **desconecta** a rede
2. Tenta colocar um jogo em quadra (selecionar quadra no dropdown)
3. Reconecta a rede

- [ ] Aparece toast amarelo **"Verifique sua conexão com a internet. O jogo será sincronizado automaticamente quando voltar."**
- [ ] Após reconectar, em até 30s o jogo aparece corretamente em `live_matches` (verificar pelo site Live)
- [ ] Não trava o app durante o retry (max ~4s de delay nas 3 tentativas)

## Cenário 3 — Reconcile worker sincroniza após divergência (v3.97)

Simulação manual: depois de colocar jogo em quadra com sucesso, deletar manualmente a linha de `live_matches` no Supabase Studio. Esperar 30s.

- [ ] Em até 30s o Planner re-emite o upsert e a linha volta no Supabase
- [ ] No DevTools (Ctrl+Shift+I) → Console → `console.table(__fabdStats)` mostra `reconcileEvents > 0`

## Cenário 4 — Re-sortear preserva horário pelo par (v3.89)

1. Cria/abre chave Eliminatória com 4 atletas, sorteia
2. Anota o horário e quadra de cada match (R1 e R2)
3. Re-sorteia a mesma chave (ela tem confirmação extra agora)

- [ ] Matches que continuam tendo a mesma dupla mantêm horário/quadra/árbitro
- [ ] Matches novos (par diferente) ganham slot livre do início do dia
- [ ] Outras chaves do torneio NÃO são tocadas

## Cenário 5 — Bloqueio de re-sorteio com Em Quadra (v3.89)

1. Coloca um jogo de uma chave em quadra
2. Tenta re-sortear a mesma chave

- [ ] Aparece toast **"Não pode re-sortear "X": N jogo(s) em quadra agora."** e o sorteio NÃO acontece
- [ ] Tira o jogo da quadra, tenta re-sortear: aparece confirmação reforçada explicando perda de resultado (se tem finalizadas) ou simples se só pendentes

## Cenário 6 — TOKEN_REFRESHED silently (v3.97)

Demora ~1h pra disparar naturalmente. Atalho: deixar o app aberto durante torneio e observar.

- [ ] Após ~1h, Planner continua funcionando (queries não dão 401)
- [ ] No DevTools → `__fabdStats.authSignedOut === 0` (não houve logout indevido)

## Cenário 7 — SIGNED_OUT força reload (v3.97)

Pra simular: revogar a sessão do user no Supabase Studio Authentication → Users.

- [ ] Aparece toast vermelho **"Sessao expirada — faca login novamente"**
- [ ] App recarrega automaticamente em ~1.5s
- [ ] Tela de login OTP aparece

## Cenário 8 — Referee — clube nas laterais em singles (v4.1)

1. No Referee, abre um jogo de **simples** (SM/SF/SC)
2. Olha topo das laterais esquerda/direita

- [ ] Nome do clube de cada atleta aparece em cima das laterais (igual em duplas)
- [ ] Botão "Atualizar" no header da aba Jogos funciona — clicar atualiza lista
- [ ] Indicador "Atualizado há Xs" aparece e atualiza a cada 5s

---

## Comando de diagnóstico (DevTools)

Abrir Planner → `Ctrl+Shift+I` → aba Console → cola:

```js
console.table(window.__fabdStats);
```

Mostra:
| campo | significado |
|---|---|
| `realtimeUpdates` | eventos Realtime score recebidos |
| `rendersDeferred` | renders adiados por input em foco (se > 0, defer-when-typing está ativo) |
| `rendersFlushed` | renders executados após coalesce |
| `upsertMatchOk` / `upsertMatchNetwork` / `upsertMatchPermanent` | resultado de cada upsert |
| `removeFromCourtOk` / `removeFromCourtFail` | resultado de cada remove |
| `reconcileEvents` | vezes que o worker detectou divergência e re-sincronizou |
| `authSignedOut` | logouts forçados (sessão expirou e refresh falhou) |

Após o torneio, mandar print desse `console.table` pra revisão.
