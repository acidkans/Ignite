// Sprawdza assertCanDisconnect: nie-admin będący kontem wspólnym → 403, admin/inne konto → OK.
const { OneDriveService } = require('../apps/backend/dist/onedrive/onedrive.service');
const shared = { userId: 'wspolny', createdAt: new Date() };
const prisma = { userMsToken: { findFirst: async () => shared } };
const config = { get: () => '' };
const s = Object.create(OneDriveService.prototype);
s.prisma = prisma; s.config = config;
(async () => {
  const cases = [['wspolny', false, 403], ['wspolny', true, 'ok'], ['inny', false, 'ok']];
  for (const [uid, admin, want] of cases) {
    let got = 'ok';
    try { await s.assertCanDisconnect(uid, admin); } catch (e) { got = e.getStatus ? e.getStatus() : e.message; }
    console.log(uid, admin ? 'ADMIN' : 'nie-admin', '→', got, got === want ? 'PASS' : 'FAIL');
  }
})();
