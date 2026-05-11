// Helper compartilhado: carrega modulos globals-style num contexto sandbox.
import fs from 'fs';
import path from 'path';
import vm from 'vm';

export function loadModule(relPath, sharedCtx = {}) {
  const code = fs.readFileSync(path.resolve(relPath), 'utf8');
  const ctx = { ...sharedCtx };
  vm.runInNewContext(code, ctx);
  return ctx;
}
