import { PDFDocument, rgb, PDFName, PDFHexString } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import fontRegularUrl from 'pdfjs-dist/standard_fonts/LiberationSans-Regular.ttf?url';
import fontBoldUrl from 'pdfjs-dist/standard_fonts/LiberationSans-Bold.ttf?url';

async function fetchFont(url) {
    const res = await fetch(url);
    return res.arrayBuffer();
}

const PAGE_W = 595;
const PAGE_H = 842;
const MARGIN = 40;
const CONTENT_W = PAGE_W - MARGIN * 2;
const COL_Q = Math.round(CONTENT_W * 0.52);
const COL_A = CONTENT_W - COL_Q;
const ROW_MIN_H = 28;
const FONT_SIZE = 9;
const LABEL_SIZE = 7;
const LINE_H = FONT_SIZE * 1.4;

function breakLongWord(word, maxWidth, font, size) {
    // Łamie słowo na fragmenty mieszczące się w maxWidth
    const out = [];
    let buf = '';
    for (const ch of word) {
        const test = buf + ch;
        if (font.widthOfTextAtSize(test, size) > maxWidth && buf) {
            out.push(buf);
            buf = ch;
        } else {
            buf = test;
        }
    }
    if (buf) out.push(buf);
    return out;
}

function wrapText(text, maxWidth, font, size) {
    const words = String(text || '').split(/\s+/);
    const lines = [];
    let current = '';
    for (const w of words) {
        if (!w) continue;
        // Słowo dłuższe niż kolumna — rozetnij
        const fragments = font.widthOfTextAtSize(w, size) > maxWidth
            ? breakLongWord(w, maxWidth, font, size)
            : [w];
        for (const frag of fragments) {
            const test = current ? current + ' ' + frag : frag;
            if (font.widthOfTextAtSize(test, size) > maxWidth && current) {
                lines.push(current);
                current = frag;
            } else {
                current = test;
            }
        }
    }
    if (current) lines.push(current);
    return lines.length ? lines : [''];
}

function textBlockHeight(text, maxWidth, font, size) {
    const lines = wrapText(text, maxWidth, font, size);
    return lines.length * LINE_H + 6;
}

