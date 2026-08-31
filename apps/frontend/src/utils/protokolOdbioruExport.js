// @anchor protokol-odbioru-export
// Protokół odbioru prac — odwzorowanie formularza Airtela („protokół odbioru technicznego.docx")
// zasilane liśćmi WBS zamówienia. Jeden obiekt danych, dwa wyjścia:
//   PDF  — HTML z tego pliku + `buildPdfDocument` + `/pdf/render` (Chromium),
//   DOCX — `POST /acceptance-protocols/docx` (biblioteka `docx` na backendzie).
// Dane składa modal (`ProtokolOdbioruModal`), tutaj mieszka wyłącznie ich kształtowanie
// i renderowanie — dzięki temu oba pliki niosą identyczną treść.

import { API_URL } from '../config';
import { esc, buildPdfDocument, openPdfBlob } from './wbsPdfExport';

// @anchor protokol-fmt-zl
export const fmtZlProtokol = (v) =>
    `${(Number(v) || 0).toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} pln`;

// @anchor protokol-fmt-data
// Formularz operuje datą DD.MM.RRRR — nie ISO. Numer protokołu z wzoru
// („…_21.08.2026") składa się z tego samego zapisu, więc obie wartości muszą wychodzić stąd.
export const fmtDataProtokol = (d) => {
    const dt = d instanceof Date ? d : new Date(d);
    if (Number.isNaN(dt.getTime())) return '';
    return `${String(dt.getDate()).padStart(2, '0')}.${String(dt.getMonth() + 1).padStart(2, '0')}.${dt.getFullYear()}`;
};

// @anchor protokol-branch-of
// Gałąź liścia = PIERWSZY segment ścieżki WBS. Tabela wartości we wzorze ma jeden wiersz
// na gałąź (5100 + 1900 = 7000), a bulletów zakresu pięć — czyli wartości agregują się
// po gałęzi, a odhaczane są pojedyncze liście.
export const branchOfLeaf = (node) => (node?.path || node?.name || '').split(' › ')[0] || '—';

// @anchor protokol-branch-index
// Numer sekcji = pozycja gałęzi w CAŁYM zamówieniu, nie kolejność w protokole. We wzorze
// opis zaczyna się od „2.", bo gałąź pierwsza nie była odbierana; renumerowanie od 1
// zerwałoby zgodność z ofertą, po której klient czyta zakres.
export function buildBranchIndex(wbsNodes) {
    const top = (wbsNodes || [])
        .filter((n) => n.depth === 0 || n.parentId == null)
        .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
    const map = {};
    top.forEach((n, i) => { map[n.name] = i + 1; });
    return map;
}

// @anchor protokol-branch-owners
// Właściciel gałęzi — `WbsNode.owner` węzła najwyższego poziomu. W WBS to osoba wybrana
// z listy użytkowników albo kontaktów projektu, zapisana etykietą „Firma — Imię Nazwisko",
// czyli dokładnie to, co ma stanąć nad kreską „Przedstawiciel Podwykonawcy": gałąź
// prowadzi ten, kto ją realizuje.
export function buildBranchOwners(wbsNodes) {
    const map = {};
    for (const n of (wbsNodes || [])) {
        if (n.depth === 0 || n.parentId == null) map[n.name] = String(n.owner || '').trim();
    }
    return map;
}

// @anchor protokol-selected-owners
// Osoby odpowiedzialne za ODBIERANE gałęzie. Gdy gałąź nie ma właściciela, schodzimy do
// zaznaczonych liści — bywa, że nazwisko siedzi na pozycji, a nie na nagłówku gałęzi.
// Zwracamy WSZYSTKIE unikalne nazwiska: przy odbiorze z dwóch gałęzi prowadzonych przez
// różne osoby wpisanie tylko jednej z nich byłoby nieprawdą w podpisywanym dokumencie.
export function ownersOfSelection(selectedRows, branchOwners) {
    const byBranch = new Map();
    for (const r of selectedRows) {
        const b = branchOfLeaf(r.node);
        if (!byBranch.has(b)) byBranch.set(b, []);
        byBranch.get(b).push(r);
    }

    const out = [];
    for (const [galaz, wiersze] of byBranch) {
        const zGalezi = String(branchOwners?.[galaz] || '').trim();
        const zLisci = [...new Set(wiersze.map((r) => String(r.node.owner || '').trim()).filter(Boolean))].join(', ');
        const osoba = zGalezi || zLisci;
        if (osoba && !out.includes(osoba)) out.push(osoba);
    }
    return out;
}

