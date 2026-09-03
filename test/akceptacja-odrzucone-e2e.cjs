// E2E na DEV: kciuk zamraża KOPIĘ wersji („<etykieta> zaakceptowany") bez pozycji odrzuconych,
// hurtem domyka statusy planu, a cofnięcie akceptacji je przywraca.
// Woła PRAWDZIWY `OrdersService` ze skompilowanego dist wewnątrz kontenera erp-backend,
// na prawdziwych danych, i na końcu PRZYWRACA stan wyjściowy (łącznie z usunięciem kopii).
//
// Uruchomienie:
//   docker cp test/akceptacja-odrzucone-e2e.cjs erp-backend:/usr/src/app/test-akceptacja.cjs
//   docker exec erp-backend node /usr/src/app/test-akceptacja.cjs
const { PrismaClient } = require('@prisma/client');
const { OrdersService } = require('/usr/src/app/dist/orders/orders.service');
const { VersioningService } = require('/usr/src/app/dist/ai/versioning.service');

const NODE = process.env.NODE_ID || '8de6036d-8ab8-42f0-8664-bf13a7d72571';
const VER = process.env.VERSION_ID || 'b7c9fa0f-c20a-4ed4-b12d-a5486dfd00b1';

let failed = 0;
const check = (name, ok, detail = '') => {
    if (!ok) failed++;
    console.log(`${ok ? 'OK  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};
const r2 = (x) => Math.round(x * 100) / 100;

(async () => {
    const prisma = new PrismaClient();
    const cls = { get: (k) => (k === 'user.roles' ? ['ADMIN'] : null) };
    const svc = new OrdersService(prisma, cls, new VersioningService(prisma));

    const sourceVersion = await prisma.projectVersion.findUnique({ where: { id: VER }, select: { label: true, isActive: true } });
    const versionsBefore = await prisma.projectVersion.findMany({ where: { nodeId: NODE }, select: { id: true, label: true, isActive: true } });
    const activeBefore = versionsBefore.find((v) => v.isActive)?.id ?? null;

    const all = await prisma.wbsNode.findMany({
        where: { nodeId: NODE, versionId: VER },
        select: { id: true, parentId: true, name: true, type: true, status: true, unitCost: true, quantity: true },
        orderBy: { sortOrder: 'asc' },
    });
    const before = new Map(all.map((n) => [n.id, n.status]));
    const byId = new Map(all.map((n) => [n.id, n]));
    const childCount = new Map();
    for (const n of all) if (n.parentId) childCount.set(n.parentId, (childCount.get(n.parentId) || 0) + 1);

    const isSummed = (n) => String(n.type || '').toLowerCase() !== 'group';
    const value = (n) => Math.max(0, n.unitCost || 0) * Math.max(0, n.quantity || 0);
    const fullSum = all.filter(isSummed).reduce((s, n) => s + value(n), 0);

    // NIEZALEŻNA implementacja domknięcia „odrzucona pozycja + jej poddrzewo" — test nie woła
    // helpera z kodu produkcyjnego, bo wtedy sprawdzałby go samym sobą.
    const closureOf = (rejectedIds) => {
        const out = new Set();
        for (const n of all) {
            let cur = n;
            let guard = 0;
            while (cur && guard++ < 100) {
                if (rejectedIds.includes(cur.id)) { out.add(n.id); break; }
                cur = cur.parentId ? byId.get(cur.parentId) : null;
            }
        }
        return out;
    };

    const positions = all.filter((n) => n.parentId != null && isSummed(n));
    const positionIds = new Set(positions.map((p) => p.id));
    const leaves = positions.filter((n) => !childCount.has(n.id) && value(n) > 0);
    const parentPos = positions.find((n) => (childCount.get(n.id) || 0) >= 2 && value(n) > 0);
    console.log(`Węzeł ${NODE}, wersja „${sourceVersion.label}" (${VER}): ${positions.length} pozycji, Σ ${fullSum.toFixed(2)} zł\n`);

    const createdVersionIds = new Set();
    const restore = async () => {
        for (const [id, status] of before) {
            await prisma.wbsNode.update({ where: { id }, data: { status } }).catch(() => {});
        }
    };

    try {
        // ── FAZA 1: dwie pozycje LIŚCIOWE odrzucone ──────────────────────────────
        const rejected = leaves.slice(0, 2);
        const rejectedIds = rejected.map((n) => n.id);
        const rejectedRoots = rejected.map((n) => n.id);
        const rejectedSumExpected = r2(rejected.reduce((s, n) => s + value(n), 0));
        await prisma.wbsNode.updateMany({ where: { id: { in: rejectedIds } }, data: { status: 'REJECTED' } });
        console.log(`FAZA 1 — odrzucone liście: ${rejected.map((n) => `${n.name.trim()} (${value(n).toFixed(2)} zł)`).join(', ')}\n`);

        const preview = await svc.acceptPreview(NODE, VER);
        check('preview: odrzucone poza sumą budżetu', Math.abs(preview.budgetSum - (fullSum - rejectedSumExpected)) < 0.02,
            `budgetSum=${preview.budgetSum}, oczekiwano ${r2(fullSum - rejectedSumExpected)}`);
        check('preview: licznik odrzuconych', preview.rejectedCount === 2, `rejectedCount=${preview.rejectedCount}`);
        check('preview: kwota odrzuconych', Math.abs(preview.rejectedSum - rejectedSumExpected) < 0.02,
            `rejectedSum=${preview.rejectedSum}, oczekiwano ${rejectedSumExpected}`);
        check('preview: nazwa przyszłej kopii', preview.snapshotLabel === `${sourceVersion.label} zaakceptowany`,
            `snapshotLabel=„${preview.snapshotLabel}"`);
        check('preview: licznik statusów do przestawienia', preview.toConfirmCount === positions.length - 2,
            `toConfirmCount=${preview.toConfirmCount}, pozycji poza odrzuconymi ${positions.length - 2}`);

        const accepted = await svc.accept(NODE, VER, null, 'test@dev');
        if (accepted.acceptedVersionId) createdVersionIds.add(accepted.acceptedVersionId);

        // Baseline wskazuje na KOPIĘ, nie na akceptowaną wersję.
        const snapshot = await prisma.projectVersion.findUnique({
            where: { id: accepted.acceptedVersionId }, select: { id: true, label: true, isActive: true },
        });
        check('kciuk: baseline wskazuje na kopię, nie na akceptowaną wersję', accepted.acceptedVersionId !== VER,
            `acceptedVersionId=${accepted.acceptedVersionId}`);
        check('kciuk: kopia ma nazwę „<wersja> zaakceptowany"', snapshot?.label === `${sourceVersion.label} zaakceptowany`,
            `label=„${snapshot?.label}"`);
        check('kciuk: kopia jest NIEAKTYWNA', snapshot?.isActive === false);
        const activeNow = (await prisma.projectVersion.findFirst({ where: { nodeId: NODE, isActive: true }, select: { id: true } }))?.id ?? null;
        check('kciuk: wersja aktywna bez zmian', activeNow === activeBefore, `${activeBefore} → ${activeNow}`);

        const snapRows = await prisma.wbsNode.findMany({
            where: { nodeId: NODE, versionId: snapshot.id },
            select: { id: true, name: true, type: true, status: true, sourceWbsNodeId: true, unitCost: true, quantity: true, parentId: true },
        });
        const snapRoots = new Set(snapRows.map((r) => r.sourceWbsNodeId ?? r.id));
        check('kopia: ani jednej pozycji ze statusem REJECTED', snapRows.every((r) => r.status !== 'REJECTED'),
            snapRows.filter((r) => r.status === 'REJECTED').map((r) => r.name).join(', '));
        check('kopia: odrzucone pozycje w ogóle nie istnieją w kopii', rejectedRoots.every((id) => !snapRoots.has(id)));
        check('kopia: pozycje kopii są CONFIRMED',
            snapRows.filter((r) => r.parentId != null && String(r.type || '').toLowerCase() !== 'group')
                .every((r) => r.status === 'CONFIRMED'));
        const snapSum = snapRows.filter(isSummed).reduce((s, r) => s + value(r), 0);
        check('kopia: suma kopii = suma bez odrzuconych', Math.abs(snapSum - (fullSum - rejectedSumExpected)) < 0.02,
            `${r2(snapSum)} vs ${r2(fullSum - rejectedSumExpected)}`);
        check('kciuk: licznik wyciętych', accepted.removedRejected === 2, `removedRejected=${accepted.removedRejected}`);

        // Akceptowana wersja zostaje NIETKNIĘTA — z odrzuconymi włącznie.
        const srcAfter = await prisma.wbsNode.findMany({ where: { nodeId: NODE, versionId: VER }, select: { id: true, status: true } });
        check('źródło: wersja akceptowana ma komplet wierszy', srcAfter.length === all.length, `${srcAfter.length}/${all.length}`);
        check('źródło: odrzucone dalej REJECTED w akceptowanej wersji',
            srcAfter.filter((p) => rejectedIds.includes(p.id) && p.status === 'REJECTED').length === 2);
        const notConfirmed = srcAfter.filter((p) => positionIds.has(p.id) && !rejectedIds.includes(p.id) && p.status !== 'CONFIRMED');
        check('źródło: reszta pozycji na CONFIRMED', notConfirmed.length === 0,
            notConfirmed.slice(0, 3).map((p) => `${p.id.slice(0, 8)}: ${p.status}`).join(' | '));

        const cmp = await svc.comparison(NODE);
        const rejectedRows = cmp.rows.filter((r) => rejectedIds.includes(r.baselineWbsNodeId) || rejectedIds.includes(r.wbsNodeId));
        check('porównanie: brak wierszy odrzuconych', rejectedRows.length === 0, `znaleziono ${rejectedRows.length}`);
        check('porównanie: suma baseline bez odrzuconych', cmp.kpi.baselineSum <= r2(fullSum - rejectedSumExpected) + 0.02,
            `baselineSum=${cmp.kpi.baselineSum}`);

        const revoked = await svc.revokeAccept(NODE, 'test weryfikacyjny — cofnięcie', 'test@dev');
        const afterRevoke = await prisma.wbsNode.findMany({ where: { nodeId: NODE, versionId: VER }, select: { id: true, status: true } });
        const notRestored = afterRevoke.filter((p) => p.status !== (before.get(p.id) || '') && !rejectedIds.includes(p.id));
        check('cofnięcie: pointer zdjęty', revoked.acceptedVersionId === null);
        check('cofnięcie: statusy wróciły do stanu sprzed kciuka', notRestored.length === 0,
            notRestored.slice(0, 3).map((p) => `${p.id.slice(0, 8)}: ${p.status} zamiast ${before.get(p.id)}`).join(' | '));
        check('cofnięcie: licznik cofniętych = licznik przestawionych', revoked.revertedCount === accepted.confirmedCount,
            `${revoked.revertedCount} vs ${accepted.confirmedCount}`);

        await restore();

        // ── FAZA 2: odrzucona pozycja Z PODDRZEWEM ───────────────────────────────
        if (!parentPos) {
            console.log('\nFAZA 2 pominięta — brak pozycji z co najmniej dwiema podpozycjami');
        } else {
            await prisma.wbsNode.update({ where: { id: parentPos.id }, data: { status: 'REJECTED' } });
            const closure = closureOf([parentPos.id]);
            const closureNodes = all.filter((n) => closure.has(n.id) && isSummed(n));
            const closureSum = r2(closureNodes.reduce((s, n) => s + value(n), 0));
            const closurePositions = closureNodes.filter((n) => positionIds.has(n.id)).length;
            console.log(`\nFAZA 2 — odrzucona pozycja z poddrzewem: ${parentPos.name.trim()} (${closureNodes.length} węzłów, ${closureSum.toFixed(2)} zł)\n`);

            const p2 = await svc.acceptPreview(NODE, VER);
            check('poddrzewo: licznik odrzuconych obejmuje podpozycje', p2.rejectedCount === closureNodes.length,
                `rejectedCount=${p2.rejectedCount}, oczekiwano ${closureNodes.length}`);
            check('poddrzewo: budżet pomniejszony o całe poddrzewo', Math.abs(p2.budgetSum - (fullSum - closureSum)) < 0.02,
                `budgetSum=${p2.budgetSum}, oczekiwano ${r2(fullSum - closureSum)}`);
            check('poddrzewo: druga kopia dostaje własną nazwę', p2.snapshotLabel !== `${sourceVersion.label} zaakceptowany`,
                `snapshotLabel=„${p2.snapshotLabel}"`);

            const acc2 = await svc.accept(NODE, VER, null, 'test@dev');
            if (acc2.acceptedVersionId) createdVersionIds.add(acc2.acceptedVersionId);
            const snap2 = await prisma.wbsNode.findMany({
                where: { nodeId: NODE, versionId: acc2.acceptedVersionId },
                select: { id: true, sourceWbsNodeId: true, unitCost: true, quantity: true, type: true, status: true },
            });
            const snap2Roots = new Set(snap2.map((r) => r.sourceWbsNodeId ?? r.id));
            check('poddrzewo: w kopii nie ma ani odrzuconej pozycji, ani jej podpozycji',
                [...closure].every((id) => !snap2Roots.has(id)),
                [...closure].filter((id) => snap2Roots.has(id)).length + ' zostało');
            check('poddrzewo: licznik wyciętych = wielkość poddrzewa', acc2.removedRejected === closure.size,
                `${acc2.removedRejected} vs ${closure.size}`);
            const snap2Sum = snap2.filter(isSummed).reduce((s, r) => s + value(r), 0);
            check('poddrzewo: suma kopii = suma bez poddrzewa', Math.abs(snap2Sum - (fullSum - closureSum)) < 0.02,
                `${r2(snap2Sum)} vs ${r2(fullSum - closureSum)}`);
            check('poddrzewo: licznik przestawionych pomija poddrzewo', acc2.confirmedCount === positions.length - closurePositions,
                `${acc2.confirmedCount} vs ${positions.length - closurePositions}`);
            await svc.revokeAccept(NODE, 'test weryfikacyjny — cofnięcie fazy 2', 'test@dev');
        }
    } finally {
        await restore();
        // Kopie utworzone przez test kasujemy — na dev ma nie zostać śmieć w liście wersji.
        // `ProjectVersion` kaskaduje na wiersze WBS, karty i wymagania kopii.
        for (const id of createdVersionIds) {
            await prisma.processNode.updateMany({ where: { id: NODE, acceptedVersionId: id }, data: { acceptedVersionId: null } });
            await prisma.projectVersion.delete({ where: { id } }).catch((e) => console.log('  (nie udało się usunąć kopii', id, e.message, ')'));
        }
        const restored = await prisma.wbsNode.findMany({
            where: { nodeId: NODE, versionId: VER }, select: { id: true, status: true },
        });
        const diff = restored.filter((p) => p.status !== (before.get(p.id) || ''));
        const versionsAfter = await prisma.projectVersion.findMany({ where: { nodeId: NODE }, select: { id: true } });
        check('sprzątanie: stan wyjściowy przywrócony', diff.length === 0, `${diff.length} rozjazdów`);
        check('sprzątanie: lista wersji bez kopii testowych', versionsAfter.length === versionsBefore.length,
            `${versionsBefore.length} → ${versionsAfter.length}`);
        const node = await prisma.processNode.findUnique({ where: { id: NODE }, select: { acceptedVersionId: true, orderStage: true } });
        check('sprzątanie: węzeł bez baseline', node.acceptedVersionId === null, `orderStage=${node.orderStage}`);
        await prisma.$disconnect();
        console.log(failed === 0 ? '\nWSZYSTKO OK' : `\n${failed} BŁĘDÓW`);
        process.exit(failed === 0 ? 0 : 1);
    }
})();