export async function exportQaFormPdf(wbsData, projectName) {
    const pdfDoc = await PDFDocument.create();
    pdfDoc.registerFontkit(fontkit);
    const [regularBytes, boldBytes] = await Promise.all([fetchFont(fontRegularUrl), fetchFont(fontBoldUrl)]);
    const fontRegular = await pdfDoc.embedFont(regularBytes, { subset: true });
    const fontBold    = await pdfDoc.embedFont(boldBytes,    { subset: true });

    let logoImg = null;
    try {
        const logoRes = await fetch(`${window.location.origin}/airtel-logo-services.png`);
        if (logoRes.ok) {
            const logoBytes = await logoRes.arrayBuffer();
            logoImg = await pdfDoc.embedPng(logoBytes);
        }
    } catch (_) {}
    const form = pdfDoc.getForm();

    const colorBg      = rgb(0.95, 0.97, 1.0);
    const colorBorder  = rgb(0.80, 0.85, 0.92);
    const colorHeader  = rgb(0.20, 0.28, 0.45);
    const colorLabel   = rgb(0.40, 0.48, 0.60);
    const colorText    = rgb(0.10, 0.12, 0.18);
    const colorRowAlt  = rgb(0.97, 0.98, 1.0);
    const colorWhite   = rgb(1, 1, 1);
    const colorField   = rgb(0.97, 0.99, 1.0);

    // Sortuj węzły w kolejności DFS (tak jak wyświetla UI: sortOrder per poziom)
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

    // Węzły z pytaniami w kolejności drzewa
    const nodes = treeWalkOrder(wbsData || []).filter(n => Array.isArray(n.qa) && n.qa.some(p => (p?.question || '').trim()));

    // Buduj mapę id→node (String key — unika mismatch number/string)
    const byId = new Map((wbsData || []).map(n => [String(n.id), n]));
    const getWbsPath = (node) => {
        const segs = [];
        let cur = node;
        while (cur) {
            segs.unshift(cur.name || '');
            cur = cur.parentId ? byId.get(String(cur.parentId)) : null;
        }
        return segs.join(' / ');
    };

    let page = pdfDoc.addPage([PAGE_W, PAGE_H]);
    let y = PAGE_H - MARGIN;
    let fieldIdx = 0;

    // Metadane dla importu — odporne na zmiany WBS między eksportem a importem
    const metaFields = [];

    const ensureSpace = (needed) => {
        if (y - needed < MARGIN) {
            page = pdfDoc.addPage([PAGE_W, PAGE_H]);
            y = PAGE_H - MARGIN;
            drawTableHeader();
        }
    };

    const HEADER_H = 44;
    const drawPageHeader = () => {
        const hY = PAGE_H - MARGIN - HEADER_H;
        page.drawRectangle({ x: MARGIN, y: hY, width: CONTENT_W, height: HEADER_H, color: colorHeader });
        let textX = MARGIN + 10;
        if (logoImg) {
            const logoH = 32;
            const logoW = Math.round(logoImg.width * logoH / logoImg.height);
            page.drawImage(logoImg, { x: MARGIN + 8, y: hY + (HEADER_H - logoH) / 2, width: logoW, height: logoH });
            textX = MARGIN + 8 + logoW + 10;
        }
        page.drawText('Q&A — ' + (projectName || 'Projekt'), {
            x: textX, y: hY + HEADER_H - 18,
            size: 12, font: fontBold, color: colorWhite,
        });
        page.drawText('Formularz pytań i odpowiedzi', {
            x: textX, y: hY + 8,
            size: 7, font: fontRegular, color: rgb(0.7, 0.8, 0.95),
        });
        y = hY - 8;
    };

    const drawTableHeader = () => {
        page.drawRectangle({ x: MARGIN, y: y - 16, width: CONTENT_W, height: 16, color: colorBg });
        page.drawRectangle({ x: MARGIN, y: y - 16, width: CONTENT_W, height: 16, borderColor: colorBorder, borderWidth: 0.5 });
        page.drawText('PYTANIE', { x: MARGIN + 4, y: y - 11, size: LABEL_SIZE, font: fontBold, color: colorLabel });
        page.drawText('ODPOWIEDŹ', { x: MARGIN + COL_Q + 4, y: y - 11, size: LABEL_SIZE, font: fontBold, color: colorLabel });
        y -= 16;
    };

    drawPageHeader();

    for (const node of nodes) {
        const pairs = node.qa
            .map((p, i) => ({ p, i }))
            .filter(({ p }) => (p?.question || '').trim());
        if (!pairs.length) continue;

        // Nazwa węzła
        const nodePath = getWbsPath(node);
        const nodeLines = wrapText(nodePath, CONTENT_W - 12, fontBold, 9);
        const nodeH = Math.max(18, nodeLines.length * (9 * 1.4) + 8);
        ensureSpace(nodeH);
        page.drawRectangle({ x: MARGIN, y: y - nodeH, width: CONTENT_W, height: nodeH, color: rgb(0.88, 0.92, 0.98) });
        nodeLines.forEach((line, li) => {
            page.drawText(line, { x: MARGIN + 6, y: y - 13 - li * (9 * 1.4), size: 9, font: fontBold, color: colorHeader });
        });
        y -= nodeH;

        drawTableHeader();

        pairs.forEach(({ p: pair, i: origQaIdx }, displayIdx) => {
            const qText = pair.question || '';
            const aText = pair.answer || '';

            const qLines = wrapText(qText, COL_Q - 8, fontRegular, FONT_SIZE);
            const qH = qLines.length * LINE_H + 6;
            const aFieldH = Math.max(ROW_MIN_H, textBlockHeight(aText, COL_A - 8, fontRegular, FONT_SIZE));
            const rowH = Math.max(qH, aFieldH, ROW_MIN_H);

            ensureSpace(rowH);

            const rowBg = displayIdx % 2 === 0 ? colorWhite : colorRowAlt;
            // Tło całego wiersza
            page.drawRectangle({ x: MARGIN, y: y - rowH, width: CONTENT_W, height: rowH, color: rowBg });
            // Pionowa linia podziału
            page.drawLine({ start: { x: MARGIN + COL_Q, y: y }, end: { x: MARGIN + COL_Q, y: y - rowH }, thickness: 0.5, color: colorBorder });
            // Pozioma linia dolna
            page.drawLine({ start: { x: MARGIN, y: y - rowH }, end: { x: MARGIN + CONTENT_W, y: y - rowH }, thickness: 0.5, color: colorBorder });
            // Pionowe krawędzie
            page.drawLine({ start: { x: MARGIN, y }, end: { x: MARGIN, y: y - rowH }, thickness: 0.5, color: colorBorder });
            page.drawLine({ start: { x: MARGIN + CONTENT_W, y }, end: { x: MARGIN + CONTENT_W, y: y - rowH }, thickness: 0.5, color: colorBorder });

            // Tekst pytania
            qLines.forEach((line, li) => {
                page.drawText(line, {
                    x: MARGIN + 4,
                    y: y - 10 - li * LINE_H,
                    size: FONT_SIZE,
                    font: fontRegular,
                    color: colorText,
                });
            });

            // Pole formularza dla odpowiedzi — pre-fillowane bieżącą odpowiedzią, edytowalne
            const fieldName = `answer_${fieldIdx++}`;
            const fieldX = MARGIN + COL_Q + 1;
            const fieldY = y - rowH + 1;
            const fieldW = COL_A - 2;
            const fieldH = rowH - 2;

            page.drawRectangle({ x: fieldX, y: fieldY, width: fieldW, height: fieldH, color: colorField });

            // Istniejącą odpowiedź rysujemy jako statyczny tekst (LiberationSans — pełne UTF-8,
            // viewery często nie renderują prefillu form fielda z subset-font, więc tu jest pewne)
            if (aText) {
                const aLines = wrapText(aText, fieldW - 6, fontRegular, FONT_SIZE);
                aLines.forEach((line, li) => {
                    page.drawText(line, {
                        x: fieldX + 3,
                        y: y - 10 - li * LINE_H,
                        size: FONT_SIZE,
                        font: fontRegular,
                        color: colorText,
                    });
                });
            }

            // Pole formularza zawsze PUSTE — służy do wpisania nowej/zmienionej odpowiedzi.
            // Przy imporcie puste pole = brak zmiany (zachowuje istniejącą odpowiedź).
            // BEZ backgroundColor — inaczej widget rysuje nieprzezroczyste tło NA statycznym tekście.
            // Tło wizualne mamy już z drawRectangle wyżej na warstwie strony.
            const tf = form.createTextField(fieldName);
            tf.enableMultiline();
            tf.addToPage(page, {
                x: fieldX, y: fieldY, width: fieldW, height: fieldH,
                borderWidth: 0,
                textColor: colorText,
            });

            // Zapamiętaj metadane do dopasowania przy imporcie
            metaFields.push({
                name: fieldName,
                nodeId: node.id,
                branchPath: nodePath,
                qaIdx: origQaIdx,
                question: qText,
            });

            y -= rowH;
        });

        y -= 4;
    }

    if (nodes.length === 0) {
        page.drawText('Brak pytań Q&A w strukturze projektu.', {
            x: MARGIN, y: y - 20, size: 11, font: fontRegular, color: colorLabel,
        });
    }

    // Numeracja stron
    const pages = pdfDoc.getPages();
    pages.forEach((p, i) => {
        p.drawText(`${i + 1} / ${pages.length}`, {
            x: PAGE_W - MARGIN - 30, y: MARGIN - 15,
            size: 7, font: fontRegular, color: colorLabel,
        });
    });

    // Zapisz metadane w info dict PDF — odporny match przy imporcie nawet po zmianach WBS
    if (metaFields.length > 0) {
        pdfDoc.getInfoDict().set(
            PDFName.of('QaMeta'),
            PDFHexString.fromText(JSON.stringify({ version: 1, fields: metaFields })),
        );
    }

    const bytes = await pdfDoc.save();
    const blob = new Blob([bytes], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Q&A_${(projectName || 'projekt').replace(/\s+/g, '_')}.pdf`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
}
