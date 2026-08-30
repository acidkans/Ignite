// @anchor acceptance-protocol-dto
// Kształt protokołu odbioru prac — jeden i ten sam obiekt zasila DOCX (backend, biblioteka
// `docx`) i PDF (front, `buildProtokolHtml` + `/pdf/render`). Trzymamy go w JEDNYM miejscu,
// bo dwa wyjścia rozjeżdżają się natychmiast, gdy każde ma własną listę pól.
//
// Nazwy pól po polsku — to odwzorowanie formularza Airtela („protokół odbioru technicznego.docx"),
// a nie encja domenowa; tłumaczenie ich na angielski tylko utrudniłoby porównanie z wzorem.

export type OdbiorRodzaj = 'CALOSCIOWY' | 'CZESCIOWY' | 'NIE_DOTYCZY';

// @anchor acceptance-protocol-result
// Wynik odbioru — osobna oś od RODZAJU odbioru: „częściowy" mówi ILE odebrano, „pozytywny"
// mówi JAK. Odbiór częściowy bywa pozytywny, a całościowy zakres da się zakwestionować,
// więc jedno pole nie zastąpi drugiego.
export type OdbiorWynik = 'POZYTYWNY' | 'NEGATYWNY';

// @anchor acceptance-protocol-party-dto
// Strona protokołu — „Zamawiający" (Airtel Services, z singletona `Company`) albo „Wykonawca"
// (firma odpowiedzialna za odbierany zakres, z rejestru `Supplier` po NIP-ie kontaktu
// zamówienia). Trzy pola, bo tyle identyfikuje firmę w dokumencie podpisywanym przez obie
// strony; puste wartości drukują się jako „—", a nie znikają — brak danych ma być widoczny.
export interface ProtokolStronaDto {
    nazwa: string;
    adres: string;
    nip: string;
}

// @anchor acceptance-protocol-value-row-dto
// Grupa tabeli „Opis i wartość odbieranego zakresu": gałąź z podsumą, a pod nią POJEDYNCZE
// LIŚCIE z własnymi kwotami. Wzór miał tylko podsumy gałęzi (5100 + 1900 = 7000), ale sama
// podsuma nie mówi odbierającemu, za co dokładnie płaci — a to on podpisuje się pod kwotą.
// Ta tabela jest JEDYNYM opisem zakresu w protokole: osobny punkt „Opis zakresu robót"
// wymieniał te same pozycje bez kwot, więc został zwinięty tutaj.
export interface ProtokolWartoscDto {
    zakres: string;
    wartosc: number;
    pozycje?: { nazwa: string; wartosc: number }[];
}

// @anchor acceptance-protocol-payload-dto
export interface ProtokolOdbioruDto {
    numer: string;
    data: string; // DD.MM.RRRR — format formularza, nie ISO
    umowa: string; // „Dotyczy Umowy nr. / Agreement" — wolne pole, w bazie nie ma na to miejsca

    zamawiajacy: ProtokolStronaDto;
    wykonawca: ProtokolStronaDto;

    wartosci: ProtokolWartoscDto[];
    suma: number;

    odbior: OdbiorRodzaj;
    wynik: OdbiorWynik;
    wady: string;
    protokolUsterkowy: boolean | null; // null = żadne z pól Tak/Nie nie zaznaczone
    uwagi: string;
    zalaczniki: string;

    // @anchor acceptance-protocol-signature-dates
    // Data podpisu OSOBNO dla każdej strony — wzór miał jedną wspólną, ale w praktyce
    // podwykonawca podpisuje na budowie, przedstawiciel Airtela po weryfikacji, a inspektor
    // nadzoru jeszcze później. Jedna data zmuszałaby do wpisania nieprawdy któremuś z nich.
    dataPodpisuAirtel: string;
    dataPodpisuPodwykonawcy: string;
    dataPodpisuInspektora: string;
    przedstawicielAirtel: string;
    przedstawicielPodwykonawcy: string;
    inspektorNadzoru: string;

    logoDataUrl?: string;
    podpisDataUrl?: string; // skan podpisu przedstawiciela Airtel — patrz `acceptance-protocol-signature`
}

// @anchor acceptance-protocol-record-dto
// Zapis wystawionego protokołu. Leci osobnym żądaniem od generowania pliku, bo powstaje
// dopiero gdy dokument OPUŚCI aplikację — podgląd niczego nie odbiera.
export interface ZapisProtokoluDto {
    numer: string;
    data: string;
    odbior: OdbiorRodzaj;
    pozycje: { wbsRootId: string; nazwa: string; wartosc: number; pelny: boolean }[];
}

// @anchor acceptance-protocol-status-dto
// Stan odbioru pozycji zamówienia — po nim modal wie, co wyszarzyć, a ile zostało
// do odebrania w kolejnym protokole.
export interface StatusOdbioruDto {
    wbsRootId: string;
    odebrane: number;
    domkniete: boolean;
    protokoly: { numer: string; data: string; wartosc: number; pelny: boolean }[];
}
