-- Zespol zamowienia = jedyne zrodlo widocznosci zamowienia.
ALTER TABLE "teams" ADD COLUMN "orderNodeId" TEXT;
CREATE UNIQUE INDEX "teams_orderNodeId_key" ON "teams"("orderNodeId");
ALTER TABLE "teams" ADD CONSTRAINT "teams_orderNodeId_fkey" FOREIGN KEY ("orderNodeId") REFERENCES "process_nodes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 1. Zespol dla kazdego istniejacego zamowienia (nazwa = nazwa zamowienia; przy kolizji dopisek z id).
WITH o AS (
  SELECT n.id, n.name, row_number() OVER (PARTITION BY lower(n.name) ORDER BY n."createdAt") AS rn
  FROM "process_nodes" n WHERE n.type = 'order'
)
INSERT INTO "teams" (id, name, "createdAt", "updatedAt", "orderNodeId")
SELECT gen_random_uuid()::text,
       CASE WHEN o.rn = 1 AND NOT EXISTS (SELECT 1 FROM "teams" t WHERE lower(t.name) = lower(o.name))
            THEN o.name ELSE o.name || ' (' || left(o.id, 8) || ')' END,
       now(), now(), o.id
FROM o;

-- 2. Czlonkowie = wszyscy, ktorzy mieli dostep dotad: wlasciciel, uprawnienia bezposrednie
--    zamowienia, czlonkowie zespolow z uprawnien zamowienia i folderow nad nim (widocznosc 'team').
INSERT INTO "_TeamToUser" ("A", "B")
SELECT DISTINCT t.id, m.uid
FROM "teams" t
JOIN (
  SELECT n.id AS nid, n."ownerId" AS uid FROM "process_nodes" n WHERE n.type = 'order' AND n."ownerId" IS NOT NULL
  UNION
  SELECT p."nodeId", p."userId" FROM "node_permissions" p
    JOIN "process_nodes" n ON n.id = p."nodeId" AND n.type = 'order'
    WHERE p."userId" IS NOT NULL
  UNION
  SELECT c."descendantId", tu."B" FROM "process_node_closure" c
    JOIN "process_nodes" d ON d.id = c."descendantId" AND d.type = 'order'
    JOIN "process_nodes" a ON a.id = c."ancestorId" AND (c.depth = 0 OR a.visibility = 'team')
    JOIN "node_permissions" p ON p."nodeId" = c."ancestorId" AND p."teamId" IS NOT NULL
    JOIN "_TeamToUser" tu ON tu."A" = p."teamId"
) m ON m.nid = t."orderNodeId"
JOIN "users" u ON u.id = m.uid
ON CONFLICT DO NOTHING;

-- 3. Zamowienia pod publicznym folderem (albo publiczne same) zostaja publiczne.
UPDATE "process_nodes" d SET "isPublic" = true, visibility = 'public'
WHERE d.type = 'order' AND EXISTS (
  SELECT 1 FROM "process_node_closure" c JOIN "process_nodes" a ON a.id = c."ancestorId"
  WHERE c."descendantId" = d.id AND (a.visibility = 'public' OR a."isPublic" = true)
);
UPDATE "process_nodes" SET visibility = 'team' WHERE type = 'order' AND visibility <> 'public';

-- 4. Stare uprawnienia osob/zespolow na zamowieniach zastapione jednym wpisem zespolu zamowienia.
DELETE FROM "node_permissions" p USING "process_nodes" n
WHERE n.id = p."nodeId" AND n.type = 'order' AND (p."userId" IS NOT NULL OR p."teamId" IS NOT NULL);
INSERT INTO "node_permissions" (id, "nodeId", "teamId", permission)
SELECT gen_random_uuid()::text, t."orderNodeId", t.id, 'VIEW' FROM "teams" t WHERE t."orderNodeId" IS NOT NULL;
