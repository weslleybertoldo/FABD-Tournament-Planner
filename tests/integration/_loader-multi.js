// Helper: carrega varios modulos no MESMO contexto VM (simula concat de scripts
// no index.html). Necessario pra testar interacoes entre modulos.
import fs from 'fs';
import path from 'path';
import vm from 'vm';

export function loadModulesShared(relPaths, sharedCtx = {}) {
  const ctx = {
    console,
    setTimeout, clearTimeout, setInterval, clearInterval,
    Math, JSON, Map, Set, Array, Object, Number, String, Boolean, Date,
    Error, Promise, RegExp,
    ...sharedCtx,
  };
  vm.createContext(ctx);
  for (const rel of relPaths) {
    const resolved = path.resolve(rel);
    const code = fs.readFileSync(resolved, 'utf8');
    vm.runInContext(code, ctx, { filename: resolved });
  }
  return ctx;
}
