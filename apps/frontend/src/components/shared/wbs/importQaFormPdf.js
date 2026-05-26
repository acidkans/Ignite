import { PDFDocument, PDFName } from 'pdf-lib';

// Normalizacja tekstu — odporna na różnice whitespace/wielkości liter
const norm = (s) => String(s || '').replace(/\s+/g, ' ').trim().toLowerCase();

// Czyta metadane Q&A z info dict PDF (zapisane podczas eksportu)
function readQaMeta(pdfDoc) {
    try {
        const dict = pdfDoc.getInfoDict();
        const val = dict.get(PDFName.of('QaMeta'));
        if (!val) return null;
        let str = '';
        if (typeof val.decodeText === 'function') str = val.decodeText();
        else if (typeof val.asString === 'function') str = val.asString();
        if (!str) return null;
        const parsed = JSON.parse(str);
        if (!parsed || !Array.isArray(parsed.fields)) return null;
        return parsed;
    } catch {
        return null;
    }
}

export async function importQaFormPdf(fileBuffer, wbsData) {
    const pdfDoc = await PDFDocument.load(fileBuffer, { ignoreEncryption: true });
    const form = pdfDoc.getForm();

    const allNodes = wbsData || [];
    const byId = new Map(allNodes.map(n => [String(n.id), n]));

    const getWbsPath = (node) => {
        const segs = [];
        let cur = node;
        while (cur) {
            segs.unshift(cur.name || '');
            cur = cur.parentId ? byId.get(String(cur.parentId)) : null;
        }
        return segs.join(' / ');
    };

    // Indeksy do dopasowania: branchPath → node oraz question → [{node, qaIdx}]
    const pathToNode = new Map();
    const questionToTargets = new Map();
    for (const n of allNodes) {
        pathToNode.set(norm(getWbsPath(n)), n);
        if (!Array.isArray(n.qa)) continue;
        n.qa.forEach((p, qi) => {
            const key = norm(p?.question);
            if (!key) return;
            if (!questionToTargets.has(key)) questionToTargets.set(key, []);
            questionToTargets.get(key).push({ node: n, qaIdx: qi });
        });
    }

    // Hierarchia dopasowania metadanych eksportu → bieżący węzeł:
    //  1) ten sam nodeId + to samo pytanie (po normalizacji)
    //  2) ta sama ścieżka WBS + to samo pytanie
    //  3) ten sam nodeId + zachowany qaIdx (pytanie zmieniono)
    //  4) samo pytanie — tylko gdy jest globalnie unikalne w drzewie
    const findTarget = (entry) => {
        const targetQ = norm(entry.question);
        if (entry.nodeId != null) {
            const node = byId.get(String(entry.nodeId));
            if (node && Array.isArray(node.qa) && targetQ) {
                const idx = node.qa.findIndex(p => norm(p?.question) === targetQ);
                if (idx >= 0) return { node, qaIdx: idx };
            }
        }
        if (entry.branchPath && targetQ) {
            const node = pathToNode.get(norm(entry.branchPath));
            if (node && Array.isArray(node.qa)) {
                const idx = node.qa.findIndex(p => norm(p?.question) === targetQ);
                if (idx >= 0) return { node, qaIdx: idx };
            }
        }
        if (entry.nodeId != null && typeof entry.qaIdx === 'number') {
            const node = byId.get(String(entry.nodeId));
            if (node && Array.isArray(node.qa) && node.qa[entry.qaIdx]) {
                return { node, qaIdx: entry.qaIdx };
            }
        }
        if (targetQ) {
            const matches = questionToTargets.get(targetQ) || [];
            if (matches.length === 1) return matches[0];
        }
        return null;
    };

    const readFieldValue = (name) => {
        try {
            return form.getTextField(name).getText() || '';
        } catch {
            return '';
        }
    };

    // Klony qa per nodeId — modyfikujemy lokalnie, na końcu filtrujemy tylko realnie zmienione
    const mutated = new Map(); // String(nodeId) → cloned qa array
    const getMutable = (node) => {
        const key = String(node.id);
        if (!mutated.has(key)) {
            mutated.set(key, (Array.isArray(node.qa) ? node.qa : []).map(p => ({ ...p })));
        }
        return mutated.get(key);
    };

    const meta = readQaMeta(pdfDoc);

    if (meta) {
        // Tryb metadanych — puste pole = brak zmiany (zachowuje istniejącą odpowiedź).
        // Eksport rysuje istniejące odpowiedzi jako statyczny tekst, a pole formularza pozostaje
        // puste — wpisanie czegokolwiek przez użytkownika to świadomy edit, który nadpisze.
        for (const entry of meta.fields) {
            const target = findTarget(entry);
            if (!target) continue;
            const fieldValue = readFieldValue(entry.name);
            if (!fieldValue.trim()) continue;
            const qa = getMutable(target.node);
            qa[target.qaIdx] = { ...qa[target.qaIdx], answer: fieldValue };
        }
    } else {
        // Fallback dla starych PDF bez metadanych — pozycyjne dopasowanie DFS
        const treeWalkOrder = (flat) => {
            const byParent = new Map();
            for (const n of flat) {
                const pid = n.parentId || null;
                if (!byParent.has(pid)) byParent.set(pid, []);
                byParent.get(pid).push(n);
            }
            for (const children of byParent.values()) children.sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
            const result = [];
            const walk = (pid) => { for (const n of (byParent.get(pid) || [])) { result.push(n); walk(n.id); } };
            walk(null);
            return result;
        };

        const nodes = treeWalkOrder(allNodes)
            .filter(n => Array.isArray(n.qa) && n.qa.some(p => (p?.question || '').trim()));

        let fieldIdx = 0;
        for (const node of nodes) {
            const indices = node.qa
                .map((p, i) => ({ p, i }))
                .filter(({ p }) => (p?.question || '').trim())
                .map(({ i }) => i);
            for (const origIdx of indices) {
                const fieldValue = readFieldValue(`answer_${fieldIdx++}`);
                if (fieldValue && fieldValue !== (node.qa[origIdx]?.answer || '')) {
                    const qa = getMutable(node);
                    qa[origIdx] = { ...qa[origIdx], answer: fieldValue };
                }
            }
        }
    }

    // Zostaw tylko węzły z realną zmianą jakiejkolwiek odpowiedzi
    const updates = [];
    for (const [nodeIdKey, qa] of mutated.entries()) {
        const original = byId.get(nodeIdKey);
        const origQa = Array.isArray(original?.qa) ? original.qa : [];
        const changed = qa.some((p, i) => (p?.answer || '') !== (origQa[i]?.answer || ''));
        if (changed) updates.push({ nodeId: original?.id ?? nodeIdKey, qa });
    }

    return updates;
}