// @anchor protokol-fetch-status
// Stan odbioru pozycji zamówienia: ile już odebrano i czy pozycja jest domknięta.
// Bez tego każdy kolejny protokół zaczynałby od zera i odbierałby to samo drugi raz.
export async function fetchStatusOdbioru(nodeId) {
    const token = sessionStorage.getItem('token') || localStorage.getItem('token');
    const res = await fetch(`${API_URL}/acceptance-protocols/${nodeId}/status`, {
        headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error(`Nie udało się pobrać stanu odbiorów (${res.status})`);
    const lista = await res.json();
    return Object.fromEntries((lista || []).map((s) => [s.wbsRootId, s]));
}

// @anchor protokol-wbs-root-of
// Klucz odbioru liścia — ten sam co w `LeafActual`: korzeń klonu, dzięki czemu odbiór
// przeżywa utworzenie nowej wersji wyceny.
export const protokolRootOf = (node) => node?.sourceWbsNodeId || node?.id || '';

// @anchor protokol-pozostalo
// Ile z pozycji zostaje do odebrania. Domknięta pozycja zwraca 0 niezależnie od kwot:
// podniesienie wyceny po podpisanym odbiorze nie ma prawa otworzyć go z powrotem.
// Zaokrąglenie w dół do zera chroni przed groszowym „−0,00" przy obniżce wyceny.
export function pozostaloDoOdbioru(plan, status) {
    if (status?.domkniete) return 0;
    return Math.max(0, Math.round(((Number(plan) || 0) - (status?.odebrane || 0)) * 100) / 100);
}

// @anchor protokol-zamknieta
// Czy pozycja jest zamknięta dla KOLEJNYCH protokołów. Dwie niezależne przyczyny:
//   1. flaga `domkniete` z rejestru — świadome „odebrane do końca",
//   2. wyczerpanie kwoty — wcześniejsze protokoły zabrały już cały plan (albo więcej).
// Punkt 2 jest konieczny, bo protokół wystawiony na PEŁNĄ kwotę bez zaznaczenia domknięcia
// zostawiał pozycję z zerem do odbioru, a mimo to klikalną — dało się ją zaznaczyć i odebrać
// drugi raz na dowolną kwotę. Warunek `odebrane > 0` chroni pozycje bez wyceny (plan = 0),
// których nikt jeszcze nie tknął: te mają zostać otwarte.
export function pozycjaZamknieta(plan, status) {
    if (status?.domkniete) return true;
    return (status?.odebrane || 0) > 0 && pozostaloDoOdbioru(plan, status) <= 0.005;
}

// @anchor protokol-zapisz-odbior
// Zapis wystawionego protokołu do rejestru. Wołany DOPIERO po udanym eksporcie —
// podgląd niczego nie odbiera. Powtórka na tym samym numerze nadpisuje wpis.
export async function zapiszOdbior(nodeId, { numer, data, odbior, pozycje }) {
    const token = sessionStorage.getItem('token') || localStorage.getItem('token');
    const res = await fetch(`${API_URL}/acceptance-protocols/${nodeId}/record`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ numer, data, odbior, pozycje }),
    });
    // Komunikat backendu ma tu realną treść — np. „pozycja odebrana już w całości" wraz
    // z numerem protokołu, który ją zamknął. Sam kod HTTP nie powiedziałby odbierającemu,
    // co poszło nie tak ani co z tym zrobić.
    if (!res.ok) {
        const powod = await res.json().catch(() => null);
        throw new Error(powod?.message || `Nie udało się zapisać odbioru (${res.status})`);
    }
    return res.json();
}

