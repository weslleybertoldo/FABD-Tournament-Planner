// =====================================================================
// Faixa "Nova versao disponivel" (checkAutoUpdate, app.js) — funcao pura, sem globals.
//
// No Linux (AppImage) o app oficial se atualiza sozinho desde a v4.121: baixa e
// pergunta "Reiniciar agora?" no canto. La a faixa nao aparece — o "Baixar" dela
// abria o instalador .exe do Windows, que nao serve no Linux. O beta nao se
// atualiza sozinho: no Linux a faixa continua, com o AppImage da prerelease.
// No Windows nada muda: o "Baixar" abre o instalador .exe.
// =====================================================================

// data = release do GitHub (app:checkUpdate); linux = app rodando no Linux.
// null = sem faixa; { url } = arquivo que o "Baixar" abre (url vazia = sem o botao).
function updateBarDownload(data, linux) {
  if (linux && !data.beta_channel) return null;
  const ext = linux ? '.AppImage' : '.exe';
  const arquivo = (data.assets || []).find(a => (a.name || '').endsWith(ext));
  return { url: arquivo ? arquivo.browser_download_url : '' };
}
