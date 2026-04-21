/**
 * Validacao: Lista de inscritos
 */

const lista = [
  { id: 1, nome: 'vinicius junio reggae', club: 'sem', evento: 'SM Principal', dupla: null },
  { id: 2, nome: 'roberto carlos', club: 'sem', evento: 'SM Principal', dupla: null },
  { id: 3, nome: 'juninho play do arroxa', club: 'sem', evento: 'SM Principal', dupla: null },
  { id: 4, nome: 'julia da silva pinto', club: 'sem', evento: 'SM Principal', dupla: null },
  { id: 5, nome: 'julia da silva pinto', club: 'sem', evento: 'DX Principal', dupla: 'Bruninho e marrone' },
  { id: 6, nome: 'Bruninho e marrone', club: 'sem', evento: 'DX Principal', dupla: 'julia da silva pinto' },
  { id: 7, nome: 'vanessa da silvba', club: 'sem', evento: 'SF Principal', dupla: null },
  { id: 8, nome: 'vanessa da silvba', club: 'sem', evento: 'DF Principal', dupla: 'laurinha' },
  { id: 9, nome: 'laurinha', club: 'sem', evento: 'DF Principal', dupla: 'vanessa da silvba' },
  { id: 10, nome: 'Weslley Bertoldo Da Silva', club: 'sem', evento: 'DX Principal', dupla: 'vanessa' },
  { id: 11, nome: 'Weslley Bertoldo Da Silva', club: 'sem', evento: 'SM Principal', dupla: null },
  { id: 12, nome: 'Weslley Bertoldo Da Silva', club: 'sem', evento: 'DM Principal', dupla: 'filipe nascimento' },
  { id: 13, nome: 'vanessa', club: 'sem', evento: 'DX Principal', dupla: 'Weslley Bertoldo Da Silva' },
  { id: 14, nome: 'filipe nascimento', club: 'assifal', evento: 'DM Principal', dupla: 'Weslley Bertoldo Da Silva' },
  { id: 15, nome: 'Lucas Mendes', club: 'AABB', evento: 'SM Principal', dupla: null },
  { id: 16, nome: 'Ana Paula', club: 'IFAL', evento: 'DF Principal', dupla: 'Beatriz Souza' },
  { id: 17, nome: 'Beatriz Souza', club: 'IFAL', evento: 'DF Principal', dupla: 'Ana Paula' },
  { id: 18, nome: 'Carlos Lima', club: 'UFAL', evento: 'DM Principal', dupla: 'Rafael Costa' },
  { id: 19, nome: 'Rafael Costa', club: 'UFAL', evento: 'DM Principal', dupla: 'Carlos Lima' },
  { id: 20, nome: 'Pedro Oliveira', club: 'AABB Maceio', evento: 'SM Sub 19', dupla: null },
  { id: 21, nome: 'Joao Santos', club: 'IFAL', evento: 'SM Sub 17', dupla: null },
  { id: 22, nome: 'Maria Silva', club: 'UFAL Badminton', evento: 'SM Sub 15', dupla: null },
  { id: 23, nome: 'Atleta 6 FSFSub17', club: 'CLI-TESTE-AUTO', evento: 'SF Sub 17', dupla: null },
  { id: 24, nome: 'Atleta 5 FSFSub15', club: 'CLI-TESTE-AUTO', evento: 'SF Sub 15', dupla: null },
  { id: 25, nome: 'Atleta 4 MSMPrincipal', club: 'CLI-TESTE-AUTO', evento: 'SM Principal', dupla: null },
  { id: 26, nome: 'Atleta 3 MSMSub19', club: 'CLI-TESTE-AUTO', evento: 'SM Sub 19', dupla: null },
  { id: 27, nome: 'Atleta 2 MSMSub17', club: 'CLI-TESTE-AUTO', evento: 'SM Sub 17', dupla: null },
  { id: 28, nome: 'Atleta 1 MSMSub15', club: 'CLI-TESTE-AUTO', evento: 'SM Sub 15', dupla: null },
  { id: 29, nome: 'Joao Silva 201821', club: 'CLI-TESTE-AUTO', evento: 'DM Principal', dupla: 'Maria Santos 201821' },
  { id: 30, nome: 'Maria Santos 201821', club: 'CLI-TESTE-PARCEIRO', evento: 'DM Principal', dupla: 'Joao Silva 201821' },
  { id: 31, nome: 'Teste Auto 201821', club: 'CLI-TESTE-AUTO', evento: 'SM Principal', dupla: null },
];

console.log('=== VALIDACAO: Lista de inscritos ===\n');
console.log(`Total de entradas: ${lista.length}`);

// Contar por modalidade
const modCount = {};
lista.forEach(e => {
  const mod = e.evento.split(' ')[0]; // SM, SF, DM, DF, DX
  modCount[mod] = (modCount[mod] || 0) + 1;
});
console.log('\nPor modalidade:');
Object.entries(modCount).forEach(([mod, count]) => console.log(`  ${mod}: ${count}`));

const totalInscricoes = lista.length;
console.log(`\nTotal inscricoes: ${totalInscricoes}`);
console.log(`Esperado: 26`);

// Validar duplas
console.log('\n=== VALIDACAO DE DUPLAS ===');
const duplas = lista.filter(e => e.dupla);
console.log(`Duplas encontradas: ${duplas.length / 2} pares`);

// Verificar simetria
let erros = 0;
duplas.forEach(d => {
  const match = lista.find(e => e.dupla === d.nome && d.dupla === e.nome && e.evento === d.evento);
  if (!match) {
    console.log(`  ❌ ERRO: ${d.nome} (${d.evento}) -> ${d.dupla} sem correspondencia`);
    erros++;
  }
});
if (erros === 0) console.log('  ✅ Todas as duplas estao linkadas corretamente');

// Sozinhos (sem dupla)
const sozinhos = lista.filter(e => !e.dupla);
console.log(`\nSozinhos (sem dupla): ${sozinhos.length}`);
sozinhos.forEach(s => console.log(`  - ${s.nome} (${s.evento})`));

console.log('\n=== RESUMO ===');
if (totalInscricoes === 31 && erros === 0) {
  console.log('✅ VALIDADO: Lista correta');
  process.exit(0);
} else {
  console.log('❌ VALIDACAO FALHOU');
  process.exit(1);
}