// @anchor protokol-buduj-roznice
// Pozycje odbierane za kwotę INNĄ niż ofertowa. Liczymy dla KAŻDEJ odbieranej pozycji,
// nie tylko domykanej: akceptacja bywa wystawiona na inną kwotę już w pierwszym protokole
// i wtedy różnica jest faktem, niezależnie od tego, czy pozycja zostaje otwarta.
//
// `odbior` to suma po TYM protokole (odebrane wcześniej + teraz) — porównujemy stan
// końcowy z ofertą, a nie pojedynczą ratę, bo inaczej każdy odbiór etapowy wyglądałby
// jak rozjazd z wyceną.
//
// pozycje: [{ nazwa, oferta, odebraneWczesniej, kwota, pelny }]
export function budujRoznice(pozycje) {
    const grosz = (v) => Math.round((Number(v) || 0) * 100) / 100;
    return (pozycje || [])
        .map((p) => {
            const oferta = grosz(p.oferta);
            const odbior = grosz((Number(p.odebraneWczesniej) || 0) + (Number(p.kwota) || 0));
            return {
                nazwa: p.nazwa,
                oferta,
                odbior,
                delta: grosz(odbior - oferta),
                pelny: !!p.pelny,
                zostaje: p.pelny ? 0 : Math.max(0, grosz(oferta - odbior)),
            };
        })
        .filter((x) => Math.abs(x.delta) > 0.005);
}

// @anchor protokol-tekst-roznic
// Adnotacja doklejana do „Innych uwag". Pozycja pozostawiona otwarta dostaje dopisek
// o reszcie do odbioru — bez niego „odbiór niższy od oferty" czytałoby się jak rabat,
// a to zwykłe rozłożenie odbioru na etapy.
export function tekstRoznic(roznice) {
    if (!roznice?.length) return '';
    const znak = (v) => `${v > 0 ? '+' : '−'}${fmtZlProtokol(Math.abs(v))}`;
    const linie = roznice.map((x) => {
        const baza = `– ${x.nazwa}: oferta ${fmtZlProtokol(x.oferta)}, odbiór ${fmtZlProtokol(x.odbior)} (${znak(x.delta)})`;
        return x.pelny ? baza : `${baza}; pozycja pozostaje otwarta, do odbioru ${fmtZlProtokol(x.zostaje)}`;
    });
    if (roznice.length > 1) {
        const sumaOferta = roznice.reduce((a, x) => a + x.oferta, 0);
        const sumaOdbior = roznice.reduce((a, x) => a + x.odbior, 0);
        const delta = Math.round((sumaOdbior - sumaOferta) * 100) / 100;
        linie.push(`Razem: oferta ${fmtZlProtokol(sumaOferta)}, odbiór ${fmtZlProtokol(sumaOdbior)} (${znak(delta)})`);
    }
    return ['Wartość odbioru różni się od oferty:', ...linie].join('\n');
}

