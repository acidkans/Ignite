import { useSyncExternalStore } from 'react';

// @anchor cel-realizacji — węzeł WBS, który Realizacja ma otworzyć w Kokpicie po kliknięciu powiadomienia
// z czatu/maila gałęzi (dzwonek albo push). Trzyma KLUCZ węzła (`wbsRootOf` = `sourceWbsNodeId ?? id`),
// bo powiadomienie mogło przyjść z innej wersji niż baseline Realizacji.
// Cel żyje krótko (`CEL_WAZNY_MS`): panel Realizacji montuje się po zmianie zamówienia czasem dwa razy
// (najpierw bez wersji, potem z baseline), więc każdy montaż w tym oknie zastosuje go raz; później cel
// wygasa i powrót na zakładkę nie przerzuca już na pozycję z powiadomienia.
const CEL_WAZNY_MS = 30000;

let cel = null; // { orderId, klucz, watek, t }
const sluchacze = new Set();

// @anchor watek-z-powiadomienia — filtr wątku, pod którym widać wiadomość z powiadomienia (tytuły
// z `comments.controller` / `watek-mail-replies-powiadom`): odpowiedź na pytanie wisi pod wpisem Q&A
// (`watek-odpowiedzi-qa`), odpowiedź mailem w rozmowie mailowej, reszta to czat.
export function watekZPowiadomienia(tytul) {
    const t = String(tytul || '');
    if (t.includes('— odpowiedź mailem „')) return 'mail';
    if (t.includes('— odpowiedź na pytanie „')) return 'qa';
    return 'chat';
}

// @anchor ustaw-cel-realizacji — `watek` = filtr wątku (klucz `WATEK_RODZAJE`) ustawiony od razu po otwarciu.
export function ustawCelRealizacji(orderId, klucz, watek = 'chat') {
    if (!orderId || !klucz) return;
    cel = { orderId: String(orderId), klucz: String(klucz), watek: watek || 'chat', t: Date.now() };
    sluchacze.forEach(f => f());
}

const subskrybuj = (f) => { sluchacze.add(f); return () => sluchacze.delete(f); };

// @anchor use-cel-realizacji — aktualny cel dla zamówienia `orderId` albo null (inny / wygasły).
export function useCelRealizacji(orderId) {
    const c = useSyncExternalStore(subskrybuj, () => cel);
    if (!c || c.orderId !== String(orderId) || Date.now() - c.t > CEL_WAZNY_MS) return null;
    return c;
}
