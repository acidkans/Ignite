// Sprawdza, czy wysokości scalonych wierszy w arkuszu „Podsumowanie" faktycznie mieszczą tekst.
// Excel nie auto-dopasowuje wysokości wiersza ze scaloną komórką, więc wysokość liczy
// `wysokosc()` w RealizationTab.jsx — ten test symuluje łamanie po słowach na realnej
// szerokości scalenia i porównuje potrzebne linie z tymi, które przewidział wzór.

const ZNAKI_A_F = 105;   // wzór z komponentu
const ZNAKI_B_F = 68;
const SZER_A_F = 130;    // realna szerokość scalenia w jednostkach Excela (= znakach Calibri 11)
const SZER_B_F = 86;
const wysokosc = (tekst, znaki) => Math.max(1, Math.ceil(String(tekst).length / znaki)) * 15 + 4;

// Łamanie po słowach na zadanej szerokości — tak jak robi to Excel przy `wrapText`.
const policzLinie = (tekst, szer) => {
    let linie = 1, dlugosc = 0;
    for (const slowo of String(tekst).split(' ')) {
        const potrzeba = dlugosc === 0 ? slowo.length : dlugosc + 1 + slowo.length;
        if (potrzeba <= szer) { dlugosc = potrzeba; continue; }
        linie += 1;
        dlugosc = slowo.length;
        while (dlugosc > szer) { linie += 1; dlugosc -= szer; } // słowo dłuższe niż wiersz
    }
    return linie;
};

const fmtZl = v => Number(v).toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const zl = v => `${fmtZl(v)} zł`;
const pct = (a, b) => `${(a / b * 100).toLocaleString('pl-PL', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;

// Najdłuższe realne zdania z sekcji „Analiza" — kwoty 9-cyfrowe, żeby złapać górny przypadek.
const zdania = [
    `Wycena zamówienia to ${zl(407329.68)}, a na zakupy i wykonanie zadań poszło dotąd ${zl(6216)} — zrealizowano ${pct(6216, 407329.68)} budżetu ofertowego, do wykorzystania zostaje ${zl(401113.68)}.`,
    `Wycena zamówienia to ${zl(123456789.12)}, a na zakupy i wykonanie zadań poszło dotąd ${zl(98765432.1)} — budżet ofertowy jest wyczerpany i przekroczony o ${zl(87654321.99)}, co daje ${pct(3, 2)} wyceny.`,
    `Żadna z 214 pozycji w widoku nie ma jeszcze wpisu zakupu ani wykonania, więc nie da się jeszcze powiedzieć, czy kupujemy taniej, czy drożej niż zakładała wycena.`,
    `Realizacja ruszyła na 80 z 214 pozycji (37,4%); w wycenie odpowiadały one za ${zl(12892)}, czyli 3,2% całego budżetu.`,
    `Na tych pozycjach wydano ${zl(6216)} przy planie ${zl(12892)} — jesteśmy do przodu o ${zl(6676)}, czyli kupujemy 51,8% poniżej wyceny.`,
    `Na tych pozycjach wydano ${zl(98765432.1)} przy planie ${zl(87654321)} — wydajemy o ${zl(11111111.1)} więcej, niż zakładano, czyli 12,7% powyżej wyceny.`,
    `Poniżej wyceny: 124 pozycje na łączną oszczędność ${zl(6676)}. Powyżej wyceny: 37 pozycji na łączne przekroczenie ${zl(1234.5)}. Dokładnie w planie: 12 pozycji.`,
    `Poniżej wyceny: 124 pozycje na łączną oszczędność ${zl(98765432.1)}. Powyżej wyceny: 137 pozycji na łączne przekroczenie ${zl(12345678.9)}. Dokładnie w planie: 12 pozycji.`,
    `Ruszone pozycje nie miały w wycenie żadnej kwoty, więc całe ${zl(98765432.1)} to koszt ponad plan.`,
    `Próba jest jednak mała: ruszone pozycje to dopiero 2,0% wartości wyceny, więc prognozę traktuj orientacyjnie — o rzeczywistym wyniku zamówienia zdecydują pozycje jeszcze nietknięte.`,
    // nota pod tabelą „Prognoza wydatków" — też scalona A:F
    `Wykonanie poniżej 10% budżetu rodzaju — prognoza trzymana na 100% wyceny: Materiał, Sprzęt, Praca, Usługa, Nocleg, Paliwo.`,
];

// Wartości wierszy opisowych (scalenie B:F)
const opisowe = [
    'cały zakres zamówienia',
    'część zakresu — rodzaje kosztów: Materiał, Sprzęt',
    'część zakresu — rodzaje kosztów: Materiał, Sprzęt, Praca, Usługa, Nocleg, Paliwo',
    'Budowa hali produkcyjnej wraz z zapleczem socjalnym i infrastrukturą towarzyszącą — etap II, Gliwice',
    'Nazwa: pompa; Dostawca: PPHU Instalacje Sanitarne i Grzewcze Kowalski sp. z o.o.; Typ: Materiał',
];

const bledy = [];
const sprawdzWiersz = (etykieta, tekst, znaki, szer) => {
    const trzeba = policzLinie(tekst, szer);
    const dane = Math.round((wysokosc(tekst, znaki) - 4) / 15);
    const ok = dane >= trzeba;
    if (!ok) bledy.push(`${etykieta}\n   tekst (${tekst.length} zn.): ${tekst}\n   potrzeba linii: ${trzeba}, wzór daje: ${dane}`);
    console.log(`${ok ? 'OK  ' : 'BŁĄD'} ${etykieta} — ${tekst.length} zn., potrzeba ${trzeba} lin., wzór daje ${dane} (h=${wysokosc(tekst, znaki)})`);
};

console.log('── sekcja „Analiza" (scalenie A:F) ──');
zdania.forEach((z, i) => sprawdzWiersz(`zdanie ${i + 1}`, z, ZNAKI_A_F, SZER_A_F));

console.log('\n── wiersze opisowe (scalenie B:F) ──');
opisowe.forEach((t, i) => sprawdzWiersz(`opis ${i + 1}`, t, ZNAKI_B_F, SZER_B_F));

console.log(bledy.length ? `\n✗ Tekst nie zmieści się w ${bledy.length} wierszach:\n\n${bledy.join('\n\n')}` : '\n✓ Każdy wiersz mieści swój tekst');
process.exit(bledy.length ? 1 : 0);
