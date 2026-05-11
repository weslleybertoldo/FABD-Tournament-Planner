// Helper compartilhado: carrega modulos globals-style num contexto sandbox.
import fs from 'fs';
import path from 'path';
import vm from 'vm';

export function loadModule(relPath, sharedCtx = {}) {
  const resolved = path.resolve(relPath);
  const code = fs.readFileSync(resolved, 'utf8');
  // Globals basicos pra modulos que dependam disso (sem precisar mockar em todo teste).
  const ctx = {
    console,
    setTimeout, clearTimeout, setInterval, clearInterval,
    ...sharedCtx
  };
  // filename: stack traces apontam pro arquivo real + V8 coverage atribui corretamente.
  vm.runInNewContext(code, ctx, { filename: resolved });
  return ctx;
}
