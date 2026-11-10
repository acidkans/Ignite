// Waluta zamówienia — jeden znacznik na zamówieniu (`ProcessNode.currency`, PLN | EUR), ustawiany
// w zakładce „Informacje o zamówieniu". Wszystkie kwoty zamówienia są w tej walucie; ten moduł
// podaje symbol do etykiet, nagłówków kolumn i eksportów. Stan jest modułowy (a nie tylko
// kontekst React), bo symbol czytają też helpery i eksporty wołane poza komponentami.
import { useSyncExternalStore } from 'react';
import { API_URL } from '../config';

// @anchor order-currencies-ui — waluty do wyboru na zamówieniu i (szerzej) przy zakupie
export const ORDER_CURRENCIES = ['PLN', 'EUR'];
export const PURCHASE_CURRENCIES = ['PLN', 'EUR', 'USD', 'GBP'];

// @anchor currency-symbols
export const CURRENCY_SYMBOLS = { PLN: 'zł', EUR: '€', USD: '$', GBP: '£' };

// @anchor order-currency-store — waluta aktywnego zamówienia + cache per zamówienie
let state = { nodeId: null, currency: 'PLN' };
const cache = new Map();
const listeners = new Set();
const emit = () => listeners.forEach((l) => l());
const subscribe = (l) => { listeners.add(l); return () => listeners.delete(l); };
const authHeaders = () => ({ Authorization: `Bearer ${sessionStorage.getItem('token')}` });

// @anchor currency-code — kod waluty aktywnego zamówienia (do nagłówków „Cena (EUR)")
export const currencyCode = () => state.currency;

// @anchor currency-symbol — symbol do kwot („1 234,56 €"); bez argumentu = waluta zamówienia
export const currencySymbol = (cur = state.currency) => CURRENCY_SYMBOLS[cur] || cur || 'zł';

// @anchor fmt-money — kwota z symbolem waluty; null/NaN → „—"
export const fmtMoney = (v, cur = state.currency) => {
    const n = Number(v);
    if (v == null || v === '' || !Number.isFinite(n)) return '—';
    return `${n.toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currencySymbol(cur)}`;
};

// @anchor excel-money-fmt — format liczbowy ExcelJS z symbolem waluty zamówienia
export const excelMoneyFmt = (cur = state.currency) =>
    cur === 'PLN' ? '#,##0.00\\ [$zł-415]' : `#,##0.00\\ "${currencySymbol(cur)}"`;

// @anchor pln-rates — bieżące kursy NBP (ile PLN za 1 jednostkę), do przeliczania cen ofert
// dostawców na walutę zamówienia; ładowane raz, przy pierwszym zamówieniu w walucie obcej
let plnRates = { PLN: 1 };
let ratesLoaded = false;
async function loadPlnRates() {
    if (ratesLoaded) return;
    try {
        const res = await fetch(`${API_URL}/exchange-rates`, { headers: authHeaders() });
        if (!res.ok) return;
        const data = await res.json();
        for (const [code, r] of Object.entries(data || {})) if (r?.rate) plnRates[code] = r.rate;
        ratesLoaded = true;
        emit();
    } catch { /* bez kursów — ceny obce pokażą się jako brak */ }
}

// @anchor to-order-currency — kwota z waluty `fromCur` w walucie zamówienia (bieżący kurs NBP).
// Dla zakupów NIE używać — tam kurs z dnia zdarzenia liczy serwer (`LeafActual.exchangeRate`).
export const toOrderCurrency = (amount, fromCur = 'PLN') => {
    if (amount == null || !Number.isFinite(Number(amount))) return null;
    const from = (fromCur || 'PLN').toUpperCase();
    const to = state.currency;
    if (from === to) return Number(amount);
    const rf = plnRates[from];
    const rt = plnRates[to];
    if (!rf || !rt) return null;
    return Math.round((Number(amount) * rf / rt) * 100) / 100;
};

// @anchor load-order-currency — pobiera walutę zamówienia i ustawia ją jako aktywną.
// Z cache od razu (przełączanie zamówień bez mrugania), potem odświeża z serwera.
export async function loadOrderCurrency(nodeId) {
    if (!nodeId) return;
    const known = cache.get(nodeId);
    state = { nodeId, currency: known || 'PLN' };
    emit();
    try {
        const res = await fetch(`${API_URL}/process-tree/${nodeId}/currency`, { headers: authHeaders() });
        if (!res.ok) return;
        const { currency } = await res.json();
        cache.set(nodeId, currency || 'PLN');
        if (currency && currency !== 'PLN') loadPlnRates();
        if (state.nodeId === nodeId && state.currency !== currency) {
            state = { nodeId, currency: currency || 'PLN' };
            emit();
        }
    } catch { /* offline — zostaje wartość z cache */ }
}

// @anchor save-order-currency — zapis znacznika; zwraca nową walutę albo rzuca błąd z serwera
export async function saveOrderCurrency(nodeId, currency) {
    const res = await fetch(`${API_URL}/process-tree/${nodeId}/currency`, {
        method: 'PATCH',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ currency }),
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || 'Nie udało się zapisać waluty');
    }
    const data = await res.json();
    cache.set(nodeId, data.currency);
    if (data.currency !== 'PLN') loadPlnRates();
    if (state.nodeId === nodeId) { state = { nodeId, currency: data.currency }; emit(); }
    return data.currency;
}

// @anchor use-order-currency — hook: kod waluty aktywnego zamówienia; komponent przerysuje się po zmianie
export function useOrderCurrency() {
    return useSyncExternalStore(subscribe, () => state.currency);
}

// @anchor fetch-cross-rate — kurs NBP `from` → `to` z dnia roboczego przed `date` (YYYY-MM-DD)
export async function fetchCrossRate(from, to, date) {
    const q = new URLSearchParams({ from, to, ...(date ? { date } : {}) });
    const res = await fetch(`${API_URL}/exchange-rates/cross?${q}`, { headers: authHeaders() });
    if (!res.ok) return null;
    return res.json();
}
