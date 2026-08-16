-- Zakres NA WPISIE realizacji: odpowiednik producenta i modelu dla liści bez karty
-- produktowej (praca, usługa, nocleg, paliwo). Kolumna „Produkt" w wierszu wpisu była dla
-- nich martwa — nie ma czego wpisać w „producenta" nad robocizną, a rodzaj wykonanej pracy
-- nigdzie nie siadał. Jedno wolne pole zamiast pary producent + model.
ALTER TABLE "leaf_actuals" ADD COLUMN "scope" TEXT;
