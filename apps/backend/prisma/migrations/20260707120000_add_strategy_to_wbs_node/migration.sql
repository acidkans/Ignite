-- Dodanie pola strategii per gałąź WBS (edytowane dla węzłów top-level).
-- TEXT = bez limitu długości (>256 znaków).
ALTER TABLE "wbs_nodes" ADD COLUMN "strategy" TEXT;
