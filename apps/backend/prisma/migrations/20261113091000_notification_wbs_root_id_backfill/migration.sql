-- Uzupełnienie `wbsRootId` w powiadomieniach z czatu / maila gałęzi sprzed pola (bez niego klik prowadził
-- do ogólnego czatu zamówienia). Powiadomienie powstaje tuż po wpisie czatu (`comments.wbsNodeId`), więc
-- dopasowanie = najbliższy WCZEŚNIEJSZY wpis z węzłem w tym samym zamówieniu (do 2 min), najpierw ten,
-- którego nazwa węzła stoi w tytule. Klucz = `sourceWbsNodeId ?? id` jak w backendzie.
WITH dopasowanie AS (
    SELECT n.id AS notification_id,
           (SELECT COALESCE(w."sourceWbsNodeId", c."wbsNodeId")
              FROM "comments" c
              LEFT JOIN "wbs_nodes" w ON w.id = c."wbsNodeId"
             WHERE c."orderId" = n."orderId"
               AND c."wbsNodeId" IS NOT NULL
               AND n."createdAt" >= c."createdAt"
               AND n."createdAt" < c."createdAt" + INTERVAL '2 minutes'
             ORDER BY (w.name IS NOT NULL AND POSITION('„' || w.name || '”' IN n.title) > 0) DESC,
                      n."createdAt" - c."createdAt"
             LIMIT 1) AS klucz
      FROM "notifications" n
     WHERE n."wbsRootId" IS NULL
       AND n."orderId" IS NOT NULL
       AND (n.title LIKE '%— czat „%' OR n.title LIKE '%— odpowiedź na pytanie „%' OR n.title LIKE '%— odpowiedź mailem „%')
)
UPDATE "notifications" n
   SET "wbsRootId" = d.klucz
  FROM dopasowanie d
 WHERE d.notification_id = n.id
   AND d.klucz IS NOT NULL;
