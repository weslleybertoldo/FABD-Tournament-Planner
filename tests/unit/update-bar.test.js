import { describe, it, expect } from 'vitest';
import { loadModule } from './_loader.js';

const { updateBarDownload } = loadModule('src/js/modules/update-bar.js');

const release = (nomes, extra = {}) => ({
  tag_name: 'v4.122',
  assets: nomes.map(n => ({ name: n, browser_download_url: 'https://github.com/x/releases/download/' + n })),
  ...extra
});
const OFICIAL = release([
  'FABD-Tournament-Planner-Setup-4.122.0.exe',
  'FABD-Tournament-Planner-Setup-4.122.0.exe.blockmap',
  'latest.yml',
  'FABD-Tournament-Planner-4.122.0.AppImage',
  'latest-linux.yml'
]);
const BETA = release([
  'FABD-Tournament-Planner-Beta-Setup-4.106.0-beta.35.exe',
  'FABD-Tournament-Planner-Beta-4.106.0-beta.35.AppImage'
], { tag_name: 'v4.106.0-beta.35', beta_channel: true, up_to_date: false });

describe('updateBarDownload (faixa "Nova versao disponivel")', () => {
  it('Windows, app oficial: o Baixar abre o instalador .exe (igual antes)', () => {
    expect(updateBarDownload(OFICIAL, false)).toEqual({ url: 'https://github.com/x/releases/download/FABD-Tournament-Planner-Setup-4.122.0.exe' });
  });

  it('Linux, app oficial: sem faixa (o app baixa sozinho e pergunta "Reiniciar agora?")', () => {
    expect(updateBarDownload(OFICIAL, true)).toBeNull();
  });

  it('Linux, beta (nao se atualiza sozinho): faixa com o AppImage beta, nunca o .exe', () => {
    expect(updateBarDownload(BETA, true)).toEqual({ url: 'https://github.com/x/releases/download/FABD-Tournament-Planner-Beta-4.106.0-beta.35.AppImage' });
  });

  it('Windows, beta: o .exe beta (igual antes)', () => {
    expect(updateBarDownload(BETA, false)).toEqual({ url: 'https://github.com/x/releases/download/FABD-Tournament-Planner-Beta-Setup-4.106.0-beta.35.exe' });
  });

  it('release sem o arquivo da plataforma: faixa sem o botao Baixar', () => {
    const betaAntiga = release(['FABD-Tournament-Planner-Beta-Setup-4.106.0-beta.33.exe'], { beta_channel: true });
    expect(updateBarDownload(betaAntiga, true)).toEqual({ url: '' });
    expect(updateBarDownload({ tag_name: 'v4.122' }, false)).toEqual({ url: '' });
  });
});
