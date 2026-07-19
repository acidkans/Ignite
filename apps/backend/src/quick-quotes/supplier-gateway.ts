// @anchor supplier-gateway-query
// Zapytanie do adaptera API dostawcy — budowane z wymagania materiałowego lub ręcznie.
export type SupplierGatewayQuery = {
    query: string;
    manufacturer?: string | null;
    model?: string | null;
};

// @anchor supplier-gateway-result
// Wynik z API dostawcy — surowe dane źródła. priceNetto trafia do
// QuickQuoteItem.priceNettoApi (niemutowalne) i po przeliczeniu NBP do priceNettoPln.
export type SupplierGatewayResult = {
    name: string;
    externalRef?: string | null; // identyfikator produktu u dostawcy
    sourceUrl?: string | null;
    priceNetto: number;
    currency: string; // kod ISO
    availability?: string | null;
};

// @anchor supplier-gateway
// Interfejs adaptera API dostawcy. Implementacje rejestrują się w
// QuickQuotesModule pod tokenem SUPPLIER_GATEWAYS; adapterId musi odpowiadać
// Supplier.apiAdapter. Wyniki NIE trafiają do katalogu Material (ryzyko
// duplikatów na @@unique(manufacturer, model)) — wyłącznie do QuickQuoteItem.
export interface SupplierGateway {
    readonly adapterId: string;
    search(q: SupplierGatewayQuery): Promise<SupplierGatewayResult[]>;
}

// @anchor supplier-gateways-token — token DI z listą zarejestrowanych adapterów.
export const SUPPLIER_GATEWAYS = 'SUPPLIER_GATEWAYS';
