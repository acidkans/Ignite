import { useState, useEffect, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import DatePicker, { registerLocale } from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import { pl } from 'date-fns/locale/pl';
import { X, FileText, Eye, CheckSquare, Square, Cloud, Loader2, Undo2, History, Download, Lock, Unlock } from 'lucide-react';
import AutoResizeTextarea from './AutoResizeTextarea';
import ExportChoiceModal from '../ExportChoiceModal';
import {
    buildBranchIndex, buildBranchOwners, ownersOfSelection, buildSekcjeIWartosci, domyslnyNumer,
    fmtDataProtokol, fmtZlProtokol, fetchStatusOdbioru, protokolRootOf, pozostaloDoOdbioru, pozycjaZamknieta, zapiszOdbior,
    fetchProtokoly, usunProtokol, budujRoznice, tekstRoznic,
    stronaZamawiajacego, stronaWykonawcy,
    fetchDataUrl, openProtokolPdf, makeProtokolDocx, makeProtokolPdf, protokolFilename,
} from '../../../utils/protokolOdbioruExport';
import { resolveArtifact, uploadToOneDrive, fetchRecipients } from '../../../utils/exportMail';
import { API_URL } from '../../../config';

// @anchor protokol-odbioru-modal
// Modal protokołu odbioru prac: zaznaczenie odbieranych liści WBS + pytania o pola,
// których w bazie nie ma (umowa, wady, uwagi, załączniki, przedstawiciele). Wartości
// podpowiadają się z wyceny, numer składa się sam i zostaje edytowalny.
//
// Gotowy protokół NIE zostaje w bazie — jedynym archiwum jest OneDrive
// (`pliki_finansowe/<podkatalog>`), dlatego eksport idzie przez `ExportChoiceModal`.

// @anchor protokol-remembered-fields
// Pola, które przy każdym protokole wpisywałoby się tak samo, pamiętane w przeglądarce.
// Świadomie NIE w bazie: to nawyk konkretnej osoby przy konkretnym biurku, a nie dana
// zamówienia — inny odbierający ma mieć własne podpowiedzi.
//
// Przedstawiciela podwykonawcy tu NIE MA celowo: bierze się z właściciela odbieranej gałęzi
// (`protokol-auto-podwykonawca`), a zapamiętane nazwisko z poprzedniego protokołu wjechałoby
// do dokumentu dotyczącego innej gałęzi i innego wykonawcy — w rzeczy podpisywanej to gorsze
// niż puste pole.
const PAMIETANE = ['przedstawicielAirtel', 'inspektorNadzoru'];

// @anchor protokol-dak-spolka — po czym poznajemy DAK-a właściwej spółki. Dopasowanie
// fragmentem nazwy firmy (`User.company`), a nie pełnym łańcuchem, bo w bazie stoi
// „Airtel Services" obok „Airtel Systems" i liczy się tylko rozróżnienie tych dwóch.
const DAK_SPOLKA = 'services';
const pamiec = {
    czytaj: (k, dom = '') => { try { return localStorage.getItem(`protokol:${k}`) ?? dom; } catch { return dom; } },
    zapisz: (k, v) => { try { localStorage.setItem(`protokol:${k}`, v ?? ''); } catch { /* tryb prywatny */ } },
};

// @anchor protokol-nadwyzka
// Czy odebrano WIĘCEJ niż przewiduje wycena — wyłącznie sygnał dla czerwonej kwoty
// na liście w modalu; w samym dokumencie protokołu nic się od tego nie zmienia.
// Nadwyżka bierze się z odbioru na kwotę wpisaną z ręki albo z obniżenia wyceny już
// po podpisanym odbiorze. Tolerancja groszowa jak w `pozycjaZamknieta`: odbiór „na
// styk" nie jest nadwyżką.
const nadwyzkaOdbioru = (odebrane, plan) => (Number(odebrane) || 0) - (Number(plan) || 0) > 0.005;

// @anchor protokol-email-wlasciciela
// Adres właściciela gałęzi. `WbsNode.owner` to ETYKIETA z listy wyboru, nie klucz obcy —
// „Firma — Imię Nazwisko" dla użytkownika, „Firma - Imię Nazwisko" dla kontaktu projektu —
// więc adres trzeba odzyskać po nazwisku z listy podpowiedzi `/mail/recipients`.
// Rozdzielamy po myślniku OTOCZONYM spacjami, żeby nie rozciąć nazwiska („Nowak-Kowalska").
// Brak trafienia zwraca pusty string: lepiej puste pole „Do" niż adres przypadkowej osoby.
const emailWlasciciela = (etykieta, kontakty) => {
    const s = String(etykieta || '').trim();
    if (!s) return '';
    const wprost = s.match(/[^\s<>,;]+@[^\s<>,;]+/);
    if (wprost) return wprost[0].toLowerCase();
    const osoba = s.split(/\s+[—–-]\s+/).pop().trim().toLowerCase();
    if (!osoba) return '';
    return (kontakty || []).find((k) => String(k.label || '').trim().toLowerCase() === osoba)?.email || '';
};

const POLE = 'w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500';
const ETYKIETA = 'block text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1.5';

registerLocale('pl', pl);

// @anchor protokol-dp-portal
// Kalendarz renderowany w portalu (klasa `ignite-dp` — ciemny motyw z index.css). Portal
// jest tu konieczny: formularz protokołu scrolluje się w `overflow-y-auto`, który inaczej
// przyciąłby rozwinięty kalendarz. Kliknięcie w dzień nie zamyka modala, bo portal siedzi
// w drzewie REACTA pod kartą, a ta zatrzymuje propagację na swoim `onClick`.
const DpPortal = ({ children }) => createPortal(<div className="ignite-dp">{children}</div>, document.body);

// @anchor protokol-parsuj-date
// „dd.mm.rrrr" → Date. Protokół trzyma daty jako tekst w polskim formacie (tak wychodzą
// do dokumentu), więc kalendarz dostaje je przez tę konwersję. Godzina 12 zamiast północy:
// przy przejściu na czas letni północ potrafi cofnąć się na dzień wcześniejszy.
const parsujDate = (s) => {
    const m = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(String(s || '').trim());
    if (!m) return null;
    const d = new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]), 12);
    return Number.isNaN(d.getTime()) ? null : d;
};

// @anchor protokol-pole-daty
// Pole daty protokołu: kalendarz zamiast wpisywania z ręki. Pusta wartość jest DOZWOLONA —
// daty podpisu podwykonawcy i inspektora zostają puste, bo w chwili wystawiania dokumentu
// nikt jeszcze nie wie, kiedy tamci go podpiszą; w PDF wychodzi wtedy „Data —" do wypełnienia
// długopisem.
const PoleDaty = ({ value, onChange }) => (
    <div className="ignite-dp-field">
        <DatePicker
            selected={parsujDate(value)}
            onChange={(d) => onChange(d ? fmtDataProtokol(d) : '')}
            locale="pl"
            dateFormat="dd.MM.yyyy"
            placeholderText="dd.mm.rrrr"
            isClearable
            showPopperArrow={false}
            popperPlacement="bottom-start"
            popperContainer={DpPortal}
            className={POLE}
        />
    </div>
);

