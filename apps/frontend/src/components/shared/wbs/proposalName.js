// Składanie nazwy handlowej propozycji produktu — czysta logika, bez Reacta, żeby dała się
// odpalić w Node (`test/test-proposal-name.mjs`).
//
// `ProductProposal.productName` jest w schemacie WYMAGANE, więc propozycja bez nazwy handlowej
// nie ma prawa powstać. Naturalna droga wpisywania to producent → model (lista zawężona
// producentem) → zapis, i na tej drodze nazwa handlowa zostaje pusta. Zamiast blokować zapis,
// składamy ją: najpierw handlowa z katalogu dla tej pary producent+model, w drugiej kolejności
// „PRODUCENT MODEL".

// @anchor compose-proposal-name
export function composeProposalName(form, materialDb) {
    const wpisana = String(form?.productName ?? '').trim();
    if (wpisana) return wpisana;

    const mfr = String(form?.manufacturer ?? '').trim();
    const mdl = String(form?.model ?? '').trim();
    if (!mfr) return '';

    const zKatalogu = (Array.isArray(materialDb) ? materialDb : []).find(m =>
        String(m?.manufacturer ?? '').toLowerCase() === mfr.toLowerCase() &&
        (!mdl || String(m?.model ?? '').toLowerCase() === mdl.toLowerCase()));
    if (zKatalogu?.productName) return String(zKatalogu.productName).trim();

    return [mfr, mdl].filter(Boolean).join(' ');
}
