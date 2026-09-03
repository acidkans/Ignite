-- Rozdzial statusow: `status` zostaje etapem PLANU (decyzja ofertowa), a realizacja
-- dostaje wlasne osie — zakup (droga towaru/zlecenia) i wykonanie (droga roboty).
-- Do tej pory wszystkie trzy etapy jechaly jedna kolumna, wiec pozycji zamowionej nie dalo
-- sie odroznic od zamontowanej, a zmiana statusu w planowaniu kasowala stan realizacji.
--
-- Kolumny sa NULLABLE i BEZ backfillu: NULL znaczy "pozycja nie weszla jeszcze do realizacji"
-- albo "ta os jej nie dotyczy" (praca wlasna nie ma zakupu, nocleg i paliwo nie maja montazu).
-- Stany realizacji zapisane w starej kolumnie `status` (ORDERED, IN_STOCK, ISSUED, INSTALLED,
-- STARTED, COMPLETED...) ZOSTAJA tam nietkniete — front pokazuje je w planie jako
-- "Zaakceptowane" (patrz planStatusFromAny), a ich przeniesienie na nowe osie jest
-- osobna, swiadoma decyzja.

ALTER TABLE "wbs_nodes" ADD COLUMN IF NOT EXISTS "purchaseStatus" TEXT;
ALTER TABLE "wbs_nodes" ADD COLUMN IF NOT EXISTS "execStatus" TEXT;
