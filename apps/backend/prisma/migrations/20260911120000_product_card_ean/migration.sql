-- Kod EAN produktu w karcie produktu (Planowanie) — ten sam kod, ktory realizacja zapisuje
-- juz na wpisie zakupu (`leaf_actuals.ean`). Do tej pory dalo sie go podac dopiero PO
-- dostawie, wiec zamawiajacy nie mial gdzie zapisac kodu produktu, ktory ma byc kupiony.
--
-- Dwie kolumny, bo kod zyje na dwoch poziomach:
--   material_requirements.ean — kod TEJ pozycji, dziala zanim pozycja dostanie produkt
--                               katalogowy (tak samo jak `availability`);
--   materials.ean             — pamiec katalogu: raz wpisany kod wraca przy kazdym kolejnym
--                               uzyciu tego samego produktu.
-- Odczyt: kod pozycji wygrywa, katalogowy jest fallbackiem (patrz `mat-req-ean-read`).
-- Bez UNIQUE swiadomie: te same dane wpisuje kilku ludzi z faktur i etykiet, a kolizja
-- blokowalaby zapis pozycji zamiast poprawiac dane.

ALTER TABLE "material_requirements" ADD COLUMN IF NOT EXISTS "ean" TEXT;
ALTER TABLE "materials" ADD COLUMN IF NOT EXISTS "ean" TEXT;
