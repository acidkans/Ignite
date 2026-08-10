-- USUNIECIE 23 SIEROT z wersji aktywnej (= przyszly baseline) wezla CMC- Serwerownia ZDC1-K9_2026.
-- Sierota = wymaganie bez wezla WBS: niewidoczne w widoku Materials, ilosc 0, brak tagow req:.
-- Wersje historyczne (zamrozone snapszoty) NIE sa ruszane.
-- Kopia zapasowa: test/cmc-sieroty-backup-requirements.csv + ...-proposals.csv
-- product_proposals znika kaskadowo (FK ON DELETE CASCADE), quick_quote_items dostaje SET NULL.

\set node '219f64a5-515e-45a3-b1c0-0ded85e2a85d'
\set ver  'ed89e3e9-cb7d-4d7e-984c-eca394f53049'

begin;

delete from material_requirements m
where m."nodeId" = :'node'
  and m."versionId" = :'ver'
  and m."wbsNodeId" is null
returning m.id, coalesce(nullif(left(trim(m.name), 38), ''), '(BEZ NAZWY)') as nazwa,
          m.type, m.quantity, m."budgetedPriceNetto" as cena;

commit;

\echo == KONTROLA PO USUNIECIU ==
select count(*) as wymagan,
       count(*) filter (where "wbsNodeId" is null) as sierot,
       count("budgetedPriceNetto") as z_cena
from material_requirements where "nodeId" = :'node' and "versionId" = :'ver';