// @anchor protokol-fetch-protokoly
// Lista wystawionych protokołów zamówienia — do podglądu „co już odebrano" i do wycofania
// pomyłkowego wpisu.
export async function fetchProtokoly(nodeId) {
    const token = sessionStorage.getItem('token') || localStorage.getItem('token');
    const res = await fetch(`${API_URL}/acceptance-protocols/${nodeId}`, {
        headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error(`Nie udało się pobrać listy protokołów (${res.status})`);
    return res.json();
}

// @anchor protokol-usun
// Wycofanie zapisu odbioru. Kasuje WYŁĄCZNIE ślad w rejestrze — plik na OneDrive zostaje,
// bo dokument mógł już trafić do klienta i to nie aplikacja decyduje o jego losie.
export async function usunProtokol(nodeId, protocolId) {
    const token = sessionStorage.getItem('token') || localStorage.getItem('token');
    const res = await fetch(`${API_URL}/acceptance-protocols/${nodeId}/${protocolId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error(`Nie udało się wycofać protokołu (${res.status})`);
    return res.json();
}

// @anchor protokol-norm-nip — NIP do porównań: same cyfry, bez „PL", spacji i myślników.
export const normalizujNip = (v) => String(v || '').replace(/\D/g, '');

// @anchor protokol-firma-wlasciciela — firma z etykiety właściciela gałęzi („Firma — Imię
// Nazwisko"). Etykietę składa WBS i to jedyne miejsce, w którym nazwa wykonawcy stoi przy
// zakresie robót; NIP-u tam nie ma, więc służy wyłącznie do dopasowania kontaktu zamówienia.
export function firmaWlasciciela(etykieta) {
    return String(etykieta || '').split('—')[0].trim();
}

// @anchor protokol-osoba-wlasciciela — druga połowa etykiety właściciela: imię i nazwisko.
// Dla jednoosobowych działalności to JEDYNY most do rejestru firm — Biała lista zna je pod
// nazwiskiem właściciela („TADEUSZ LIBUSZEWSKI"), a nie pod szyldem („Elnets").
export function osobaWlasciciela(etykieta) {
    const czesci = String(etykieta || '').split('—');
    return (czesci[1] || '').replace(/_.*$/, '').trim();
}

// @anchor protokol-strona-zamawiajacego — „Zamawiający" to zawsze nasza firma (singleton
// `Company`). Pole `number` jest w panelu firmy opisane jako „np. NIP, REGON, kod" i w praktyce
// trzyma NIP — bierzemy je wprost, bo osobnej kolumny na NIP tam nie ma.
export function stronaZamawiajacego(firma) {
    const adres = [
        firma?.addressStreet,
        [firma?.addressZipCode, firma?.addressCity].map((x) => String(x || '').trim()).filter(Boolean).join(' '),
        firma?.addressCountry,
    ].map((x) => String(x || '').trim()).filter(Boolean).join(', ');
    return { nazwa: String(firma?.name || '').trim(), adres, nip: String(firma?.number || '').trim() };
}

// @anchor protokol-strona-wykonawcy — „Wykonawca" składany z trzech źródeł, bo żadne samo
// nie wystarcza: etykieta właściciela gałęzi mówi, KTO robił (bez NIP-u), kontakty zamówienia
// dokładają NIP, a rejestr firm (`Supplier`, dedup po NIP) pełną nazwę i adres z Białej listy.
//
// Cztery próby dopasowania, od najpewniejszej:
//   1. kontakt zamówienia o tej samej firmie co właściciel gałęzi (fragment w obie strony —
//      w kontaktach bywa „Netformers", w WBS „Netformers sp. z o.o."),
//   2. wpis rejestru, którego NAZWA zawiera szyld z WBS — firmy zarejestrowane pod marką,
//   3. wpis rejestru, którego OSOBA KONTAKTOWA to właściciel gałęzi — jednoosobowe
//      działalności figurują w Białej liście pod nazwiskiem, nie pod szyldem („Elnets"
//      → „TADEUSZ LIBUSZEWSKI"); bez tego kroku wypadały z protokołu,
//   4. jedyny kontakt z NIP-em w zamówieniu — typowy przypadek jednej firmy na zamówienie.
// Nic z tego → zostaje sam szyld z etykiety, a dokument drukuje „—" zamiast adresu i NIP-u.
export function stronaWykonawcy(wlasciciele, kontaktyZamowienia, dostawcy) {
    const male = (v) => String(v || '').trim().toLowerCase();
    const zbiezne = (a, b) => Boolean(male(a) && male(b) && (male(a).includes(male(b)) || male(b).includes(male(a))));
    const firmyZWbs = (wlasciciele || []).map(firmaWlasciciela).filter(Boolean);
    const osobyZWbs = (wlasciciele || []).map(osobaWlasciciela).filter(Boolean);
    const zNipem = (kontaktyZamowienia || []).filter((k) => normalizujNip(k.nip).length === 10);
    const rejestr = (dostawcy || []).filter((d) => normalizujNip(d.nip).length === 10);
    const zRejestru = (wpis) => ({ nazwa: wpis.name || '', adres: wpis.address || '', nip: normalizujNip(wpis.nip) });

    const kontakt = zNipem.find((k) => firmyZWbs.some((w) => zbiezne(k.firma, w)));
    if (kontakt) {
        const nip = normalizujNip(kontakt.nip);
        const wpis = rejestr.find((d) => normalizujNip(d.nip) === nip);
        return wpis ? zRejestru(wpis) : { nazwa: kontakt.firma || firmyZWbs[0] || '', adres: '', nip };
    }

    const poNazwie = rejestr.find((d) => firmyZWbs.some((w) => zbiezne(d.name, w)));
    if (poNazwie) return zRejestru(poNazwie);

    const poOsobie = rejestr.find((d) => osobyZWbs.some((o) => zbiezne(d.contactPerson, o) || zbiezne(d.name, o)));
    if (poOsobie) return zRejestru(poOsobie);

    if (zNipem.length === 1) {
        const nip = normalizujNip(zNipem[0].nip);
        const wpis = rejestr.find((d) => normalizujNip(d.nip) === nip);
        return wpis ? zRejestru(wpis) : { nazwa: zNipem[0].firma || firmyZWbs[0] || '', adres: '', nip };
    }

    return { nazwa: firmyZWbs[0] || '', adres: '', nip: '' };
}

// @anchor protokol-build-sections
// Zaznaczone liście → wiersze tabeli „Opis i wartość odbieranego zakresu". `planValueOf` przychodzi
// z zewnątrz (`RealizationTab`), żeby protokół pokazywał DOKŁADNIE tę kwotę planu, którą
// odbierający widzi na ekranie — własna formuła rozjechałaby się przy pierwszej zmianie wyceny.
// `kwotaOdbioru(row)` — ile TYM protokołem odbieramy z danego liścia. Osobna funkcja,
// a nie `planValueOf`, bo przy odbiorze częściowym kwota jest ustalana ręcznie i kolejny
// protokół dobiera resztę.
export function buildSekcjeIWartosci(selectedRows, branchIndex, kwotaOdbioru) {
    const byBranch = new Map();
    for (const row of selectedRows) {
        const b = branchOfLeaf(row.node);
        if (!byBranch.has(b)) byBranch.set(b, []);
        byBranch.get(b).push(row);
    }

    const branches = [...byBranch.keys()].sort((a, b) => (branchIndex[a] ?? 999) - (branchIndex[b] ?? 999));
    const grosze = (v) => Math.round(v * 100) / 100;

    // Tabela schodzi do POZIOMU LIŚCIA: gałąź niesie podsumę, pod nią stoją pojedyncze
    // pozycje z własnymi kwotami. Sama podsuma gałęzi nie mówi odbierającemu, za co
    // dokładnie płaci — a to on podpisuje się pod kwotą. Od 30.08.2026 to JEDYNY opis
    // zakresu w protokole: osobny punkt „Opis zakresu robót" wymieniał te same nazwy
    // bez kwot, więc wchodzi tutaj (kolejność gałęzi nadal z `branchIndex`).
    const wartosci = branches.map((b) => ({
        zakres: b,
        wartosc: grosze(byBranch.get(b).reduce((s, r) => s + kwotaOdbioru(r), 0)),
        pozycje: byBranch.get(b).map((r) => ({
            nazwa: r.node.name,
            wartosc: grosze(kwotaOdbioru(r)),
        })),
    }));

    const suma = Math.round(wartosci.reduce((s, w) => s + w.wartosc, 0) * 100) / 100;

    return { wartosci, suma, branches };
}

// @anchor protokol-default-number
// Domyślny numer: „Protokół odbioru {zamówienie} {gałąź} {data}". Segment gałęzi wchodzi
// TYLKO gdy odbierane liście pochodzą z jednej gałęzi — przy kilku we wzorze stał zbiorczy
// skrót branży („PPOŻ"), którego nie da się wyliczyć z danych. Pole zostaje edytowalne.
export function domyslnyNumer(orderName, branches, data) {
    const galaz = branches.length === 1 ? branches[0] : '';
    // Myślnik przykleja się do nazwy zamówienia BEZ spacji — tak, jak numer wpisywany
    // dotąd ręcznie („Protokół odbioru prac -CMC- Serwerownia ZDC1-K9_2026 …”).
    const prefiks = orderName ? `Protokół odbioru prac -${orderName}` : 'Protokół odbioru prac';
    return [prefiks, galaz, data].filter(Boolean).join(' ');
}

// @anchor protokol-filename
// Nazwa pliku = numer protokołu. Wycinamy wyłącznie znaki, których nie zniesie system plików
// ani OneDrive — polskie litery zostają, bo numer ma być czytelny w katalogu z dokumentacją.
export const protokolFilename = (numer, ext) =>
    `${String(numer || 'Protokół odbioru').replace(/["*:<>?/\\|]+/g, '-').trim().slice(0, 150)}.${ext}`;

// @anchor protokol-fetch-data-url
// Logo i skan podpisu z `public/` jako data URL: PDF wkleja je do HTML, DOCX dostaje je
// w treści żądania. Jedno źródło obrazków dla obu wyjść, bez assetów po stronie backendu.
export async function fetchDataUrl(path) {
    try {
        const res = await fetch(`${window.location.origin}${path}`);
        if (!res.ok) return '';
        const blob = await res.blob();
        return await new Promise((r) => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(blob); });
    } catch { return ''; }
}

// ─ PDF ───────────────────────────────────────────────────────────────────────

// @anchor protokol-css
// Nadpisuje `PDF_BASE_CSS` tam, gdzie formularz rządzi się swoimi prawami: pasy zebra
// (`tr:nth-child(even)`) zamieniłyby urzędowy formularz w tabelę raportu, a domyślne
// `td { border-bottom }` zostawiłoby komórki bez boków.
const PROTOKOL_CSS = `
  /* Tło jawnie białe: bazowy arkusz wydruku ustawia tylko kolor tekstu, więc w podglądzie
     na ciemnym motywie formularz robił się nieczytelny, a w druku bez tła — pusty.
     Uwaga: to wnętrze template literal — backticki tu NIE mogą się pojawić. */
  html, body { background: #fff; }
  .pr-tab { border-collapse: collapse; width: 100%; margin: 0 0 10px 0; table-layout: fixed; }
  .pr-tab td { border: 1px solid #7f7f7f; padding: 6px 8px; vertical-align: top; background: none; font-size: 11px; }
  .pr-tab tr:nth-child(even) td { background: none; }
  .pr-lab { background: #d9d9d9 !important; font-weight: bold; }
  .pr-en { display: block; font-size: 8px; color: #595959; font-style: italic; font-weight: normal; margin-top: 1px; }
  .pr-num { text-align: right; font-variant-numeric: tabular-nums; }
  .pr-note { font-size: 8px; color: #595959; font-style: italic; margin-top: 6px; }
  /* Miejsce na podpis to ramka o stałych proporcjach skanu (361x137), szeroka na 80%
     kolumny. Ramkę dostaje KAŻDY uczestnik — również ten bez skanu — więc kreski pod
     podpisami stoją w jednej linii niezależnie od tego, kto ma wklejony obrazek.
     Wysokość liczy aspect-ratio, dzięki czemu skan skaluje się proporcjonalnie
     razem z szerokością kolumny i nigdy nie jest rozciągnięty.
     Proporcja 318/58 to PRZYCIĘTY skan — plik miał wokół podpisu przezroczysty margines
     (318x58 atramentu na płótnie 361x137), przez co ramka na 80% kolumny dawała widoczny
     podpis na jakieś 60%. Po przycięciu 80% ramki to 80% widocznego podpisu. */
  .pr-poz-row { padding-left: 22px !important; }
  .pr-sign-box { width: 80%; margin: 0 auto 4px auto; aspect-ratio: 318 / 58; }
  .pr-sign-box img { display: block; width: 100%; height: 100%; object-fit: contain; }
  .pr-sign-date { font-size: 10px; margin-bottom: 4px; }
  .pr-sign-line { border-top: 1px solid #7f7f7f; text-align: center; padding-top: 3px; }
  .pr-sign-role { text-align: center; font-size: 8px; color: #595959; }
  .pr-tab.pr-inner { margin: 0; }
  .pr-tab.pr-inner td { font-size: 11px; }
`;

// @anchor protokol-lab-cell — komórka etykiety. `span` jest OBOWIĄZKOWY w każdej tabeli,
// która ma choć jeden wiersz wielokomórkowy: HTML liczy kolumny z najszerszego wiersza,
// więc etykieta bez colspanu kończyła się w połowie formularza.
const lab = (pl, en, span = 1, style = '') =>
    `<td class="pr-lab"${span > 1 ? ` colspan="${span}"` : ''}${style ? ` style="${style}"` : ''}>${esc(pl)}<span class="pr-en">${esc(en)}</span></td>`;
const wieloliniowo = (v) => esc(v || '—').split('\n').map((l) => `<div>${l || '&nbsp;'}</div>`).join('');

// @anchor protokol-build-body-html
export function buildProtokolBodyHtml(d) {
    const zaznacz = (on) => (on ? '☑' : '☐');

    const wartosci = `
      <table class="pr-tab pr-inner">
        <tr><td class="pr-lab" style="width:73%">Zakres</td><td class="pr-lab pr-num">Wartość</td></tr>
        ${d.wartosci.map((w) => `
          <tr><td><b>${esc(w.zakres)}</b></td><td class="pr-num"><b>${fmtZlProtokol(w.wartosc)}</b></td></tr>
          ${(w.pozycje || []).map((poz) => `
            <tr><td class="pr-poz-row">${esc(poz.nazwa)}</td><td class="pr-num">${fmtZlProtokol(poz.wartosc)}</td></tr>
          `).join('')}
        `).join('')}
        <tr><td><b>suma</b></td><td class="pr-num"><b>${fmtZlProtokol(d.suma)}</b></td></tr>
      </table>`;

    // Tabela wyboru stoi na siatce SZEŚCIU kolumn (`<colgroup>`), bo dzielą ją dwa wiersze
    // o różnej liczbie komórek: rodzaj odbioru na trzy, wynik odbioru na dwie. Bez wspólnej
    // siatki `table-layout: fixed` liczyłby szerokości z pierwszego wiersza i drugi rozjeżdżał się.
    const opcja = (on, pl, en) =>
        `<td colspan="2">${zaznacz(on)} ${on ? `<b>${esc(pl)}</b>` : esc(pl)}<span class="pr-en">${esc(en)}</span></td>`;

    const wynikOdbioru = (on, pl, en) =>
        `<td colspan="3">${zaznacz(on)} ${on ? `<b>${esc(pl)}</b>` : esc(pl)}<span class="pr-en">${esc(en)}</span></td>`;

    // Data stoi NAD podpisem i osobno w każdej kolumnie: podwykonawca podpisuje na budowie,
    // przedstawiciel Airtela po weryfikacji, inspektor nadzoru jeszcze później.
    const podpis = (rola, osoba, data, img) => `
      <td style="width:33.33%">
        <div class="pr-sign-date">Data ${esc(data || '—')}</div>
        <div class="pr-sign-box">${img ? `<img src="${img}" alt="" />` : ''}</div>
        <div class="pr-sign-line">${esc(osoba || ' ')}</div>
        <div class="pr-sign-role">${esc(rola)}</div>
      </td>`;

    // @anchor protokol-strony — „Zamawiający" i „Wykonawca" nad umową i zakresem: pierwsze
    // pytanie przy dokumencie odbioru brzmi „między kim a kim". Puste dane drukują się jako
    // „—", żeby brak NIP-u wykonawcy rzucał się w oczy przed podpisem, a nie po.
    const strona = (s) => `
      <td style="width:50%">
        <b>${esc(s?.nazwa || '—')}</b>
        <div>${esc(s?.adres || '—')}</div>
        <div>NIP ${esc(s?.nip || '—')}</div>
      </td>`;

    return `
    <table class="pr-tab">
      <tr>
        ${lab('Numer protokołu*', 'Protocol number*', 1, 'width:22%')}
        <td style="width:46%"><b>${esc(d.numer)}</b></td>
        ${lab('Data', 'Date', 1, 'width:12%')}
        <td style="width:20%">${esc(d.data)}</td>
      </tr>
    </table>

    <table class="pr-tab">
      <tr>
        ${lab('Zamawiający', 'Ordering party', 1, 'width:50%')}
        ${lab('Wykonawca', 'Contractor', 1, 'width:50%')}
      </tr>
      <tr>
        ${strona(d.zamawiajacy)}
        ${strona(d.wykonawca)}
      </tr>
    </table>

    <table class="pr-tab">
      <tr>${lab('Dotyczy Umowy nr.', 'Agreement')}</tr>
      <tr><td>${wieloliniowo(d.umowa)}</td></tr>

      <tr>${lab('Opis i wartość odbieranego zakresu', 'Description and value of commissioned scope')}</tr>
      <tr><td>${wartosci}</td></tr>
    </table>

    <table class="pr-tab">
      <colgroup><col><col><col><col><col><col></colgroup>
      <tr>
        ${opcja(d.odbior === 'CALOSCIOWY', 'Całościowy odbiór pozycji', 'Overall reception of the item')}
        ${opcja(d.odbior === 'CZESCIOWY', 'Częściowy odbiór pozycji', 'Partial reception of the item')}
        ${opcja(d.odbior === 'NIE_DOTYCZY', 'Zakres nie odebrany z uwagi na wady/braki', 'Scope not accepted due to defects/deficiencies')}
      </tr>
      <tr>
        ${wynikOdbioru(d.wynik !== 'NEGATYWNY', 'Wynik odbioru pozytywny', 'Positive result of commissioning')}
        ${wynikOdbioru(d.wynik === 'NEGATYWNY', 'Wynik odbioru negatywny', 'Negative result of commissioning')}
      </tr>
    </table>

    <table class="pr-tab">
      <tr>${lab('Wady i usterki przedmiotu odbioru**', 'Defects or failures of subject of commissioning**', 2)}</tr>
      <tr><td colspan="2">
        ${wieloliniowo(d.wady)}
        <div class="pr-note">** jeżeli dotyczy, wpisać datę usunięcia / if applicable, include the date of removal</div>
      </td></tr>
      <tr>
        <td style="width:72%">Listę wad i usterek zestawiono w protokole usterkowym<span class="pr-en">The list of defects and failures is compiled in the defect protocol</span></td>
        <td>${zaznacz(d.protokolUsterkowy === true)} Tak &nbsp;&nbsp; ${zaznacz(d.protokolUsterkowy === false)} Nie</td>
      </tr>

      <tr>${lab('Inne uwagi', 'Other remarks', 2)}</tr>
      <tr><td colspan="2">${wieloliniowo(d.uwagi)}</td></tr>

      <tr>${lab('Lista załączników do protokołu', 'List of protocol attachements', 2)}</tr>
      <tr><td colspan="2">${wieloliniowo(d.zalaczniki)}</td></tr>
    </table>

    <table class="pr-tab">
      <tr>${lab('Podpisy przedstawicieli stron', 'Signatures of parties representatives', 3)}</tr>
      <tr>
        ${podpis('Przedstawiciel Airtel Services', d.przedstawicielAirtel, d.dataPodpisuAirtel, d.podpisDataUrl)}
        ${podpis('Przedstawiciel Podwykonawcy', d.przedstawicielPodwykonawcy, d.dataPodpisuPodwykonawcy, '')}
        ${podpis('Inspektor nadzoru', d.inspektorNadzoru, d.dataPodpisuInspektora, '')}
      </tr>
    </table>`;
}

// @anchor protokol-build-html
// Nagłówek dokumentu leci przez `buildPdfDocument` — ten sam co w każdym innym wydruku
// aplikacji, więc logo, tytuł i data siedzą tam, gdzie użytkownik się ich spodziewa.
// Literówka „COMMISIONING" jest w oryginalnym formularzu Airtela i zostaje celowo.
export function buildProtokolHtml(d) {
    return buildPdfDocument({
        logoDataUrl: d.logoDataUrl || '',
        title: 'PROTOKÓŁ ODBIORU PRAC',
        subtitle: 'COMMISIONING PROTOCOL',
        date: d.data,
        bodyHtml: buildProtokolBodyHtml(d),
        extraCss: PROTOKOL_CSS,
    });
}

// @anchor protokol-open-pdf — wydruk z przeglądarki, ta sama ścieżka co pozostałe eksporty PDF.
export function openProtokolPdf(d) {
    openPdfBlob(buildProtokolHtml(d));
}

// ─ DOCX ──────────────────────────────────────────────────────────────────────

// @anchor protokol-make-docx
// DOCX powstaje na backendzie, bo tylko tam stoi biblioteka `docx`. Zwracamy kształt
// `{ blob, filename }` zrozumiały dla `resolveArtifact`, więc plik idzie tą samą drogą
// co PDF: pobranie, mail albo OneDrive.
export async function makeProtokolDocx(d) {
    const token = sessionStorage.getItem('token') || localStorage.getItem('token');
    const filename = protokolFilename(d.numer, 'docx');
    const res = await fetch(`${API_URL}/acceptance-protocols/docx`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...d, filename }),
    });
    if (!res.ok) throw new Error(`Generowanie DOCX nieudane (${res.status})`);
    return { blob: await res.blob(), filename };
}

// @anchor protokol-make-pdf
export function makeProtokolPdf(d) {
    return { html: buildProtokolHtml(d), filename: protokolFilename(d.numer, 'pdf') };
}
