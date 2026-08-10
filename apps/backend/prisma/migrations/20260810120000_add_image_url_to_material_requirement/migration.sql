-- Podgląd produktu na POZYCJI (wspólny dla stron Wycena/Zakup w BaselineSplitCard).
-- Do tej pory print screen wklejony w ProductCard lądował w katalogu globalnym
-- (materials.imageUrl) i wymagał wcześniejszego wyboru produktu katalogowego —
-- pozycja bez materialId nie miała gdzie trzymać obrazka i upload kończył się błędem 400.
ALTER TABLE "material_requirements" ADD COLUMN "imageUrl" TEXT;
