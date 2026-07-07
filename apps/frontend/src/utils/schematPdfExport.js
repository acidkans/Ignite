// Buduje sekcję HTML "Schemat" (znaczniki + Q&A + strony schematów z naniesionymi markerami)
// współdzieloną przez: eksport PDF w SchematTab (samodzielny raport) i eksport Oferty w UnifiedWbsPanel (sekcja w środku).
import { API_URL } from '../config';
import { pdfjs } from 'react-pdf';

pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

const esc = (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export const SCHEMAT_SECTION_CSS = `
  .section { margin-bottom: 22px; }
  .section-header { font-size: 10px; font-weight: bold; text-transform: uppercase; letter-spacing: 0.12em; background: #1a1a2e; color: #fff; padding: 7px 12px; break-after: avoid; page-break-after: avoid; break-inside: avoid; page-break-inside: avoid; }
  .sch-table { width: 100%; border-collapse: collapse; margin-bottom: 8px; }
  .sch-table th { background: #1e40af; color: white; padding: 6px 8px; text-align: left; font-size: 10px; text-transform: uppercase; letter-spacing: 0.05em; }
  .sch-table td { padding: 4px 8px; border-bottom: 1px solid #e5e7eb; vertical-align: top; }
  .sch-table tr:nth-child(even) td { background: #f9fafb; }
  .sch-table tr.text-row td:nth-child(1) { width: 24px; color: #6b7280; }
  .sch-table tr.text-row td:nth-child(2) { width: 22%; font-weight: bold; color: #1e40af; }
  .sch-table tr.text-row td:nth-child(3) { width: 28%; }
  .sch-table tr.img-row td, .sch-table tr.note-row td { background: #f8faff; }
  .sch-table tr.note-row td { font-style: italic; color: #555; font-size: 10px; }
  .sch-table tr { break-inside: avoid; page-break-inside: avoid; }
  .qa-section { page-break-before: always; break-before: page; padding-top: 4px; }
  .qa-block { margin-bottom: 16px; break-inside: avoid; page-break-inside: avoid; }
  .qa-node-hdr { background: #dbeafe; color: #1e40af; font-weight: bold; padding: 7px 12px; font-size: 11px; }
  .qa-tbl { width: 100%; border-collapse: collapse; table-layout: fixed; margin: 0; }
  .qa-th { background: #e8eef6; color: #4b5563; font-size: 9px; text-transform: uppercase; letter-spacing: 0.05em; padding: 5px 10px; text-align: left; border-bottom: 2px solid #c5d5e8; }
  .qa-q { padding: 8px 10px; border-bottom: 1px solid #e0e7f0; vertical-align: top; background: white; white-space: pre-wrap; word-break: break-word; }
  .qa-a { padding: 8px 10px; border: 1px solid #c5d5e8; background: #f7faff; vertical-align: top; min-height: 40px; white-space: pre-wrap; word-break: break-word; }
  .sch-section { }
  .sch-name { font-size: 9px; color: #6b7280; margin-bottom: 4px; font-style: italic; flex-shrink: 0; }
  .sch-page {
    page-break-before: always;
    page-break-after: always;
    page-break-inside: avoid;
    break-before: page;
    break-after: page;
    break-inside: avoid;
    display: flex;
    flex-direction: column;
    height: 257mm;
    box-sizing: border-box;
    padding: 4px 0;
  }
  .sch-page img {
    flex: 1;
    min-height: 0;
    object-fit: contain;
    width: 100%;
    display: block;
    border: 1px solid #e5e7eb;
  }
`;

const drawMarkers = (ctx, w, h, markers) => {
    markers.forEach((m, idx) => {
        const x = (m.x / 100) * w;
        const y = (m.y / 100) * h;
        ctx.save();
        if (m.type === 'LINE' && m.x2 != null && m.y2 != null) {
            const x2 = (m.x2 / 100) * w;
            const y2 = (m.y2 / 100) * h;
            ctx.strokeStyle = '#ef4444';
            ctx.lineWidth = 2.5;
            ctx.beginPath();
            ctx.moveTo(x, y);
            ctx.lineTo(x2, y2);
            ctx.stroke();
        } else if (m.type === 'TEXT') {
            ctx.fillStyle = '#1d4ed8';
            ctx.font = `bold ${Math.max(12, w * 0.012)}px Arial`;
            ctx.fillText(m.name || '', x, y);
        } else {
            // POINT
            const r = Math.max(10, w * 0.012);
            ctx.fillStyle = '#ef4444';
            ctx.strokeStyle = '#fff';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(x, y, r, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
            // numer
            ctx.fillStyle = '#fff';
            ctx.font = `bold ${Math.round(r * 1.1)}px Arial`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(String(m._num != null ? m._num : idx + 1), x, y);
            // etykieta
            if (m.name) {
                ctx.textAlign = 'left';
                ctx.textBaseline = 'alphabetic';
                ctx.fillStyle = '#1d4ed8';
                ctx.font = `bold ${Math.max(11, w * 0.011)}px Arial`;
                ctx.fillText(m.name, x + r + 3, y + 4);
            }
        }
        ctx.restore();
    });
};

/**
 * Buduje HTML sekcji "Schemat" (tabela znaczników + Q&A z WBS + strony schematów z naniesionymi markerami).
 * @param {{ nodeId: string, wbsData?: Array, orderName?: string, token: string, sectionTitle?: string|null, pageBreakBefore?: boolean }} opts
 * @returns {Promise<{ html: string, isEmpty: boolean, markersCount: number, schematicsCount: number }>}
 */
export async function buildSchematSectionHtml({ nodeId, wbsData = [], orderName = '', token, sectionTitle = null, pageBreakBefore = false }) {
    const freshRes = await fetch(`${API_URL}/schematics/node/${nodeId}`, { headers: { Authorization: `Bearer ${token}` } });
    const freshSchematics = freshRes.ok ? await freshRes.json() : [];

    let allWbsNodes = Array.isArray(wbsData) && wbsData.length > 0 ? wbsData : [];
    if (allWbsNodes.length === 0) {
        try {
            const wbsRes = await fetch(`${API_URL}/wbs-nodes/unified/${nodeId}`, { headers: { Authorization: `Bearer ${token}` } });
            if (wbsRes.ok) {
                const d = await wbsRes.json();
                allWbsNodes = d.items || [];
            }
        } catch (_) {}
    }

    let _globalNum = 0;
    for (const sch of freshSchematics) {
        for (const m of (sch.markers || [])) m._num = ++_globalNum;
    }

    const allMarkers = freshSchematics.flatMap(sch =>
        (sch.markers || []).map(m => ({ ...m, schematicName: sch.fileName }))
    );

    if (freshSchematics.length === 0 && allMarkers.length === 0) {
        return { html: '', isEmpty: true, markersCount: 0, schematicsCount: 0 };
    }

    const toBase64 = async (fileUrl) => {
        try {
            const res = await fetch(`${API_URL}/schematics/file/${fileUrl}`, { headers: { Authorization: `Bearer ${token}` } });
            if (!res.ok) return null;
            const blob = await res.blob();
            return new Promise(resolve => {
                const reader = new FileReader();
                reader.onloadend = () => resolve(reader.result);
                reader.readAsDataURL(blob);
            });
        } catch { return null; }
    };
    for (const m of allMarkers) {
        if (m.attachments) {
            for (const att of m.attachments) {
                if (att.fileType === 'IMAGE') att._b64 = await toBase64(att.fileUrl);
            }
        }
    }

    // Renderuj wszystkie schematy (PDF → canvas per strona, obrazy bezpośrednio)
    const schematicSections = [];
    for (const sch of freshSchematics) {
        const ext = sch.fileName.split('.').pop().toLowerCase();
        try {
            const res = await fetch(`${API_URL}/schematics/file/${sch.fileUrl}`, { headers: { Authorization: `Bearer ${token}` } });
            if (!res.ok) continue;
            const blob = await res.blob();
            if (ext === 'pdf') {
                const arrayBuffer = await blob.arrayBuffer();
                const pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise;
                const pages = [];
                for (let p = 1; p <= pdf.numPages; p++) {
                    const page = await pdf.getPage(p);
                    const viewport = page.getViewport({ scale: 1.5 });
                    const canvas = document.createElement('canvas');
                    canvas.width = viewport.width;
                    canvas.height = viewport.height;
                    const ctx = canvas.getContext('2d');
                    await page.render({ canvasContext: ctx, viewport }).promise;
                    const pageMarkers = (sch.markers || []).filter(m => m.pageNumber === p);
                    drawMarkers(ctx, canvas.width, canvas.height, pageMarkers);
                    pages.push(canvas.toDataURL('image/jpeg', 0.9));
                }
                schematicSections.push({ name: sch.fileName, pages });
            } else {
                const b64 = await new Promise(resolve => {
                    const img = new Image();
                    img.onload = () => {
                        const canvas = document.createElement('canvas');
                        canvas.width = img.naturalWidth;
                        canvas.height = img.naturalHeight;
                        const ctx = canvas.getContext('2d');
                        ctx.drawImage(img, 0, 0);
                        const pageMarkers = (sch.markers || []).filter(m => m.pageNumber === 1);
                        drawMarkers(ctx, canvas.width, canvas.height, pageMarkers);
                        resolve(canvas.toDataURL('image/jpeg', 0.9));
                    };
                    img.src = URL.createObjectURL(blob);
                });
                schematicSections.push({ name: sch.fileName, pages: [b64] });
            }
        } catch { /* pomiń uszkodzony plik */ }
    }

    let rowNum = 0;
    const rows = allMarkers.flatMap((m) => {
        const links = m.wbsLinks || [];
        const childLink = links.find(l => l.wbsParentName && l.wbsNodeName);
        const rootLink = links.find(l => !l.wbsParentName && l.wbsNodeName);
        const przedmiot = childLink?.wbsParentName || rootLink?.wbsNodeName || (m.subtask?.name || '—');
        const wymaganie = childLink?.wbsNodeName || '—';
        const images = (m.attachments || []).filter(a => a.fileType === 'IMAGE' && a._b64);
        rowNum++;
        const textRow = `<tr class="text-row">
            <td>${rowNum}</td>
            <td>${przedmiot}</td>
            <td>${wymaganie}</td>
            <td>${m.name || '—'}</td>
        </tr>`;
        const imageRows = images.map(a => `<tr class="img-row">
            <td></td>
            <td style="width:180px;vertical-align:top;padding:6px 8px;">
                <img src="${a._b64}" style="max-width:170px;max-height:150px;border-radius:4px;border:1px solid #e5e7eb;display:block;" />
                ${a.note ? `<div style="font-size:9px;color:#6b7280;margin-top:4px;white-space:pre-wrap;">${a.note}</div>` : ''}
            </td>
            <td colspan="2" style="vertical-align:top;padding:6px 8px;white-space:pre-wrap;word-break:break-word;">${m.note || '—'}</td>
        </tr>`);
        const noImageRow = images.length === 0 ? [`<tr class="note-row">
            <td></td>
            <td colspan="3" style="color:#374151;padding:4px 8px;">${m.note || ''}</td>
        </tr>`] : [];
        return [textRow, ...imageRows, ...noImageRow];
    }).join('');

    // Buduj sekcję Q&A z WBS
    const wbsNodeMap = new Map(allWbsNodes.map(n => [String(n.id), n]));
    const buildQaPath = (id) => {
        const parts = [];
        let cur = wbsNodeMap.get(String(id));
        while (cur) {
            parts.unshift(cur.name || '');
            cur = cur.parentId != null ? wbsNodeMap.get(String(cur.parentId)) : null;
        }
        return parts.join(' › ');
    };
    const qaNodes = allWbsNodes.filter(n => Array.isArray(n.qa) && n.qa.some(p => (p?.question || '').trim()));
    const qaTitle = `Q&A${orderName ? ` — ${esc(orderName)}` : ''}`;
    const qaNodeSections = qaNodes.map(n => {
        const pairs = n.qa.filter(p => (p?.question || '').trim());
        const path = buildQaPath(n.id);
        const trs = pairs.map(p => `<tr>
            <td class="qa-q">${esc(p.question)}</td>
            <td class="qa-a">${esc(p.answer || '')}</td>
        </tr>`).join('');
        return `<div class="qa-block">
            <div class="qa-node-hdr">${esc(path)}</div>
            <table class="qa-tbl">
                <colgroup><col style="width:52%"><col style="width:48%"></colgroup>
                <thead><tr><th class="qa-th">PYTANIE</th><th class="qa-th">ODPOWIEDŹ</th></tr></thead>
                <tbody>${trs}</tbody>
            </table>
        </div>`;
    }).join('');
    const qaHtml = qaNodes.length > 0 ? `
        <div class="section qa-section">
            <div class="section-header">${qaTitle}</div>
            ${qaNodeSections}
        </div>` : '';

    const schematicHtml = schematicSections.map((s) => `
        <div class="sch-section">
            ${s.pages.map((pg, i) => `
                <div class="sch-page">
                    <div class="sch-name">${esc(s.name)}${s.pages.length > 1 ? ` — strona ${i + 1} / ${s.pages.length}` : ''}</div>
                    <img src="${pg}" />
                </div>`).join('')}
        </div>`).join('');

    const sectionStyle = pageBreakBefore ? ' style="page-break-before: always;"' : '';
    const sectionHeaderHtml = sectionTitle ? `<div class="section-header">${esc(sectionTitle)}</div>` : '';
    const tableHtml = `
        <div class="section"${sectionStyle}>
            ${sectionHeaderHtml}
            <table class="sch-table">
                <thead><tr>
                    <th style="width:24px">#</th><th>Przedmiot projektu</th><th>Pozycja przedmiotu</th><th>Nazwa znacznika na schemacie</th>
                </tr></thead>
                <tbody>${rows}</tbody>
            </table>
        </div>`;

    const html = `${tableHtml}${qaHtml}${schematicSections.length > 0 ? schematicHtml : ''}`;
    return { html, isEmpty: false, markersCount: allMarkers.length, schematicsCount: freshSchematics.length };
}