export default function ProtokolOdbioruModal({
    open, onClose, rows, wbsNodes, nodeId, orderName, planValueOf, oneDriveFolderName,
}) {
    const [zaznaczone, setZaznaczone] = useState(() => new Set());
    const [numerRecznie, setNumerRecznie] = useState(false);
    const [podwykonawcaRecznie, setPodwykonawcaRecznie] = useState(false);
    // @anchor protokol-adnotacja-reczna — ręcznie poprawiona treść adnotacji o rozjeździe
    // z ofertą. null = trzymamy się tekstu liczonego z kwot; string = odbierający przepisał
    // go po swojemu i od tej chwili przeliczenie go NIE nadpisuje (jak przy numerze protokołu).
    const [adnotacjaReczna, setAdnotacjaReczna] = useState(null);
    const [format, setFormat] = useState('pdf');
    const [eksportOtwarty, setEksportOtwarty] = useState(false);
    const [obrazki, setObrazki] = useState({ logo: '', podpis: '' });
    // @anchor protokol-status-odbioru — mapa `wbsRootId → { odebrane, domkniete }` z rejestru.
    // Po niej modal wie, co wyszarzyć i od jakiej kwoty zacząć kolejny odbiór.
    const [statusOdbioru, setStatusOdbioru] = useState({});
    const [statusBlad, setStatusBlad] = useState('');
    // @anchor protokol-kwoty-reczne — kwoty odbioru nadpisane ręcznie, `wbsRootId → liczba`.
    // Pozycje spoza tej mapy odbierane są w całości pozostałej kwoty.
    const [kwotyReczne, setKwotyReczne] = useState({});
    // @anchor protokol-kwota-odblokowana — pozycje z ODBLOKOWANYM polem kwoty, `wbsRootId → bool`.
    // Sama blokada pola, NIC WIĘCEJ: wcześniej ten sam przełącznik decydował też o domknięciu
    // pozycji, więc ponowne kliknięcie „Zablokuj" przy obniżonej kwocie zamykało odbiór na tej
    // kwocie — pozostała część znikała z puli, mimo że nikt jej nie odebrał.
    const [odblokowaneKwoty, setOdblokowaneKwoty] = useState({});
    // @anchor protokol-domkniecie-czesciowe — świadoma decyzja „odbieram MNIEJ, ale pozycję
    // zamykam" (rabat, korekta zakresu), `wbsRootId → bool`. Osobny, jawny przełącznik: przy
    // pełnej kwocie domknięcie wynika z samej kwoty i tej mapy nie dotyka.
    const [domknieciaCzesciowe, setDomknieciaCzesciowe] = useState({});
    const [zapisanoOdbior, setZapisanoOdbior] = useState(false);
    // @anchor protokol-wystawione — wystawione protokoły zamówienia. Pokazujemy je w modalu,
    // bo bez tej listy pomyłkowy odbiór wyszarzałby pozycję bez żadnej drogi odwrotu.
    const [wystawione, setWystawione] = useState([]);
    const [listaOtwarta, setListaOtwarta] = useState(false);
    const [doWycofania, setDoWycofania] = useState(null);
    const [wysylka, setWysylka] = useState('');
    // @anchor protokol-profil — zalogowany użytkownik do podpisu pod mailem.
    const [profil, setProfil] = useState({ firstName: '', lastName: '', phone: '' });
    // @anchor protokol-kontakty — podpowiedzi adresowe zamówienia; służą do odzyskania
    // adresu właściciela gałęzi, bo w WBS zapisana jest tylko jego etykieta.
    const [kontakty, setKontakty] = useState([]);
    // @anchor protokol-dak-odbiorcy — adresy działu DAK (administracyjno-księgowego), stała
    // kopia maila z protokołem. Protokół jest podstawą faktury, więc księgowość ma go dostać
    // zawsze; pobieramy po ROLI, a nie z wpisanej listy, żeby zmiana obsady działu nie
    // wymagała ruszania kodu ani pamiętania adresu przez odbierającego.
    // Zawężone do spółki z DAK_SPOLKA: rolę DAK ma po jednej osobie w każdej spółce grupy,
    // a protokół jest dokumentem Airtel Services. Brak trafienia → cały dział, żeby kopia
    // poszła do kogokolwiek z księgowości zamiast zniknąć po cichu.
    const [dakOdbiorcy, setDakOdbiorcy] = useState([]);
    // @anchor protokol-strony-danych — surowe źródła wierszy „Zamawiający"/„Wykonawca":
    // singleton firmy, kontakty zamówienia (stąd NIP wykonawcy) i rejestr firm (stąd jego
    // pełna nazwa i adres z Białej listy VAT). Braki nie blokują dokumentu — drukuje się „—".
    const [firmaNasza, setFirmaNasza] = useState(null);
    const [kontaktyZamowienia, setKontaktyZamowienia] = useState([]);
    const [dostawcy, setDostawcy] = useState([]);

    const dzis = fmtDataProtokol(new Date());
    const [pola, setPola] = useState(() => ({
        numer: '',
        data: dzis,
        umowa: '',
        odbior: 'CALOSCIOWY',
        odbiorRecznie: false,
        // @anchor protokol-wynik-odbioru — wynik protokołu, oś niezależna od rodzaju odbioru.
        // Domyślnie pozytywny: protokół wystawia się po odbiorze, który się udał; negatywny
        // to wyjątek zgłaszany ręcznie razem z opisem wad.
        wynik: 'POZYTYWNY',
        wady: '',
        protokolUsterkowy: null,
        uwagi: '',
        zalaczniki: '',
        dataPodpisuAirtel: dzis,
        // Puste świadomie: w chwili wystawiania protokołu nie wiadomo, kiedy podwykonawca
        // i inspektor go podpiszą. Wstawienie „dziś" wpisywałoby do dokumentu datę, której
        // nikt nie potwierdził — w rzeczy podpisywanej to gorsze niż pusta kratka.
        dataPodpisuPodwykonawcy: '',
        dataPodpisuInspektora: '',
        przedstawicielAirtel: pamiec.czytaj('przedstawicielAirtel'),
        przedstawicielPodwykonawcy: '',
        inspektorNadzoru: pamiec.czytaj('inspektorNadzoru'),
        podkatalog: '',
        podkatalogRecznie: false,
    }));

    const ustaw = (k, v) => setPola((p) => ({ ...p, [k]: v }));

    // Logo i podpis pobierane raz przy otwarciu — obie ścieżki eksportu (HTML→PDF i DOCX)
    // dostają je jako data URL, więc nie ma znaczenia, czy plik składa front, czy backend.
    useEffect(() => {
        if (!open) return;
        let zyje = true;
        Promise.all([fetchDataUrl('/airtel-logo-services.png'), fetchDataUrl('/podpis-airtel.png')])
            .then(([logo, podpis]) => { if (zyje) setObrazki({ logo, podpis }); });
        return () => { zyje = false; };
    }, [open]);

    useEffect(() => {
        if (!open) {
            setZaznaczone(new Set()); setNumerRecznie(false); setPodwykonawcaRecznie(false);
            setEksportOtwarty(false); setKwotyReczne({}); setOdblokowaneKwoty({}); setDomknieciaCzesciowe({});
            setZapisanoOdbior(false); setStatusBlad(''); setDoWycofania(null); setWysylka('');
            setListaOtwarta(false);
        setAdnotacjaReczna(null);
        }
    }, [open]);

    // @anchor protokol-pobierz-mail-dane — profil podpisującego mail i książka adresowa
    // zamówienia. Pobierane przy otwarciu modala, a nie dopiero przy kliknięciu „Wyślij":
    // formularz maila ma się otworzyć z gotowym adresatem, bez migania pustym polem.
    // Błąd żadnego z tych żądań nie blokuje protokołu — podpowiedzi to wygoda, nie warunek.
    useEffect(() => {
        if (!open) return;
        let zyje = true;
        fetch(`${API_URL}/users/profile`, { headers: { Authorization: `Bearer ${sessionStorage.getItem('token') || localStorage.getItem('token')}` } })
            .then((r) => (r.ok ? r.json() : null))
            .then((p) => { if (zyje && p) setProfil({ firstName: p.firstName || '', lastName: p.lastName || '', phone: p.phone || '' }); })
            .catch(() => { /* podpis zostanie bez nazwiska — do dopisania ręcznie */ });
        fetchRecipients(nodeId).then((k) => { if (zyje) setKontakty(k || []); });
        fetch(`${API_URL}/users/by-role/DAK`, { headers: { Authorization: `Bearer ${sessionStorage.getItem('token') || localStorage.getItem('token')}` } })
            .then((r) => (r.ok ? r.json() : []))
            .then((lista) => {
                if (!zyje) return;
                const wszyscy = lista || [];
                const zeSpolki = wszyscy.filter((u) => String(u.company || '').toLowerCase().includes(DAK_SPOLKA));
                const adresy = (zeSpolki.length ? zeSpolki : wszyscy)
                    .map((u) => String(u.email || '').trim().toLowerCase())
                    .filter((e) => e.includes('@'));
                setDakOdbiorcy([...new Set(adresy)]);
            })
            .catch(() => { /* brak DAK-a w kopii — adres można dopisać ręcznie */ });
        const naglowki = { Authorization: `Bearer ${sessionStorage.getItem('token') || localStorage.getItem('token')}` };
        fetch(`${API_URL}/company`, { headers: naglowki })
            .then((r) => (r.ok ? r.json() : null))
            .then((f) => { if (zyje) setFirmaNasza(f || null); })
            .catch(() => { /* wiersz „Zamawiający" wyjdzie z „—" */ });
        fetch(`${API_URL}/order-requirements/${nodeId}`, { headers: naglowki })
            .then((r) => (r.ok ? r.text() : ''))
            .then((t) => {
                if (!zyje || !t) return;
                const d = JSON.parse(t) || {};
                let dodatkowe = [];
                try { dodatkowe = JSON.parse(d.clientContacts || '[]') || []; } catch { dodatkowe = []; }
                setKontaktyZamowienia([
                    { firma: d.clientProjectManagerCompany || '', nip: d.clientProjectManagerNip || '' },
                    ...dodatkowe.map((k) => ({ firma: k.company || '', nip: k.nip || '' })),
                ]);
            })
            .catch(() => { /* brak kontaktów — wykonawca zostanie bez NIP-u */ });
        fetch(`${API_URL}/suppliers`, { headers: naglowki })
            .then((r) => (r.ok ? r.json() : []))
            .then((l) => { if (zyje) setDostawcy(Array.isArray(l) ? l : []); })
            .catch(() => { /* bez rejestru zostaje sama nazwa firmy z kontaktu */ });
        return () => { zyje = false; };
    }, [open, nodeId]);

    // Stan odbiorów pobierany przy każdym otwarciu — inny użytkownik mógł w międzyczasie
    // wystawić protokół na te same pozycje.
    useEffect(() => {
        if (!open || !nodeId) return;
        let zyje = true;
        setStatusBlad('');
        Promise.all([fetchStatusOdbioru(nodeId), fetchProtokoly(nodeId)])
            .then(([st, lista]) => { if (zyje) { setStatusOdbioru(st); setWystawione(lista); } })
            .catch((e) => { if (zyje) setStatusBlad(e?.message || 'Nie udało się pobrać stanu odbiorów'); });
        return () => { zyje = false; };
    }, [open, nodeId]);

    // @anchor protokol-reset-formularza — czyści treść protokołu przy każdym otwarciu modalu.
    // Modal nie jest odmontowywany po zamknięciu (steruje nim samo `open`), więc bez tego
    // kolejny protokół startował z zaznaczeniem, kwotami i uwagami poprzedniego — jedynym
    // sposobem na czysty formularz było wyjście z Realizacji i wejście z powrotem.
    // Pola zapamiętane w przeglądarce (`PAMIETANE`) zostają: to nawyk odbierającego, nie
    // treść konkretnego protokołu.
    const resetFormularza = useCallback(() => {
        setZaznaczone(new Set());
        setKwotyReczne({});
        setOdblokowaneKwoty({});
        setDomknieciaCzesciowe({});
        setNumerRecznie(false);
        setPodwykonawcaRecznie(false);
        setZapisanoOdbior(false);
        setStatusBlad('');
        setWysylka('');
        setListaOtwarta(false);
        const d = fmtDataProtokol(new Date());
        setPola((p) => ({
            ...p,
            numer: '', data: d, umowa: '',
            odbior: 'CALOSCIOWY', odbiorRecznie: false,
            wynik: 'POZYTYWNY', wady: '', protokolUsterkowy: null,
            uwagi: '', zalaczniki: '',
            dataPodpisuAirtel: d, dataPodpisuPodwykonawcy: '', dataPodpisuInspektora: '',
            przedstawicielPodwykonawcy: '',
            podkatalog: '', podkatalogRecznie: false,
        }));
    }, []);

    useEffect(() => { if (open) resetFormularza(); }, [open, resetFormularza]);

    // @anchor protokol-odswiez-rejestr — stan pozycji i lista protokołów zawsze razem:
    // rozjazd między nimi pokazywałby wyszarzoną pozycję bez protokołu, który ją zamknął.
    const odswiezRejestr = useCallback(async () => {
        const [st, lista] = await Promise.all([fetchStatusOdbioru(nodeId), fetchProtokoly(nodeId)]);
        setStatusOdbioru(st);
        setWystawione(lista);
    }, [nodeId]);

    const branchIndex = useMemo(() => buildBranchIndex(wbsNodes), [wbsNodes]);
    const branchOwners = useMemo(() => buildBranchOwners(wbsNodes), [wbsNodes]);

    // @anchor protokol-modal-groups — liście widoku pogrupowane po gałęzi, w kolejności gałęzi
    // z zamówienia. Ta sama oś, po której protokół liczy wartości, więc to, co widać w modalu,
    // wychodzi potem w tabeli „Opis i wartość odbieranego zakresu".
    const grupy = useMemo(() => {
        const map = new Map();
        for (const r of rows) {
            const b = (r.node.path || r.node.name || '').split(' › ')[0] || '—';
            if (!map.has(b)) map.set(b, []);
            map.get(b).push(r);
        }
        return [...map.entries()]
            .sort((a, b) => (branchIndex[a[0]] ?? 999) - (branchIndex[b[0]] ?? 999))
            .map(([nazwa, pozycje]) => ({ nazwa, nr: branchIndex[nazwa] ?? null, pozycje }));
    }, [rows, branchIndex]);

    // @anchor protokol-pozostalo-of — ile z pozycji zostaje do odebrania: plan z wyceny
    // minus to, co zabrały wcześniejsze protokoły. Pozycja domknięta zwraca 0.
    const pozostaloOf = useCallback(
        (row) => pozostaloDoOdbioru(planValueOf(row.node, row.card), statusOdbioru[protokolRootOf(row.node)]),
        [planValueOf, statusOdbioru],
    );

    // @anchor protokol-domkniete-of — pozycja niedostępna do odbioru: wyszarzona i nieklikalna.
    // Regułę trzyma `pozycjaZamknieta` w utilu (domknięta flagą ALBO wyczerpana kwotowo),
    // żeby ta sama odpowiedź obowiązywała wszędzie i dała się pokryć testem.
    const domknieteOf = useCallback(
        (row) => pozycjaZamknieta(planValueOf(row.node, row.card), statusOdbioru[protokolRootOf(row.node)]),
        [planValueOf, statusOdbioru],
    );

    // @anchor protokol-kwota-odbioru — ile TYM protokołem odbieramy z pozycji. Domyślnie
    // cała pozostała kwota; ręczne obniżenie zostawia resztę na kolejny protokół.
    //
    // Kwota NIE JEST ograniczona z góry wyceną: akceptacja bywa wystawiona na inną kwotę niż
    // oferta i to ona, a nie nasz kosztorys, jest treścią podpisywanego dokumentu. Różnica
    // wobec oferty trafia do uwag protokołu (`protokol-adnotacja-roznic`), zamiast być po
    // cichu obcięta do wyceny.
    const kwotaOdbioru = useCallback((row) => {
        const reczna = kwotyReczne[protokolRootOf(row.node)];
        if (reczna == null || reczna === '') return pozostaloOf(row);
        return Math.max(0, Math.round((Number(reczna) || 0) * 100) / 100);
    }, [kwotyReczne, pozostaloOf]);

    // @anchor protokol-pelna-kwota-of — czy pozycja idzie za CAŁĄ pozostałą kwotę.
    const pelnaKwotaOf = useCallback(
        (row) => kwotaOdbioru(row) >= pozostaloOf(row) - 0.005,
        [kwotaOdbioru, pozostaloOf],
    );

    // @anchor protokol-pelny-of — czy pozycja zostaje TYM protokołem DOMKNIĘTA. Pełna kwota
    // domyka zawsze; kwota niższa tylko wtedy, gdy odbierający jawnie to zaznaczy
    // (`domknieciaCzesciowe`). Blokada pola kwoty NIE ma tu nic do rzeczy — mylenie tych
    // dwóch rzeczy zamykało pozycje odebrane w części.
    const pelnyOf = useCallback(
        (row) => pelnaKwotaOf(row) || !!domknieciaCzesciowe[protokolRootOf(row.node)],
        [pelnaKwotaOf, domknieciaCzesciowe],
    );

    // @anchor protokol-kwota-zablokowana-of — pole kwoty stoi zablokowane, dopóki odbieramy
    // całą pozostałą kwotę i nikt tego nie odblokował.
    const kwotaZablokowanaOf = useCallback(
        (row) => pelnaKwotaOf(row) && !odblokowaneKwoty[protokolRootOf(row.node)],
        [pelnaKwotaOf, odblokowaneKwoty],
    );

    // @anchor protokol-podsumowanie — kwotowy bilans odbiorów zamówienia liczony po tych
    // samych wierszach, które widać w tabeli: plan z wyceny, ile zabrały dotychczasowe
    // protokoły i ile zostaje. Bez tego jedyną informacją o zatwierdzonych pracach było
    // wyszarzenie pozycji — nikt nie wiedział, na jaką kwotę zamówienie jest już odebrane.
    // `odebrane` przycinamy do planu pozycji, żeby protokół wystawiony na kwotę wyższą od
    // oferty (akceptacja na inną kwotę) nie wypychał paska ponad 100%.
    const podsumowanie = useMemo(() => {
        let plan = 0; let odebrane = 0; let pozostalo = 0;
        for (const r of rows) {
            const p = Number(planValueOf(r.node, r.card)) || 0;
            const st = statusOdbioru[protokolRootOf(r.node)];
            const od = Number(st?.odebrane) || 0;
            plan += p;
            odebrane += p > 0 ? Math.min(od, p) : od;
            pozostalo += pozostaloDoOdbioru(p, st);
        }
        const zaokr = (x) => Math.round(x * 100) / 100;
        return {
            plan: zaokr(plan),
            odebrane: zaokr(odebrane),
            pozostalo: zaokr(pozostalo),
            procent: plan > 0 ? Math.min(100, Math.round((odebrane / plan) * 100)) : 0,
        };
    }, [rows, planValueOf, statusOdbioru]);

    const wybrane = useMemo(
        () => rows.filter((r) => zaznaczone.has(r.node.id) && !domknieteOf(r)),
        [rows, zaznaczone, domknieteOf],
    );

    const { wartosci, suma, branches } = useMemo(
        () => buildSekcjeIWartosci(wybrane, branchIndex, kwotaOdbioru),
        [wybrane, branchIndex, kwotaOdbioru],
    );

    // @anchor protokol-auto-number — numer i podkatalog przeliczają się przy każdej zmianie
    // zaznaczenia, DOPÓKI użytkownik ich nie tknie. Po ręcznej edycji przestajemy nadpisywać —
    // inaczej dopisanie jednej pozycji kasowałoby wpisany numer.
    useEffect(() => {
        if (!numerRecznie) ustaw('numer', domyslnyNumer(orderName, branches, pola.data));
        if (!pola.podkatalogRecznie) ustaw('podkatalog', branches[0] || '');
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [branches.join('|'), pola.data, numerRecznie, orderName]);

    // @anchor protokol-adnotacja-roznic — adnotacja o rozjeździe z ofertą, trzymana OSOBNO
    // od tekstu użytkownika. Doklejana do uwag dopiero przy budowaniu dokumentu: przelicza
    // się przy każdej zmianie kwoty, a nadpisywanie pola, w którym ktoś właśnie pisze,
    // kasowałoby mu zdanie w połowie.
    const adnotacjaRoznic = useMemo(() => tekstRoznic(budujRoznice(wybrane.map((r) => ({
        nazwa: r.node.name,
        oferta: planValueOf(r.node, r.card),
        odebraneWczesniej: statusOdbioru[protokolRootOf(r.node)]?.odebrane || 0,
        kwota: kwotaOdbioru(r),
        pelny: pelnyOf(r),
    })))),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [wybrane, kwotyReczne, domknieciaCzesciowe, statusOdbioru]);

    // @anchor protokol-adnotacja-finalna — to, co naprawdę wejdzie do dokumentu: wersja
    // ręczna, jeśli istnieje, inaczej wyliczona z kwot.
    const adnotacjaFinalna = adnotacjaReczna ?? adnotacjaRoznic;

    // @anchor protokol-auto-podwykonawca — przedstawiciel podwykonawcy podpowiada się
    // właścicielem odbieranej gałęzi. Wpisujemy TYLKO wartość niepustą: gałąź bez właściciela
    // nie ma czym nadpisać tego, co odbierający zdążył już wpisać ręcznie. Po ręcznej edycji
    // pola przestajemy podpowiadać, tak samo jak przy numerze protokołu.
    useEffect(() => {
        if (podwykonawcaRecznie) return;
        const osoby = ownersOfSelection(wybrane, branchOwners);
        if (osoby.length) ustaw('przedstawicielPodwykonawcy', osoby.join(', '));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [wybrane, branchOwners, podwykonawcaRecznie]);

    // @anchor protokol-mail-domyslni — adresaci maila: osoby odpowiedzialne za ODBIERANY
    // zakres, te same, które trafiają nad kreskę „Przedstawiciel Podwykonawcy". Protokół
    // dotyczy ich roboty, więc to oni są pierwszym adresatem; lista zostaje edytowalna,
    // bo dokument bywa wysyłany dalej (inwestor, inspektor).
    const domyslniOdbiorcy = useMemo(
        () => [...new Set(
            ownersOfSelection(wybrane, branchOwners)
                .map((osoba) => emailWlasciciela(osoba, kontakty))
                .filter(Boolean),
        )],
        [wybrane, branchOwners, kontakty],
    );

    // Strony dokumentu. „Zamawiający" jest stały (nasza firma), „Wykonawca" zależy od tego,
    // czyje gałęzie wchodzą do TEGO protokołu — dlatego przelicza się razem z zaznaczeniem.
    const zamawiajacy = useMemo(() => stronaZamawiajacego(firmaNasza), [firmaNasza]);
    const wykonawca = useMemo(
        () => stronaWykonawcy(ownersOfSelection(wybrane, branchOwners), kontaktyZamowienia, dostawcy),
        [wybrane, branchOwners, kontaktyZamowienia, dostawcy],
    );

    // @anchor protokol-mail-tresc — standardowa treść maila z protokołem. Data bierze się
    // z pola „Data odbioru", podpis z profilu zalogowanego — nie z zapamiętanego w modalu
    // przedstawiciela Airtelu, bo wysyła ten, kto siedzi przy aplikacji, a protokół mógł
    // podpisać kto inny. Puste pola profilu nie zostawiają pustych wierszy w podpisie.
    const domyslnaTresc = useMemo(() => {
        // Podpis składany osobno i odfiltrowany z pustych: brak telefonu w profilu ma
        // zwinąć wiersz, a nie zostawić dziurę nad adresem strony.
        const podpis = [
            'Z Wyrazami Szacunku',
            [profil.firstName, profil.lastName].filter(Boolean).join(' '),
            profil.phone,
            'www.airtelservices.com.pl',
        ].filter(Boolean).join('\n');
        return 'Witam,\n'
            + `w załączniku przesyłam podpisany protokół odbioru prac zgodnie z zakresem wykonanym do ${pola.data}\n\n`
            + podpis;
    }, [pola.data, profil]);

    // @anchor protokol-pelna-wartosc — czy KAŻDA odbierana pozycja idzie za pełną pozostałą
    // kwotę. Liczy się wyłącznie zaznaczony zakres: protokół na dwa liście z pięciu, ale każdy
    // odebrany w całości, to odbiór całościowy tych dwóch pozycji — reszta gałęzi pójdzie
    // osobnym dokumentem. Liczy się KWOTA, a nie przełącznik „domknij": pozycja zamknięta na
    // kwotę niższą od oferty to nadal odbiór części wartości.
    const pelnaWartosc = useMemo(() => {
        if (!wybrane.length) return false;
        return wybrane.every((r) => kwotaOdbioru(r) >= pozostaloOf(r) - 0.005);
    }, [wybrane, kwotaOdbioru, pozostaloOf]);

    // @anchor protokol-auto-odbior — rodzaj odbioru to WARTOŚĆ DOMYŚLNA wyliczona z kwot:
    // wszystkie zaznaczone pozycje za pełną kwotę → „całościowy", cokolwiek niżej → „częściowy".
    // Podpowiedź, nie blokada — po ręcznym kliknięciu (`odbiorRecznie`) automat milczy, bo
    // o częściowości decyduje stan robót, a tego aplikacja nie wie. „Zakres nie odebrany"
    // to osobna oś i nie podlega wyliczeniu.
    useEffect(() => {
        if (!wybrane.length || pola.odbior === 'NIE_DOTYCZY' || pola.odbiorRecznie) return;
        // Zapis tylko przy realnej zmianie: `ustaw` składa nowy obiekt stanu, więc
        // bezwarunkowe wołanie przerysowywałoby modal po każdym przeliczeniu kwot.
        const rodzaj = pelnaWartosc ? 'CALOSCIOWY' : 'CZESCIOWY';
        if (pola.odbior !== rodzaj) ustaw('odbior', rodzaj);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [pelnaWartosc, wybrane.length, pola.odbior, pola.odbiorRecznie]);

    if (!open) return null;

    const przelacz = (id) => setZaznaczone((s) => {
        const n = new Set(s);
        if (n.has(id)) n.delete(id); else n.add(id);
        return n;
    });

    const przelaczGrupe = (g) => setZaznaczone((s) => {
        const n = new Set(s);
        const doWziecia = g.pozycje.filter((r) => !domknieteOf(r));
        const wszystkie = doWziecia.length > 0 && doWziecia.every((r) => n.has(r.node.id));
        for (const r of doWziecia) { if (wszystkie) n.delete(r.node.id); else n.add(r.node.id); }
        return n;
    });

    const dane = {
        numer: pola.numer,
        data: pola.data,
        umowa: pola.umowa,
        zamawiajacy,
        wykonawca,
        wartosci,
        suma,
        odbior: pola.odbior,
        wynik: pola.wynik,
        wady: pola.wady,
        protokolUsterkowy: pola.protokolUsterkowy,
        uwagi: [pola.uwagi, adnotacjaFinalna].filter(Boolean).join('\n\n'),
        zalaczniki: pola.zalaczniki,
        dataPodpisuAirtel: pola.dataPodpisuAirtel,
        dataPodpisuPodwykonawcy: pola.dataPodpisuPodwykonawcy,
        dataPodpisuInspektora: pola.dataPodpisuInspektora,
        przedstawicielAirtel: pola.przedstawicielAirtel,
        przedstawicielPodwykonawcy: pola.przedstawicielPodwykonawcy,
        inspektorNadzoru: pola.inspektorNadzoru,
        logoDataUrl: obrazki.logo,
        podpisDataUrl: obrazki.podpis,
    };

    const zapamietaj = () => PAMIETANE.forEach((k) => pamiec.zapisz(k, pola[k]));

    // @anchor protokol-po-eksporcie — odbiór trafia do rejestru DOPIERO gdy dokument
    // opuści aplikację (pobranie, mail albo OneDrive). Podgląd niczego nie odbiera, bo
    // wtedy każde zerknięcie na wydruk zamykałoby pozycje.
    //
    // `zapisanoOdbior` chroni przed podwójnym zapisem, gdy ten sam protokół idzie i na dysk,
    // i mailem; backend dodatkowo trzyma klucz `nodeId + numer` i robi upsert, więc nawet
    // przy wyścigu nie powstaną dwa wpisy na jeden numer.
    const poEksporcie = async () => {
        if (zapisanoOdbior) return;
        try {
            await zapiszOdbior(nodeId, {
                numer: pola.numer,
                data: pola.data,
                odbior: pola.odbior,
                pozycje: wybrane.map((r) => ({
                    wbsRootId: protokolRootOf(r.node),
                    nazwa: r.node.name,
                    wartosc: kwotaOdbioru(r),
                    pelny: pelnyOf(r),
                })),
            });
            setZapisanoOdbior(true);
            await odswiezRejestr();
        } catch (e) {
            // Plik już wyszedł — blokowanie eksportu nie ma sensu, ale użytkownik MUSI
            // wiedzieć, że kolejny protokół nie będzie znał tego odbioru.
            setStatusBlad(`Dokument wygenerowany, ale nie zapisano odbioru: ${e?.message || 'błąd zapisu'}`);
        }
    };

    // @anchor protokol-na-onedrive — „Generuj" od razu odkłada dokument w podpiętym folderze
    // zamówienia: `pliki_finansowe/<nazwa gałęzi>`. Protokół prawie zawsze ma tam trafić, więc
    // pytanie „co zrobić z plikiem?" było jednym kliknięciem za dużo; pobranie i mail zostają
    // pod osobnym przyciskiem.
    const naOneDrive = async () => {
        if (!oneDriveFolderName) { setStatusBlad('Zamówienie nie ma powiązanego folderu OneDrive'); return; }
        zapamietaj();
        setWysylka('Generuję dokument…');
        try {
            const art = await resolveArtifact(format === 'docx' ? await makeProtokolDocx(dane) : makeProtokolPdf(dane));
            setWysylka('Wgrywam na OneDrive…');
            const { webUrl } = await uploadToOneDrive({
                blob: art.blob, filename: art.filename, nodeId,
                category: 'finanse', subfolder: pola.podkatalog,
            });
            await poEksporcie();
            setWysylka(`Zapisano: ${oneDriveFolderName} → pliki_finansowe${pola.podkatalog ? ` → ${pola.podkatalog}` : ''}`);
            if (webUrl) setTimeout(() => window.open(webUrl, '_blank'), 400);
            setTimeout(() => { setWysylka(''); onClose(); }, 2000);
        } catch (e) {
            setStatusBlad(e?.message || 'Nie udało się zapisać protokołu na OneDrive');
            setWysylka('');
        }
    };

    // @anchor protokol-wycofaj — kasuje WPIS w rejestrze, nie plik. Dokument mógł już pójść
    // do klienta i to nie aplikacja decyduje o jego losie; pozycje wracają do puli do odbioru.
    const wycofaj = async (protokol) => {
        setDoWycofania(null);
        try {
            await usunProtokol(nodeId, protokol.id);
            await odswiezRejestr();
        } catch (e) {
            setStatusBlad(e?.message || 'Nie udało się wycofać protokołu');
        }
    };

    const doEksportu = () => { zapamietaj(); setEksportOtwarty(true); };
    const doPodgladu = () => { zapamietaj(); openProtokolPdf(dane); };

    const brakZaznaczenia = !wybrane.length;

    return (
        <>
            <div className="fixed inset-0 z-[130] bg-[#05070bcc] backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
                <div className="w-full max-w-3xl max-h-[92vh] flex flex-col rounded-2xl border border-white/10 bg-[#0b0f17] shadow-2xl" onClick={(e) => e.stopPropagation()}>

                    <div className="px-5 py-3 border-b border-white/10 flex items-center justify-between shrink-0">
                        <div className="flex items-center gap-2 min-w-0">
                            <FileText size={15} className="text-blue-400 shrink-0" />
                            <h3 className="text-sm font-bold uppercase tracking-[0.14em] text-white truncate">Protokół odbioru prac</h3>
                        </div>
                        <button onClick={onClose} className="p-2 rounded-lg border border-white/10 text-gray-300 hover:text-white hover:bg-white/10 transition-all"><X size={14} /></button>
                    </div>

                    <div className="p-5 overflow-y-auto custom-scrollbar flex flex-col gap-5">

                        {/* @anchor protokol-lista-wystawionych — historia odbiorów i bilans
                            kwotowy w JEDNEJ karcie: lista mówi „co odebrano", podsumowanie pod nią
                            „ile z tego wyszło" — rozdzielone czytały się jak dwie niezależne sekcje
                            o tej samej rzeczy. Lista zwija się, bilans zostaje zawsze widoczny, bo
                            to on odpowiada na pytanie zadawane przy każdym otwarciu modalu. */}
                        <div className="rounded-xl border border-white/10 bg-white/[0.03]">
                            {wystawione.length > 0 && (
                                <>
                                    <button
                                        onClick={() => setListaOtwarta((v) => !v)}
                                        className="w-full flex items-center gap-2 px-4 py-2.5 rounded-t-xl hover:bg-white/[0.04] transition-colors"
                                    >
                                        <History size={13} className="text-teal-400 shrink-0" />
                                        <span className="text-xs font-bold text-gray-200 flex-1 text-left">
                                            Wystawione protokoły ({wystawione.length})
                                        </span>
                                        <span className="text-[10px] uppercase tracking-wider text-gray-500">
                                            {listaOtwarta ? 'zwiń' : 'rozwiń'}
                                        </span>
                                    </button>

                                    {listaOtwarta && (
                                        <div className="border-t border-white/10 divide-y divide-white/5">
                                            {wystawione.map((pr) => {
                                                const suma = (pr.items || []).reduce((a, i) => a + (Number(i.wartosc) || 0), 0);
                                                const autor = pr.author
                                                    ? [pr.author.firstName, pr.author.lastName].filter(Boolean).join(' ') || pr.author.email
                                                    : '';
                                                return (
                                                    <div key={pr.id} className="px-3 py-2">
                                                        <div className="flex items-center gap-2">
                                                            <span className="text-xs text-gray-200 truncate flex-1" title={pr.numer}>{pr.numer}</span>
                                                            <span className="text-[11px] font-mono text-emerald-300 shrink-0">{fmtZlProtokol(suma)}</span>
                                                            <button
                                                                onClick={() => setDoWycofania(pr)}
                                                                title="Wycofaj wpis — pozycje wrócą do odbioru. Plik na OneDrive zostaje."
                                                                className="flex items-center gap-1 px-2 py-0.5 rounded border border-red-500/25 bg-red-500/10 text-red-300 text-[10px] font-bold uppercase tracking-wider hover:bg-red-500/20 transition-colors shrink-0"
                                                            >
                                                                <Undo2 size={11} /> cofnij
                                                            </button>
                                                        </div>
                                                        <div className="text-[10px] text-gray-500 mt-0.5">
                                                            {pr.data} · {pr.odbior === 'CALOSCIOWY' ? 'całościowy' : pr.odbior === 'CZESCIOWY' ? 'częściowy' : 'nie odebrany'}
                                                            {' · '}{(pr.items || []).length} poz.
                                                            {autor ? ` · ${autor}` : ''}
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}
                                </>
                            )}

                            {/* @anchor protokol-pasek-podsumowania — bilans kwotowy odbiorów:
                                plan całego widocznego zakresu, ile zabrały protokoły, ile zostaje
                                i ile bierze ten protokół. Stoi POD listą, bo czyta się jak jej
                                podsumowanie; widoczny także wtedy, gdy żadnego protokołu jeszcze
                                nie ma — wtedy odpowiada „nic nie odebrano, do wzięcia tyle". */}
                            <div className={`px-4 py-3 ${wystawione.length > 0 ? 'border-t border-white/10' : ''}`}>
                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                                    <div>
                                        <div className="text-[10px] uppercase tracking-wider text-gray-500">Wartość zakresu</div>
                                        <div className="text-sm font-mono font-bold text-gray-100">{fmtZlProtokol(podsumowanie.plan)}</div>
                                    </div>
                                    <div>
                                        <div className="text-[10px] uppercase tracking-wider text-gray-500">
                                            Odebrane{wystawione.length > 0 ? ` (${wystawione.length} prot.)` : ''}
                                        </div>
                                        <div className="text-sm font-mono font-bold text-emerald-300">{fmtZlProtokol(podsumowanie.odebrane)}</div>
                                    </div>
                                    <div>
                                        <div className="text-[10px] uppercase tracking-wider text-gray-500">Pozostało</div>
                                        <div className="text-sm font-mono font-bold text-amber-300">{fmtZlProtokol(podsumowanie.pozostalo)}</div>
                                    </div>
                                    <div>
                                        <div className="text-[10px] uppercase tracking-wider text-gray-500">W tym protokole</div>
                                        <div className="text-sm font-mono font-bold text-blue-300">{fmtZlProtokol(suma)}</div>
                                    </div>
                                </div>
                                <div className="mt-3 flex items-center gap-2">
                                    <div className="h-1.5 flex-1 rounded-full bg-white/10 overflow-hidden">
                                        <div className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-400 transition-all" style={{ width: `${podsumowanie.procent}%` }} />
                                    </div>
                                    <span className="text-[10px] font-mono text-gray-400 shrink-0">{podsumowanie.procent}% odebrane</span>
                                </div>
                            </div>
                        </div>

                        {/* ─ Zakres ─────────────────────────────────────────────── */}
                        <div>
                            <label className={ETYKIETA}>Zakres odbioru — zaznacz odbierane pozycje</label>
                            <div className="rounded-xl border border-white/10 divide-y divide-white/5">
                                {grupy.map((g) => {
                                    const doWziecia = g.pozycje.filter((r) => !domknieteOf(r));
                                    const wszystkie = doWziecia.length > 0 && doWziecia.every((r) => zaznaczone.has(r.node.id));
                                    const suma = g.pozycje
                                        .filter((r) => zaznaczone.has(r.node.id) && !domknieteOf(r))
                                        .reduce((s, r) => s + kwotaOdbioru(r), 0);
                                    return (
                                        <div key={g.nazwa}>
                                            <button
                                                onClick={() => przelaczGrupe(g)}
                                                className="w-full flex items-center gap-2 px-3 py-2 bg-white/[0.04] hover:bg-white/[0.07] text-left transition-colors"
                                            >
                                                {wszystkie ? <CheckSquare size={14} className="text-blue-400 shrink-0" /> : <Square size={14} className="text-gray-500 shrink-0" />}
                                                <span className="text-xs font-bold text-gray-200 truncate flex-1">
                                                    {g.nr ? `${g.nr}. ` : ''}{g.nazwa}
                                                </span>
                                                {suma > 0 && <span className="text-[11px] font-mono text-emerald-300 shrink-0">{fmtZlProtokol(suma)}</span>}
                                            </button>
                                            {g.pozycje.map((r) => {
                                                const root = protokolRootOf(r.node);
                                                const st = statusOdbioru[root];
                                                const domkniete = domknieteOf(r);
                                                const zazn = zaznaczone.has(r.node.id) && !domkniete;
                                                const plan = planValueOf(r.node, r.card);
                                                const zostaje = pozostaloOf(r);

                                                // @anchor protokol-pozycja-domknieta — pozycja odebrana
                                                // w całości: przekreślona i nieklikalna, w dymku numery
                                                // protokołów, które ją zamknęły. Zostaje na liście, bo
                                                // zniknięcie wyglądałoby jak usunięcie jej z zamówienia.
                                                // Bez wygaszania przezroczystością — samo przekreślenie
                                                // wystarczy za sygnał, a tekst zostaje czytelny.
                                                // Kwota to ODEBRANE, nie plan — przy odbiorze innym niż
                                                // oferta plan mówiłby o pozycji nieprawdę.
                                                if (domkniete) {
                                                    const numery = st?.protokoly?.map((pr) => pr.numer).join(', ') || '—';
                                                    const kwotaOdebrana = st?.odebrane ?? plan;
                                                    return (
                                                        <div
                                                            key={r.node.id}
                                                            title={`Odebrane w całości: ${numery} — ${fmtZlProtokol(st?.odebrane || 0)} z ${fmtZlProtokol(plan)}. `
                                                                + 'Pozycja nie wraca do kolejnego protokołu; żeby ją otworzyć, wycofaj protokół z listy powyżej.'}
                                                            className="w-full flex items-center gap-2 pl-8 pr-3 py-1.5 bg-white/[0.02] cursor-not-allowed"
                                                        >
                                                            <CheckSquare size={13} className="text-gray-400 shrink-0" />
                                                            <span className="text-xs text-gray-300 line-through truncate flex-1">{r.node.name}</span>
                                                            <span className="text-[10px] uppercase tracking-wider text-gray-400 shrink-0">odebrane</span>
                                                            <span className={`text-[11px] font-mono shrink-0 ${nadwyzkaOdbioru(kwotaOdebrana, plan) ? 'text-red-400 font-bold' : 'text-gray-300'}`}>
                                                                {fmtZlProtokol(kwotaOdebrana)}
                                                            </span>
                                                        </div>
                                                    );
                                                }

                                                return (
                                                    <div key={r.node.id}>
                                                        <button
                                                            onClick={() => przelacz(r.node.id)}
                                                            className="w-full flex items-center gap-2 pl-8 pr-3 py-1.5 hover:bg-white/[0.04] text-left transition-colors"
                                                        >
                                                            {zazn
                                                                ? <CheckSquare size={13} className="text-blue-400 shrink-0" />
                                                                : <Square size={13} className="text-gray-600 shrink-0" />}
                                                            <span className="text-xs text-gray-300 truncate flex-1">{r.node.name}</span>
                                                            {st?.odebrane > 0 && (
                                                                <span
                                                                    className={`text-[10px] shrink-0 ${nadwyzkaOdbioru(st.odebrane, plan) ? 'text-red-400 font-bold' : 'text-amber-400/80'}`}
                                                                    title="odebrane wcześniejszymi protokołami"
                                                                >
                                                                    odebrane {fmtZlProtokol(st.odebrane)} z {fmtZlProtokol(plan)}
                                                                </span>
                                                            )}
                                                            <span className="text-[11px] font-mono text-gray-500 shrink-0">{fmtZlProtokol(zostaje)}</span>
                                                        </button>

                                                        {/* @anchor protokol-kwota-input — kwota odbioru pozycji.
                                                            Domyślnie cała pozostała, obniżenie zostawia resztę
                                                            na kolejny protokół. Pokazuje się dopiero po zaznaczeniu,
                                                            żeby lista wyboru nie zmieniła się w formularz. */}
                                                        {zazn && (() => {
                                                            // @anchor protokol-kwota-zablokowana — kwota zablokowana, dopóki
                                                            // pozycja idzie w całości. Domyślnie odbieramy cały zakres, więc pole
                                                            // stoi na pełnej kwocie i nie da się go tknąć przypadkiem; droga do
                                                            // odbioru częściowego wiedzie przez „Odblokuj pozycję". Stan pola idzie
                                                            // dokładnie za tym, co pokazuje przycisk — patrz `protokol-blokada-kwoty`.
                                                            const zablokowana = kwotaZablokowanaOf(r);
                                                            const nizszaKwota = !pelnaKwotaOf(r);
                                                            return (
                                                            <div className="flex items-center gap-2 pl-[3.25rem] pr-3 pb-1.5">
                                                                <span className="text-[10px] uppercase tracking-wider text-gray-500">Odbieram</span>
                                                                <input
                                                                    type="number"
                                                                    step="0.01"
                                                                    min="0"
                                                                    max={zostaje}
                                                                    value={kwotyReczne[root] ?? zostaje}
                                                                    onChange={(e) => setKwotyReczne((k) => ({ ...k, [root]: e.target.value }))}
                                                                    onFocus={(e) => e.target.select()}
                                                                    disabled={zablokowana}
                                                                    title={zablokowana
                                                                        ? 'Odbierasz całą pozycję — kliknij „Odblokuj pozycję", żeby odebrać tylko część kwoty'
                                                                        : undefined}
                                                                    className={`w-32 rounded px-2 py-0.5 text-xs font-mono text-right focus:outline-none ${
                                                                        zablokowana
                                                                            ? 'bg-black/20 border border-white/5 text-gray-400 cursor-not-allowed'
                                                                            : 'bg-black/40 border border-white/10 text-white focus:border-blue-500'
                                                                    }`}
                                                                />
                                                                <span className="text-[10px] text-gray-500">z {fmtZlProtokol(zostaje)}</span>

                                                                {/* @anchor protokol-blokada-kwoty — przycisk mówi, CO ZROBI po kliknięciu,
                                                                    a nie w jakim stanie jest pole: domyślnie odbieramy całą pozycję, więc
                                                                    kwota stoi zablokowana i przycisk oferuje „Odblokuj pozycję". Odblokowana
                                                                    kwota (pomarańcz) to stan wyjątkowy — odbiór częściowy — i przycisk wraca
                                                                    z „Zablokuj pozycję". Poprzednia wersja („Zamknij pozycję" na zielono przy
                                                                    zablokowanym polu) czytała się jak polecenie zamknięcia czegoś, co już
                                                                    było zamknięte. */}
                                                                <button
                                                                    onClick={() => {
                                                                        if (zablokowana) { setOdblokowaneKwoty((d) => ({ ...d, [root]: true })); return; }
                                                                        // Powrót do odbioru CAŁEJ pozycji musi też skasować wpisaną kwotę —
                                                                        // inaczej pole pokazywało obniżoną liczbę i zamykało na niej odbiór,
                                                                        // wbrew własnemu podpisowi „wróć do odbioru całej pozycji".
                                                                        setKwotyReczne((k) => { const n = { ...k }; delete n[root]; return n; });
                                                                        setDomknieciaCzesciowe((d) => { const n = { ...d }; delete n[root]; return n; });
                                                                        setOdblokowaneKwoty((d) => ({ ...d, [root]: false }));
                                                                    }}
                                                                    title={zablokowana
                                                                        ? 'Odbierasz całą pozycję — kliknij, żeby odblokować kwotę i odebrać tylko część'
                                                                        : 'Kwota odblokowana — kliknij, żeby wrócić do odbioru całej pozycji'}
                                                                    className={`flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border transition-all ${
                                                                        zablokowana
                                                                            ? 'bg-white/5 border-white/10 text-gray-400 hover:bg-white/10'
                                                                            : 'bg-orange-500/20 border-orange-500/50 text-orange-300 hover:bg-orange-500/30'
                                                                    }`}
                                                                >
                                                                    {zablokowana
                                                                        ? <><Unlock size={11} /> Odblokuj pozycję</>
                                                                        : <><Lock size={11} /> Zablokuj pozycję</>}
                                                                </button>

                                                                {/* @anchor protokol-domknij-nizsza — jedyna droga do zamknięcia pozycji
                                                                    na kwocie NIŻSZEJ niż pozostała (rabat, korekta zakresu). Osobno od
                                                                    blokady pola i domyślnie wyłączone: odbiór części kwoty prawie zawsze
                                                                    znaczy „reszta przyjdzie kolejnym protokołem", a ciche domknięcie
                                                                    kasowało tę resztę bez pytania. */}
                                                                {nizszaKwota && (
                                                                    <button
                                                                        onClick={() => setDomknieciaCzesciowe((d) => ({ ...d, [root]: !d[root] }))}
                                                                        title={domknieciaCzesciowe[root]
                                                                            ? 'Pozycja zostanie zamknięta na tej kwocie — reszta NIE wróci do kolejnego protokołu'
                                                                            : 'Reszta kwoty zostaje do odbioru kolejnym protokołem — kliknij, jeśli pozycja ma być zamknięta mimo niższej kwoty'}
                                                                        className={`flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border transition-all ${
                                                                            domknieciaCzesciowe[root]
                                                                                ? 'bg-red-500/20 border-red-500/50 text-red-300 hover:bg-red-500/30'
                                                                                : 'bg-white/5 border-white/10 text-gray-400 hover:bg-white/10'
                                                                        }`}
                                                                    >
                                                                        {domknieciaCzesciowe[root]
                                                                            ? <><CheckSquare size={11} /> Domykam na tej kwocie</>
                                                                            : <><Square size={11} /> Domknij mimo niższej kwoty</>}
                                                                    </button>
                                                                )}

                                                                {/* @anchor protokol-roznica-kwoty — różnica wobec oferty przy KAŻDEJ kwocie
                                                                    innej niż ofertowa, nie tylko przy domkniętej pozycji. Dopisek mówi, co się
                                                                    z różnicą dzieje: wraca do puli (pozycja otwarta) czy przepada (domknięta). */}
                                                                {Math.abs(kwotaOdbioru(r) - zostaje) > 0.005 && (
                                                                    <span className={`text-[10px] ${kwotaOdbioru(r) > zostaje ? 'text-red-400 font-bold' : 'text-amber-400/80'}`}>
                                                                        {kwotaOdbioru(r) > zostaje
                                                                            ? `ponad ofertę o ${fmtZlProtokol(kwotaOdbioru(r) - zostaje)}`
                                                                            : `poniżej oferty o ${fmtZlProtokol(zostaje - kwotaOdbioru(r))}`
                                                                                + (pelnyOf(r) ? ' — pozycja domknięta' : ' — zostanie do odbioru')}
                                                                    </span>
                                                                )}
                                                            </div>
                                                            );
                                                        })()}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    );
                                })}
                                {!grupy.length && <div className="px-3 py-4 text-xs text-gray-500 text-center">Brak pozycji w widoku.</div>}
                            </div>
                            <div className="flex items-center justify-between mt-2 px-1">
                                <span className="text-[11px] text-gray-500">
                                    {wybrane.length} z {rows.filter((r) => !domknieteOf(r)).length} pozycji do odbioru
                                </span>
                                <span className="text-sm font-bold text-emerald-300">{fmtZlProtokol(suma)}</span>
                            </div>
                        </div>

                        {/* ─ Nagłówek protokołu ─────────────────────────────────── */}
                        <div className="grid grid-cols-3 gap-3">
                            <div className="col-span-2">
                                <label className={ETYKIETA}>Numer protokołu</label>
                                <input
                                    value={pola.numer}
                                    onChange={(e) => { setNumerRecznie(true); ustaw('numer', e.target.value); }}
                                    className={POLE}
                                />
                            </div>
                            <div>
                                <label className={ETYKIETA}>Data</label>
                                <PoleDaty value={pola.data} onChange={(v) => ustaw('data', v)} />
                            </div>
                        </div>

                        <div>
                            <label className={ETYKIETA}>Dotyczy Umowy nr. / Agreement</label>
                            <AutoResizeTextarea
                                value={pola.umowa}
                                onChange={(e) => ustaw('umowa', e.target.value)}
                                placeholder="np. Oferta z dnia 15.05.2026"
                                className={POLE}
                            />
                        </div>

                        {/* ─ Rodzaj odbioru ─────────────────────────────────────── */}
                        <div>
                            <label className={ETYKIETA}>Rodzaj odbioru</label>
                            <div className="flex gap-2">
                                {[
                                    ['CALOSCIOWY', 'Całościowy', 'Całościowy odbiór pozycji'],
                                    ['CZESCIOWY', 'Częściowy', 'Częściowy odbiór pozycji'],
                                    ['NIE_DOTYCZY', 'Nie odebrany', 'Zakres nie odebrany z uwagi na wady/braki'],
                                ].map(([k, l, tytul]) => {
                                    // Żaden rodzaj nie jest blokowany — patrz `protokol-auto-odbior`.
                                    // Automat podpowiada wartość domyślną z kwot, użytkownik może ją
                                    // nadpisać; przy rozjeździe z kwotami dokładamy ostrzeżenie w tooltipie.
                                    const niespojny = k === 'CALOSCIOWY' && wybrane.length > 0 && !pelnaWartosc;
                                    return (
                                    <button
                                        key={k}
                                        title={niespojny
                                            ? 'Uwaga: odbierana kwota jest niższa od oferty — zwykle to odbiór częściowy'
                                            : tytul}
                                        // Wybór „nie odebrany" przestawia też wynik na negatywny — dokument
                                        // z nieodebranym zakresem i pozytywnym wynikiem przeczyłby sam sobie.
                                        // Sam wynik zostaje edytowalny, więc to podpowiedź, nie blokada.
                                        onClick={() => {
                                            ustaw('odbiorRecznie', true);
                                            ustaw('odbior', k);
                                            ustaw('wynik', k === 'NIE_DOTYCZY' ? 'NEGATYWNY' : 'POZYTYWNY');
                                        }}
                                        className={`flex-1 px-3 py-2 rounded-lg text-xs font-bold border transition-all ${
                                            pola.odbior === k
                                                ? (niespojny
                                                    ? 'bg-amber-500/15 border-amber-500/40 text-amber-200'
                                                    : 'bg-blue-500/15 border-blue-500/40 text-blue-200')
                                                : 'bg-white/5 border-white/10 text-gray-400 hover:bg-white/10'
                                        }`}
                                    >{l}</button>
                                    );
                                })}
                            </div>
                        </div>

                        {/* ─ Wynik odbioru ──────────────────────────────────────── */}
                        <div>
                            <label className={ETYKIETA}>Wynik odbioru</label>
                            <div className="flex gap-2">
                                {[
                                    ['POZYTYWNY', 'Pozytywny'],
                                    ['NEGATYWNY', 'Negatywny'],
                                ].map(([k, l]) => (
                                    <button
                                        key={k}
                                        onClick={() => ustaw('wynik', k)}
                                        className={`flex-1 px-3 py-2 rounded-lg text-xs font-bold border transition-all ${
                                            pola.wynik === k
                                                ? (k === 'NEGATYWNY'
                                                    ? 'bg-rose-500/15 border-rose-500/40 text-rose-200'
                                                    : 'bg-emerald-500/15 border-emerald-500/40 text-emerald-200')
                                                : 'bg-white/5 border-white/10 text-gray-400 hover:bg-white/10'
                                        }`}
                                    >{l}</button>
                                ))}
                            </div>
                        </div>

                        {/* ─ Wady i usterki ─────────────────────────────────────── */}
                        <div>
                            <label className={ETYKIETA}>Wady i usterki przedmiotu odbioru</label>
                            <AutoResizeTextarea
                                value={pola.wady}
                                onChange={(e) => ustaw('wady', e.target.value)}
                                placeholder="Puste = brak wad. Jeżeli dotyczy — wpisz też datę usunięcia."
                                className={POLE}
                            />
                            <div className="flex items-center gap-2 mt-2">
                                <span className="text-[11px] text-gray-400 flex-1">Listę wad zestawiono w protokole usterkowym</span>
                                {[[true, 'Tak'], [false, 'Nie'], [null, '—']].map(([v, l]) => (
                                    <button
                                        key={String(v)}
                                        onClick={() => ustaw('protokolUsterkowy', v)}
                                        className={`px-3 py-1 rounded-lg text-[11px] font-bold border transition-all ${
                                            pola.protokolUsterkowy === v
                                                ? 'bg-blue-500/15 border-blue-500/40 text-blue-200'
                                                : 'bg-white/5 border-white/10 text-gray-400 hover:bg-white/10'
                                        }`}
                                    >{l}</button>
                                ))}
                            </div>
                        </div>

                        <div>
                            <label className={ETYKIETA}>Inne uwagi</label>
                            <AutoResizeTextarea value={pola.uwagi} onChange={(e) => ustaw('uwagi', e.target.value)} className={POLE} />
                            {(adnotacjaRoznic || adnotacjaReczna !== null) && (
                                <div className="mt-2 rounded-lg border border-amber-500/25 bg-amber-500/5 px-3 py-2">
                                    <div className="flex items-center gap-2 mb-1">
                                        <div className="text-[10px] font-bold uppercase tracking-widest text-amber-400/80 flex-1">
                                            Doklei się do uwag w dokumencie
                                        </div>
                                        {adnotacjaReczna !== null && (
                                            <button
                                                onClick={() => setAdnotacjaReczna(null)}
                                                className="px-2 py-0.5 rounded-md text-[10px] font-bold border border-amber-500/30 text-amber-300 hover:bg-amber-500/10 transition-all"
                                                title="Wróć do treści wyliczonej z kwot"
                                            >Przywróć wyliczoną</button>
                                        )}
                                    </div>
                                    <AutoResizeTextarea
                                        value={adnotacjaFinalna}
                                        onChange={(e) => setAdnotacjaReczna(e.target.value)}
                                        className="w-full bg-black/20 border border-amber-500/20 rounded-md px-2 py-1 text-[11px] text-amber-200/90 outline-none focus:border-amber-500/50"
                                    />
                                </div>
                            )}
                        </div>

                        <div>
                            <label className={ETYKIETA}>Lista załączników do protokołu</label>
                            <AutoResizeTextarea
                                value={pola.zalaczniki}
                                onChange={(e) => ustaw('zalaczniki', e.target.value)}
                                placeholder="np. karty katalogowe, certyfikaty, zdjęcia z montażu"
                                className={POLE}
                            />
                        </div>

                        {/* ─ Podpisy ────────────────────────────────────────────── */}
                        {/* @anchor protokol-signature-fields — nazwisko i data podpisu stoją
                            w jednej kolumnie na uczestnika. Każda strona podpisuje się kiedy
                            indziej (podwykonawca na budowie, Airtel po weryfikacji, inspektor
                            jeszcze później), więc jedna wspólna data zmuszałaby do wpisania
                            nieprawdy — stąd trzy osobne pola zamiast jednego. */}
                        <div className="grid grid-cols-3 gap-3">
                            {[
                                ['Przedstawiciel Airtel', 'przedstawicielAirtel', 'dataPodpisuAirtel'],
                                ['Przedstawiciel Podwykonawcy', 'przedstawicielPodwykonawcy', 'dataPodpisuPodwykonawcy'],
                                ['Inspektor nadzoru', 'inspektorNadzoru', 'dataPodpisuInspektora'],
                            ].map(([etykieta, kluczOsoby, kluczDaty]) => (
                                <div key={kluczOsoby} className="flex flex-col gap-2">
                                    <div>
                                        <label className={ETYKIETA}>{etykieta}</label>
                                        <AutoResizeTextarea
                                            value={pola[kluczOsoby]}
                                            onChange={(e) => {
                                                if (kluczOsoby === 'przedstawicielPodwykonawcy') setPodwykonawcaRecznie(true);
                                                ustaw(kluczOsoby, e.target.value);
                                            }}
                                            className={POLE}
                                        />
                                    </div>
                                    <div>
                                        <label className={ETYKIETA}>Data podpisu</label>
                                        <PoleDaty value={pola[kluczDaty]} onChange={(v) => ustaw(kluczDaty, v)} />
                                    </div>
                                </div>
                            ))}
                        </div>

                        <div>
                            <label className={ETYKIETA}>Podkatalog OneDrive (pliki_finansowe/…)</label>
                            <input
                                value={pola.podkatalog}
                                onChange={(e) => { ustaw('podkatalogRecznie', true); ustaw('podkatalog', e.target.value); }}
                                placeholder="nazwa gałęzi"
                                className={POLE}
                            />
                        </div>

                        {statusBlad && (
                            <p className="text-xs text-amber-300 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2">
                                {statusBlad}
                            </p>
                        )}

                        {obrazki.podpis && (
                            <p className="text-[10px] text-gray-500 -mt-2">
                                Skan podpisu przedstawiciela Airtel wchodzi do dokumentu automatycznie. Pozostałe podpisy zbierane odręcznie po wydruku.
                            </p>
                        )}
                    </div>

                    {/* ─ Stopka ─────────────────────────────────────────────────── */}
                    <div className="px-5 py-3 border-t border-white/10 flex items-center gap-2 shrink-0">
                        <div className="flex rounded-lg border border-white/10 overflow-hidden">
                            {['pdf', 'docx'].map((f) => (
                                <button
                                    key={f}
                                    onClick={() => setFormat(f)}
                                    className={`px-3 py-2 text-xs font-bold uppercase transition-all ${
                                        format === f ? 'bg-blue-500/20 text-blue-200' : 'bg-white/5 text-gray-400 hover:bg-white/10'
                                    }`}
                                >{f}</button>
                            ))}
                        </div>
                        <div className="flex-1" />
                        <button
                            onClick={doPodgladu}
                            disabled={brakZaznaczenia}
                            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold bg-white/5 border border-white/10 text-gray-100 hover:bg-white/10 disabled:opacity-40 transition-all"
                        >
                            <Eye size={15} /> Podgląd
                        </button>
                        <button
                            onClick={doEksportu}
                            disabled={brakZaznaczenia || !!wysylka}
                            title="Pobierz na urządzenie albo wyślij mailem"
                            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold bg-white/5 border border-white/10 text-gray-100 hover:bg-white/10 disabled:opacity-40 transition-all"
                        >
                            <Download size={15} /> Pobierz / wyślij
                        </button>
                        <button
                            onClick={naOneDrive}
                            disabled={brakZaznaczenia || !!wysylka || !oneDriveFolderName}
                            title={oneDriveFolderName
                                ? `Zapisze w: ${oneDriveFolderName} → pliki_finansowe${pola.podkatalog ? ` → ${pola.podkatalog}` : ''}`
                                : 'Zamówienie nie ma powiązanego folderu OneDrive'}
                            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 text-white disabled:opacity-40 transition-all"
                        >
                            {wysylka ? <Loader2 size={15} className="animate-spin" /> : <Cloud size={15} />}
                            {wysylka || 'Generuj na OneDrive'}
                        </button>
                    </div>
                </div>
            </div>

            {/* @anchor protokol-wycofaj-potwierdzenie — własny modal, nie `window.confirm`:
                przeglądarka nie daje zmienić etykiet OK/Anuluj na TAK/NIE. */}
            {doWycofania && (
                <div className="fixed inset-0 z-[150] bg-[#05070bcc] backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setDoWycofania(null)}>
                    <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-[#0b0f17] shadow-2xl" onClick={(e) => e.stopPropagation()}>
                        <div className="px-5 pt-5 pb-3">
                            <h4 className="text-sm font-bold text-white mb-2">Wycofać protokół?</h4>
                            <p className="text-xs text-gray-400 mb-2 break-words">{doWycofania.numer}</p>
                            <p className="text-[11px] text-gray-500">
                                Pozycje z tego protokołu wrócą do puli do odbioru. Plik zapisany na OneDrive
                                <span className="text-gray-300"> zostaje</span> — kasujemy tylko wpis w rejestrze.
                            </p>
                        </div>
                        <div className="px-5 pb-5 flex gap-3">
                            <button
                                onClick={() => wycofaj(doWycofania)}
                                className="flex-1 px-4 py-2.5 rounded-xl text-sm font-bold bg-red-500/15 border border-red-500/30 text-red-200 hover:bg-red-500/25 transition-all"
                            >Tak, wycofaj</button>
                            <button
                                onClick={() => setDoWycofania(null)}
                                className="flex-1 px-4 py-2.5 rounded-xl text-sm font-bold bg-white/5 border border-white/10 text-gray-300 hover:bg-white/10 transition-all"
                            >Nie</button>
                        </div>
                    </div>
                </div>
            )}

            <ExportChoiceModal
                open={eksportOtwarty}
                onClose={() => setEksportOtwarty(false)}
                title={`Protokół odbioru (${format.toUpperCase()})`}
                defaultFilename={protokolFilename(pola.numer, format)}
                nodeId={nodeId}
                makeArtifact={() => (format === 'docx' ? makeProtokolDocx(dane) : makeProtokolPdf(dane))}
                oneDriveFolderName={oneDriveFolderName}
                oneDriveCategory="finanse"
                oneDriveSubfolder={pola.podkatalog}
                onExported={poEksporcie}
                defaultTo={domyslniOdbiorcy}
                defaultCc={dakOdbiorcy}
                defaultSubject={pola.numer}
                defaultMessage={domyslnaTresc}
            />
        </>
    );
}
