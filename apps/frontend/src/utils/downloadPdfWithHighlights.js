import { PDFDocument, rgb } from 'pdf-lib';

const HL_RGB = {
    yellow: rgb(0.996, 0.941, 0.541),
    green:  rgb(0.733, 0.969, 0.816),
    blue:   rgb(0.749, 0.859, 0.996),
    pink:   rgb(0.984, 0.812, 0.910),
    orange: rgb(0.996, 0.843, 0.667),
};

// @anchor build-download-artifact
// Zwraca { blob, filename } dokumentu (PDF z opcjonalnymi podświetleniami) — wspólne dla
// pobrania na dysk oraz wysyłki mailem (przez ExportChoiceModal).
export async function buildDownloadArtifact({ fileUrl, fileName, highlights = [], token = null }) {
    const res = await fetch(fileUrl, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
    if (!res.ok) throw new Error(`Nie udało się pobrać pliku (${res.status})`);
    const buffer = await res.arrayBuffer();
    const isPdf = (fileName || '').toLowerCase().endsWith('.pdf');
    if (!highlights.length || !isPdf) {
        return {
            blob: new Blob([buffer], { type: res.headers.get('content-type') || 'application/octet-stream' }),
            filename: fileName || 'dokument',
        };
    }
    const pdfDoc = await PDFDocument.load(buffer);
    const pages = pdfDoc.getPages();
    for (const h of highlights) {
        const page = pages[h.page - 1];
        if (!page) continue;
        const { width, height } = page.getSize();
        const color = HL_RGB[h.color] || HL_RGB.yellow;
        for (const r of (h.rects || [])) {
            page.drawRectangle({
                x: r.x * width,
                y: height - (r.y + r.h) * height,
                width: r.w * width,
                height: r.h * height,
                color,
                opacity: 0.45,
            });
        }
    }
    const bytes = await pdfDoc.save();
    return { blob: new Blob([bytes], { type: 'application/pdf' }), filename: fileName || 'dokument.pdf' };
}

// Back-compat: bezpośrednie pobranie (bez modala).
export async function downloadPdfWithHighlights({ fileUrl, fileName, highlights = [], token = null }) {
    if (highlights.length === 0) {
        const a = document.createElement('a');
        a.href = fileUrl;
        a.download = fileName;
        a.click();
        return;
    }
    const { blob, filename } = await buildDownloadArtifact({ fileUrl, fileName, highlights, token });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
}
