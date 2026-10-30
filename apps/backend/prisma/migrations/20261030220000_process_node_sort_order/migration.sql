-- Kolejność węzłów drzewa wśród rodzeństwa (drag&drop w lewej belce).
ALTER TABLE "process_nodes" ADD COLUMN "sortOrder" INTEGER NOT NULL DEFAULT 0;
