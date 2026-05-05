import { PDFDocument } from 'pdf-lib';

export async function importQaFormPdf(fileBuffer, wbsData) {
    const pdfDoc = await PDFDocument.load(fileBuffer, { ignoreEncryption: true });
    const form = pdfDoc.getForm();

    const nodes = (wbsData || []).filter(n => Array.isArray(n.qa) && n.qa.some(p => (p?.question || '').trim()));

    const updates = [];
    let fieldIdx = 0;

    for (const node of nodes) {
        const filteredIndices = node.qa
            .map((p, i) => ({ p, i }))
            .filter(({ p }) => (p?.question || '').trim())
            .map(({ i }) => i);

        if (!filteredIndices.length) continue;

        const newQa = node.qa.map(p => ({ ...p }));
        let changed = false;

        for (const origIdx of filteredIndices) {
            const fieldName = `answer_${fieldIdx++}`;
            let fieldValue = '';
            try {
                fieldValue = form.getTextField(fieldName).getText() || '';
            } catch {
                // pole nie istnieje w tym PDF
            }
            if (fieldValue !== newQa[origIdx].answer) {
                newQa[origIdx].answer = fieldValue;
                changed = true;
            }
        }

        if (changed) updates.push({ nodeId: node.id, qa: newQa });
    }

    return updates;
}
