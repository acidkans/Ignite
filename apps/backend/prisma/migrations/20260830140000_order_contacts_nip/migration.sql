-- NIP firmy Project Managera zamowienia. Dane firmy (nazwa, adres, status VAT) NIE leza tutaj:
-- pobiera je Biala lista VAT i laduja w rejestrze "suppliers" (dedup po NIP), a tu zostaje
-- sam klucz. Dodatkowe kontakty trzymaja swoj NIP w JSON-ie "clientContacts".
ALTER TABLE "order_requirements" ADD COLUMN IF NOT EXISTS "clientProjectManagerNip" TEXT;
