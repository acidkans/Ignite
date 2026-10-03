// Struktura katalogów zamówienia na OneDrive — jedno źródło prawdy dla zakładania katalogów,
// synchronizacji (katalog → typ dokumentu) i eksportów (typ eksportu → katalog).
// Plan: docs/PLAN-onedrive-sync.md.
//
// Numerowane są tylko katalogi główne (stała kolejność w OneDrive); podkatalogi nie.
// Aplikacja rozpoznaje katalogi po id zapisanych w `ProcessNode.oneDriveFolderIds`, nie po nazwach —
// zmiana nazwy na OneDrive nie zrywa powiązania.

// @anchor order-root-folders
export const ORDER_ROOT_FOLDERS = {
  finance: '01 Dokumenty finansowe',
  project: '02 Dokumentacja projektowa',
  realization: '03 Realizacja',
} as const;

export type OrderRootKey = keyof typeof ORDER_ROOT_FOLDERS;

// @anchor order-folder-def
export interface OrderFolderDef {
  key: string;
  root: OrderRootKey;
  name: string;
  // Wartość `ProcessNode.documentCategory` nadawana plikom z synchronizacji; null = katalog pomijany przez sync.
  documentCategory: string | null;
  // Czy treść trafia do indeksu wektorowego (Qdrant) dla AI.
  index: boolean;
  description: string;
}

// @anchor order-folders
export const ORDER_FOLDERS: OrderFolderDef[] = [
  { key: 'supplierOffers', root: 'finance', name: 'Oferty dostawców', documentCategory: 'financial', index: true, description: 'Oferty, które dostajemy od dostawców (parser → ceny zakupu)' },
  { key: 'clientOffer', root: 'finance', name: 'Oferta finansowa', documentCategory: 'clientOffer', index: true, description: 'Nasza oferta dla klienta' },
  { key: 'budget', root: 'finance', name: 'Analiza budżetu', documentCategory: 'budget', index: false, description: 'Eksporty budżetu, same koszty, inne koszty' },
  { key: 'invoices', root: 'finance', name: 'Zamówienia i faktury', documentCategory: null, index: false, description: 'Tylko archiwum na OneDrive — brak obsługi w aplikacji' },
  { key: 'protocols', root: 'finance', name: 'Protokoły odbioru', documentCategory: 'protocol', index: false, description: 'Protokoły odbioru, podkatalog per gałąź' },
  { key: 'aiReports', root: 'finance', name: 'Analizy AI', documentCategory: 'aiReport', index: false, description: 'Raporty generowane przez aplikację — wykluczone z indeksu AI' },
  { key: 'clientDocs', root: 'project', name: 'Dokumentacja klienta', documentCategory: 'standard', index: true, description: 'Zapytanie, OPZ, SIWZ, rysunki od klienta' },
  { key: 'datasheets', root: 'project', name: 'Karty katalogowe', documentCategory: 'datasheet', index: true, description: 'Karty katalogowe i deklaracje zgodności' },
  { key: 'schematics', root: 'project', name: 'Schematy i rysunki', documentCategory: 'schematic', index: true, description: 'Nasze schematy i rysunki wykonawcze' },
  { key: 'materials', root: 'project', name: 'Zestawienia materiałów', documentCategory: 'materials', index: false, description: 'Eksport „Materiały” XLSX' },
  { key: 'schedule', root: 'project', name: 'Harmonogram', documentCategory: 'schedule', index: false, description: 'Eksport harmonogramu' },
  { key: 'reports', root: 'project', name: 'Raporty projektu', documentCategory: 'report', index: false, description: 'PDF sekcji, wszystkie sekcje, Informacje o zamówieniu, Q&A' },
  { key: 'sitePhotos', root: 'realization', name: 'Zdjęcia i dokumentacja z budowy', documentCategory: 'sitePhoto', index: false, description: 'Zdjęcia i filmy z realizacji' },
];

// @anchor order-folder-path
// Ścieżka katalogu względem folderu zamówienia — do komunikatów w UI i katalogu na serwerze.
export function orderFolderPath(key: string | null): string | null {
  const def = ORDER_FOLDERS.find((f) => f.key === key);
  return def ? `${ORDER_ROOT_FOLDERS[def.root]}/${def.name}` : null;
}

// @anchor financial-tab-categories
// Kategorie dokumentów pokazywane w zakładce „Pliki finansowe” (`GET /documents/node/:id?category=financial`).
export const FINANCIAL_TAB_CATEGORIES = ['financial', 'clientOffer', 'budget', 'protocol', 'aiReport'];

// @anchor standard-tab-categories
// Kategorie dokumentów zakładki „Dokumentacja” (obok `null` — dokumenty wgrane przed kategoriami).
export const STANDARD_TAB_CATEGORIES = ['standard', '', 'datasheet', 'schematic', 'materials', 'schedule', 'report', 'sitePhoto'];

// @anchor upload-category-folder
// Katalog OneDrive dla pliku wgranego w zakładce aplikacji (wg `documentCategory`).
// Brak wpisu (np. `offer` — oferty ogólne z Logistyki) = plik nie jest wysyłany na OneDrive zamówienia.
export const UPLOAD_CATEGORY_FOLDER: Record<string, string> = {
  standard: 'clientDocs',
  '': 'clientDocs',
  financial: 'supplierOffers',
  clientOffer: 'clientOffer',
  budget: 'budget',
  protocol: 'protocols',
  aiReport: 'aiReports',
  datasheet: 'datasheets',
  schematic: 'schematics',
  materials: 'materials',
  schedule: 'schedule',
  report: 'reports',
  sitePhoto: 'sitePhotos',
};
