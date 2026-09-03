// Domyślny właściciel pozycji ZAKUPOWEJ (materiał, sprzęt) — logistyk zamówienia.
//
// Skąd bierzemy logistyka i dlaczego właśnie stąd:
//
// Nie przechowujemy go w żadnym dedykowanym polu — nie ma `ProcessNode.defaultLogisticianId`
// ani ustawienia globalnego. Jedynym miejscem, w którym człowiek WSKAZUJE logistyka danego
// zlecenia, są kontakty zamówienia (`OrderRequirements.clientContacts`), gdzie każdy wpis ma
// wolnotekstową `role`. Reguła z `ExtraOrderNotifierService.logisticiansForOrder` (użytkownicy
// z rolą LOGISTYK mający dostęp do węzła) NIE nadaje się na właściciela: zwraca WSZYSTKICH
// pasujących, więc wybór jednego z nich byłby losowy, a etykieta w `WbsNode.owner` ma wskazywać
// konkretną osobę wpisaną do zamówienia.

// @anchor logistician-role-re-backend — rdzeń słowa bez końcówki, bez wielkości liter: pole `role` jest
// wolnym tekstem („Logistyk", „logistyka AMP", „Logistyk Airtel"). Lustro `LOGISTICIAN_ROLE_RE`
// z `wbsConstants.js` — rozjazd znaczyłby, że front podpowiada innego logistyka, niż backend
// wstawia domyślnie.
export const LOGISTICIAN_ROLE_RE = /logisty/i;

type Kontakt = { name?: string; company?: string; email?: string; role?: string };

// @anchor contact-owner-label-backend — etykieta osoby w `WbsNode.owner`. Pole trzyma ETYKIETĘ,
// nie klucz obcy, więc format MUSI być identyczny z `contactOwnerLabel` na froncie: inny odstęp
// czy inny separator i `<select>` w kolumnie „Osoba odpowiedzialna" dostaje wartość spoza opcji,
// czyli pokazuje puste pole nad nazwiskiem zapisanym w bazie.
export const contactOwnerLabel = (c?: Kontakt | null): string => {
    const name = String(c?.name || '').trim() || String(c?.email || '').trim();
    if (!name) return '';
    const company = String(c?.company || '').trim();
    return company ? `${company} - ${name}` : name;
};

// @anchor default-logistician-owner-backend — PIERWSZY kontakt zamówienia z rolą logistyka.
// Brak takiego kontaktu = pusty właściciel; świadomie nie zgadujemy nikogo z listy użytkowników.
export const defaultLogisticianOwner = (clientContacts: unknown): string => {
    let lista: Kontakt[] = [];
    try {
        const raw = typeof clientContacts === 'string' ? JSON.parse(clientContacts || '[]') : clientContacts;
        lista = Array.isArray(raw) ? raw : [];
    } catch {
        return '';
    }
    const hit = lista.find((c) => LOGISTICIAN_ROLE_RE.test(String(c?.role || '')));
    return hit ? contactOwnerLabel(hit) : '';
};
