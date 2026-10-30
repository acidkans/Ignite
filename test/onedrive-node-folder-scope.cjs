// Sprawdza assertInNodeFolder/listNodeItems: elementy pod folderem zamówienia OK, spoza → 403.
const axios = require('../apps/backend/node_modules/axios').default;
const { OneDriveService } = require('../apps/backend/dist/onedrive/onedrive.service');
const items = {
  root: { id: 'root', name: 'Zam 1', parentReference: { path: '/drive/root:/Zamowienia' } },
  sub: { id: 'sub', name: '01 Fin', parentReference: { path: '/drive/root:/Zamowienia/Zam 1' } },
  deep: { id: 'deep', name: 'a.pdf', parentReference: { path: '/drive/root:/Zamowienia/Zam 1/01 Fin' } },
  sibling: { id: 'sibling', name: 'Zam 10', parentReference: { path: '/drive/root:/Zamowienia' } },
  prefix: { id: 'prefix', name: 'x.pdf', parentReference: { path: '/drive/root:/Zamowienia/Zam 10' } },
  up: { id: 'up', name: 'Zamowienia', parentReference: { path: '/drive/root:' } },
};
axios.get = async (url) => {
  const m = url.match(/items\/([^/]+)(\/children)?$/);
  if (m[2]) return { data: { value: [{ id: 'f', name: 'B', folder: { childCount: 1 } }, { id: 'p', name: 'a.pdf', size: 10, file: { mimeType: 'application/pdf' } }, { id: 'g', name: 'A', folder: {} }] } };
  return { data: items[m[1]] };
};
const s = Object.create(OneDriveService.prototype);
s.prisma = { processNode: { findUnique: async () => ({ id: 'n', oneDriveFolderId: 'root', oneDriveDriveId: 'd' }) } };
s.getSharedToken = async () => 't';
(async () => {
  const cases = [[undefined, 'ok'], ['sub', 'ok'], ['deep', 'ok'], ['sibling', 403], ['prefix', 403], ['up', 403]];
  for (const [id, want] of cases) {
    let got = 'ok', res;
    try { res = await s.listNodeItems('n', id); } catch (e) { got = e.getStatus ? e.getStatus() : e.message; }
    console.log(String(id).padEnd(9), '→', got, got === want ? 'PASS' : 'FAIL', res ? `atRoot=${res.atRoot} [${res.items.map(i => i.name).join(', ')}]` : '');
  }
})();
