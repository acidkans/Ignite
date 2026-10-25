// @anchor strategy-tasks-qa-pdf-export
// Eksport PDF „Strategia, zadania, Q&A": każda gałąź główna WBS od nowej strony, w niej
// Strategia (wpisy potomków, czcionka maleje z głębokością) → Zadania (lista: zadanie + odpowiedzialny)
// → Q&A (pary pytanie/odpowiedź per pozycja). Układ wg mockupu test/mockup-pdf-strategia-zadania-qa.html.
// Zwraca { html, filename } — PDF renderuje backend (resolveArtifact → /pdf/render).
import { API_URL } from '../config';
import { esc, buildPdfDocument, fetchLogoDataUrl } from './wbsPdfExport';

// @anchor strategy-tasks-qa-pdf-css
const EXTRA_CSS = `
  .stq-branch { break-before: page; page-break-before: always; }
  .stq-branch:first-child { break-before: auto; page-break-before: auto; }
  .stq-head { display: flex; align-items: baseline; gap: 10px; margin: 4px 0 12px; break-after: avoid; page-break-after: avoid; }
  .stq-head .no, .stq-head .name { font-size: 17px; font-weight: bold; }
  .stq-head .name { text-transform: uppercase; letter-spacing: .03em; }
  .stq-head .stats { margin-left: auto; font-size: 9px; color: #9ca3af; text-transform: uppercase; letter-spacing: .08em; }
  .stq-block { margin-bottom: 18px; }
  .stq-title { display: flex; align-items: center; gap: 8px; font-size: 11px; font-weight: bold; text-transform: uppercase; letter-spacing: .12em; padding: 0 0 5px; margin-bottom: 8px; border-bottom: 2px solid; break-after: avoid; page-break-after: avoid; }
  .stq-title .ico { width: 18px; height: 18px; border-radius: 4px; color: #fff; display: inline-flex; align-items: center; justify-content: center; font-size: 10px; }
  .stq-title .count { margin-left: auto; font-size: 9px; font-weight: normal; letter-spacing: .05em; color: #6b7280; }
  .stq-strategy .stq-title { color: #1e3a8a; border-color: #1e3a8a; } .stq-strategy .ico { background: #1e3a8a; }
  .stq-tasks .stq-title { color: #065f46; border-color: #059669; } .stq-tasks .ico { background: #059669; }
  .stq-qa .stq-title { color: #92400e; border-color: #d97706; } .stq-qa .ico { background: #d97706; }
  /* Wpis strategii bez ramki i tła; nazwa maleje z głębokością (gałąź 17 px jest największa), wcięcie 12 px/poziom */
  .stq-entry { padding: 0 0 8px; margin-bottom: 8px; border-bottom: 1px solid #f0f0f0; break-inside: avoid; page-break-inside: avoid; }
  .stq-entry .path { font-size: 8px; color: #6b7280; text-transform: uppercase; letter-spacing: .08em; margin-bottom: 2px; }
  .stq-entry h3 { font-weight: bold; margin: 0 0 3px; color: #111; }
  .stq-entry p { margin: 0 0 3px 14px; font-size: 10px; line-height: 1.5; }
  /* Punktor przy nazwie liścia/pozycji — treść strategii pod nią wcięta, bez punktora */
  .stq-entry h3::before { content: "•"; color: #1e3a8a; display: inline-block; width: 14px; }
  .stq-entry.d0 h3 { font-size: 13px; } .stq-entry.d1 h3 { font-size: 12px; }
  .stq-entry.d2 h3 { font-size: 11px; } .stq-entry.d3 h3 { font-size: 10px; }
  .stq-entry.d1 { margin-left: 12px; } .stq-entry.d2 { margin-left: 24px; } .stq-entry.d3 { margin-left: 36px; }
  .stq-entry.d2 p, .stq-entry.d3 p { font-size: 9.5px; }
  .stq-tasklist { list-style: none; margin: 0; padding: 0; }
  .stq-tasklist li { display: flex; align-items: baseline; gap: 12px; padding: 5px 0 5px 16px; border-bottom: 1px solid #e5e7eb; font-size: 11px; position: relative; break-inside: avoid; page-break-inside: avoid; }
  .stq-tasklist li::before { content: ""; position: absolute; left: 3px; top: 10px; width: 6px; height: 6px; border-radius: 50%; background: #059669; }
  .stq-tasklist .t { flex: 1; font-weight: bold; }
  .stq-tasklist .who { color: #374151; white-space: nowrap; }
  .stq-tasklist li.done .t { text-decoration: line-through; color: #9ca3af; font-weight: normal; }
  .stq-tasklist li.done::before { background: #d1d5db; }
  .stq-qa-pos { font-size: 9.5px; font-weight: bold; color: #92400e; padding: 6px 0 3px; break-after: avoid; page-break-after: avoid; }
  .stq-qa table td { font-size: 9.5px; line-height: 1.4; padding: 4px 8px; background: none !important; }
  .stq-qa td.q { width: 50%; font-weight: bold; }
  .stq-qa td.q::before { content: "P: "; color: #d97706; }
  .stq-qa td.a::before { content: "O: "; color: #059669; font-weight: bold; }
  .stq-qa td.a.missing { color: #b45309; font-style: italic; background: #fffbeb !important; }
  .stq-empty { color: #9ca3af; font-style: italic; font-size: 10px; padding: 4px 0; }
`;

