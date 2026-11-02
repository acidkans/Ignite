-- Krótka nazwa pozycji WBS do drzewa i tabel realizacji (pełna `name` zostaje w ofercie i protokołach)
ALTER TABLE "wbs_nodes" ADD COLUMN "shortName" TEXT;
