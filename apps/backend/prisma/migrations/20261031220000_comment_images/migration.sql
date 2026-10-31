-- Czat: obrazki wiadomości (nazwy plików w uploads/chat/).
ALTER TABLE "comments" ADD COLUMN "images" TEXT[] DEFAULT ARRAY[]::TEXT[];