const parseQa = (qa) => {
    let list = qa;
    if (typeof qa === 'string') { try { list = JSON.parse(qa); } catch { list = []; } }
    return (Array.isArray(list) ? list : []).filter(p => (p?.question || '').trim() || (p?.answer || '').trim());
};

const personName = (u) => [u?.firstName, u?.lastName].filter(Boolean).join(' ') || u?.email || '—';

const paragraphs = (text) => String(text || '').trim().split('\n')
    .filter(l => l.trim()).map(l => `<p>${esc(l)}</p>`).join('');

// @anchor fetch-project-tasks-all
// Zadania projektu — otwarte i wykonane (endpoint zwraca jeden status na raz).
async function fetchProjectTasks(processNodeId) {
    const token = sessionStorage.getItem('token') || localStorage.getItem('token');
    const get = async (status) => {
        const res = await fetch(`${API_URL}/my-tasks/project/${processNodeId}?status=${status}`, { headers: { Authorization: `Bearer ${token}` } });
        return res.ok ? res.json() : [];
    };
    const [open, done] = await Promise.all([get('OPEN'), get('DONE')]);
    return [...(Array.isArray(open) ? open : []), ...(Array.isArray(done) ? done : [])];
}

// @anchor build-strategy-tasks-qa-pdf-artifact
export async function buildStrategyTasksQaPdfArtifact({ wbsData, processNodeId, orderName, versionLabel }) {
    const flat = Array.isArray(wbsData) ? wbsData : [];
    const byParent = new Map();
    for (const n of flat) {
        const pid = n.parentId || null;
        if (!byParent.has(pid)) byParent.set(pid, []);
        byParent.get(pid).push(n);
    }
    for (const list of byParent.values()) list.sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
    const roots = byParent.get(null) || [];

    const [tasks, logoDataUrl] = await Promise.all([
        processNodeId ? fetchProjectTasks(processNodeId) : Promise.resolve([]),
        fetchLogoDataUrl(),
    ]);
    const tasksByNode = new Map();
    for (const t of tasks) {
        if (!t.wbsNodeId) continue;
        if (!tasksByNode.has(t.wbsNodeId)) tasksByNode.set(t.wbsNodeId, []);
        tasksByNode.get(t.wbsNodeId).push(t);
    }

    // Pod-drzewo gałęzi w kolejności DFS: [{ node, depth, path }]
    const walk = (node, depth = 0, path = [], acc = []) => {
        acc.push({ node, depth, path });
        for (const c of (byParent.get(node.id) || [])) walk(c, depth + 1, [...path, node.name || ''], acc);
        return acc;
    };

    const branches = roots.map((root, i) => {
        const sub = walk(root);
        // Własne pole strategy gałęzi głównej to ZŁOŻENIE wpisów dzieci (composeBranchStrategy) —
        // pokazujemy je tylko wtedy, gdy dzieci nie mają nic, inaczej treść byłaby dwa razy.
        let strat = sub.filter(s => s.depth > 0 && (s.node.strategy || '').trim());
        if (!strat.length && (root.strategy || '').trim()) strat = [{ node: root, depth: 0, path: [] }];
        const branchTasks = sub.flatMap(s => tasksByNode.get(s.node.id) || []);
        const qa = sub.map(s => ({ node: s.node, pairs: parseQa(s.node.qa) })).filter(x => x.pairs.length);
        const qaCount = qa.reduce((a, x) => a + x.pairs.length, 0);
        const qaOpen = qa.reduce((a, x) => a + x.pairs.filter(p => !(p.answer || '').trim()).length, 0);
        const openTasks = branchTasks.filter(t => t.status !== 'DONE').length;

        const strategyHtml = strat.length
            // Ścieżka bez nazwy gałęzi głównej (stoi już w nagłówku strony) — tylko poziomy
            // pośrednie; wpis bezpośrednio pod gałęzią nie ma ścieżki wcale.
            ? strat.map(s => `<div class="stq-entry d${Math.min(s.depth, 3)}">
                ${s.path.length > 1 ? `<div class="path">${esc(s.path.slice(1).join(' › '))}</div>` : ''}
                <h3>${esc(s.node.name)}</h3>${paragraphs(s.node.strategy)}</div>`).join('')
            : '<div class="stq-empty">Strategia dla tej gałęzi nie została jeszcze opisana.</div>';

        const tasksHtml = branchTasks.length
            ? `<ul class="stq-tasklist">${branchTasks.map(t => `<li class="${t.status === 'DONE' ? 'done' : ''}"><span class="t">${esc(t.title)}</span><span class="who">${esc(personName(t.user))}</span></li>`).join('')}</ul>`
            : '<div class="stq-empty">Brak zadań w tej gałęzi.</div>';

        const qaHtml = qa.length
            ? qa.map(x => `<div class="stq-qa-pos">${esc(x.node.name)}</div><table><tbody>${x.pairs.map(p => {
                const a = (p.answer || '').trim();
                return `<tr><td class="q">${esc(p.question)}</td>${a ? `<td class="a">${esc(a)}</td>` : '<td class="a missing">brak odpowiedzi</td>'}</tr>`;
            }).join('')}</tbody></table>`).join('')
            : '<div class="stq-empty">Brak pytań w tej gałęzi.</div>';

        return `<section class="stq-branch">
  <div class="stq-head"><span class="no">${i + 1}</span><span class="name">${esc(root.name)}</span>
    <span class="stats">${strat.length} strategie · ${branchTasks.length} zadania · ${qaCount} Q&amp;A</span></div>
  <div class="stq-block stq-strategy"><div class="stq-title"><span class="ico">S</span>Strategia<span class="count">${strat.length} wpisy</span></div>${strategyHtml}</div>
  <div class="stq-block stq-tasks"><div class="stq-title"><span class="ico">✓</span>Zadania<span class="count">${openTasks} otwarte</span></div>${tasksHtml}</div>
  <div class="stq-block stq-qa"><div class="stq-title"><span class="ico">?</span>Pytania i odpowiedzi<span class="count">${qaCount}${qaOpen ? ` · ${qaOpen} bez odpowiedzi` : ''}</span></div>${qaHtml}</div>
</section>`;
    });

    const name = orderName || 'Projekt';
    const html = buildPdfDocument({
        logoDataUrl,
        title: `${name} — strategia, zadania, Q&A`,
        subtitle: versionLabel ? `Planowanie · wersja: ${versionLabel}` : 'Planowanie',
        date: new Date().toLocaleDateString('pl-PL', { day: '2-digit', month: 'long', year: 'numeric' }),
        bodyHtml: branches.length ? branches.join('') : '<div class="stq-empty">Brak gałęzi w strukturze projektu.</div>',
        extraCss: EXTRA_CSS,
    });
    const filename = `${String(name).trim().replace(/[\\/:*?"<>|\s]+/g, '_') || 'projekt'}_strategia_zadania_QA.pdf`;
    return { html, filename };
}
