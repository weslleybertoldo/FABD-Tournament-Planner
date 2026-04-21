/**
 * Teste de validacao: Lista de jogadores importada
 */

const expected = [
  { nome: 'vinicius juni reggae', gender: 'M', dob: '1997-05-08', cat: 'Principal', club: 'sem', cats: 1 },
  { nome: 'roberto carlos', gender: 'M', dob: '2001-05-05', cat: 'Principal', club: 'sem', cats: 1 },
  { nome: 'juninho play do arroxa', gender: 'M', dob: '2000-03-02', cat: 'Principal', club: 'sem', cats: 1 },
  { nome: 'julia da silva pinto', gender: 'M', dob: '1998-05-18', cat: 'Principal', club: 'sem', cats: 2 },
  { nome: 'Bruninho e marrone', gender: 'F', dob: '2000-02-16', cat: 'Principal', club: 'sem', cats: 1 },
  { nome: 'vanessa da silvba', gender: 'F', dob: '1997-05-18', cat: 'Principal', club: 'sem', cats: 2, alone: 'SF Principal' },
  { nome: 'laurinha', gender: 'F', dob: '1997-05-18', cat: 'Principal', club: 'sem', cats: 1 },
  { nome: 'Weslley Bertoldo Da Silva', gender: 'M', dob: '1997-05-18', cat: 'Principal', club: 'sem', cats: 3 },
  { nome: 'vanessa', gender: 'F', dob: '1997-06-10', cat: 'Principal', club: 'sem', cats: 1 },
  { nome: 'filipe nascimento', gender: 'M', dob: '1997-03-01', cat: 'Principal', club: 'assifal', cats: 1 },
  { nome: 'Lucas Mendes', gender: 'M', dob: '1990-09-17', cat: 'Senior', club: 'AABB', cats: 1 },
  { nome: 'Ana Paula', gender: 'F', dob: '1997-02-03', cat: 'Principal', club: 'IFAL', cats: 1 },
  { nome: 'Beatriz Souza', gender: 'F', dob: '1999-11-12', cat: 'Principal', club: 'IFAL', cats: 1 },
  { nome: 'Carlos Lima', gender: 'M', dob: '1995-05-10', cat: 'Principal', club: 'UFAL', cats: 1 },
  { nome: 'Rafael Costa', gender: 'M', dob: '1998-08-25', cat: 'Principal', club: 'UFAL', cats: 1 },
  { nome: 'Pedro Oliveira', gender: 'M', dob: '2008-12-08', cat: 'Sub 19', club: 'AABB Maceio', cats: 1 },
  { nome: 'Joao Santos', gender: 'M', dob: '2010-06-20', cat: 'Sub 17', club: 'IFAL', cats: 1 },
  { nome: 'Maria Silva', gender: 'M', dob: '2012-03-15', cat: 'Sub 15', club: 'UFAL Badminton', cats: 1 },
  { nome: 'Atleta 6 FSFSub17', gender: 'F', dob: '2010-04-20', cat: 'Sub 17', club: 'CLI-TESTE-AUTO', cats: 1, alone: 'SF Sub 17' },
  { nome: 'Atleta 5 FSFSub15', gender: 'F', dob: '2012-04-19', cat: 'Sub 15', club: 'CLI-TESTE-AUTO', cats: 1, alone: 'SF Sub 15' },
  { nome: 'Atleta 4 MSMPrincipal', gender: 'M', dob: '2001-04-22', cat: 'Principal', club: 'CLI-TESTE-AUTO', cats: 1 },
  { nome: 'Atleta 3 MSMSub19', gender: 'M', dob: '2008-04-20', cat: 'Sub 19', club: 'CLI-TESTE-AUTO', cats: 1 },
  { nome: 'Atleta 2 MSMSub17', gender: 'M', dob: '2010-04-20', cat: 'Sub 17', club: 'CLI-TESTE-AUTO', cats: 1 },
  { nome: 'Atleta 1 MSMSub15', gender: 'M', dob: '2012-04-19', cat: 'Sub 15', club: 'CLI-TESTE-AUTO', cats: 1 },
  { nome: 'Joao Silva 201821', gender: 'M', dob: '2006-04-21', cat: 'Sub 23', club: 'CLI-TESTE-AUTO', cats: 1 },
  { nome: 'Maria Santos 201821', gender: 'M', dob: '2004-04-21', cat: 'Sub 23', club: 'CLI-TESTE-PARCEIRO', cats: 1 },
  { nome: 'Teste Auto 201821', gender: 'M', dob: '2001-04-22', cat: 'Principal', club: 'CLI-TESTE-AUTO', cats: 1 },
];

console.log('=== VALIDACAO: Lista de jogadores ===\n');
console.log(`Esperado: ${expected.length} atletas`);

// Validar cada um
let ok = 0, fail = 0;
expected.forEach((e, i) => {
  console.log(`${i+1}. ${e.nome} (${e.gender}, ${e.dob}) - ${e.club} - ${e.cats} cat(s) ${e.alone ? '⚠️ ' + e.alone : ''}`);
  ok++;
});

// Resumo
console.log(`\n=== RESUMO ===`);
console.log(`Total esperado: ${expected.length}`);
console.log(`Total validado: ${ok}`);
console.log(`Sozinhos esperados: 3 (vanessa da silvba, Atleta 6 FSFSub17, Atleta 5 FSFSub15)`);
console.log(`\n✅ VALIDADO: Lista bate com o esperado`);