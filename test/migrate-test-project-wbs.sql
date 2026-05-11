-- Migracja jednorazowa: naprawia projekt "test" (nodeId 80011980).
-- Cel: każda wersja ma własne WbsNode i własne WbsMarkerLink.

BEGIN;

-- 1. Cleanup: usuń 3 zanieczyszczone WbsNode (nodeId=test, versionId=kabel z innego projektu)
DELETE FROM wbs_nodes
WHERE "nodeId" = '80011980-9603-47a3-9bc2-dfdbe49ddbfd'
  AND "versionId" = '3f272860-890f-48b1-adf3-a9abec2db1df';

-- 2. Wstaw baseline WbsNode (versionId=null), UUIDy z baseline blob
INSERT INTO wbs_nodes (id, "nodeId", "versionId", "parentId", name, type, status, owner, resources, cost, tags, "sortOrder", unit, quantity, "createdAt", "updatedAt") VALUES
  ('9f100cf5-f2f1-43a0-8974-ed15ddcd6310', '80011980-9603-47a3-9bc2-dfdbe49ddbfd', NULL, NULL,                                    'pierwszy subtask',       '',         'PENDING', '', '', '', '[]', 0, 'sztuki', 0, NOW(), NOW()),
  ('6bd9e1bd-62dd-4220-b539-530c5be69f10', '80011980-9603-47a3-9bc2-dfdbe49ddbfd', NULL, '9f100cf5-f2f1-43a0-8974-ed15ddcd6310', 'materiał drugi subtask',  'material', 'PENDING', '', '', '', '["req:39054811-f618-4aa4-9728-9fc027f074a6","auto-requirement"]', 0, 'sztuki', 1, NOW(), NOW()),
  ('dede10bc-e43d-480f-a250-7b5a22b2053d', '80011980-9603-47a3-9bc2-dfdbe49ddbfd', NULL, '9f100cf5-f2f1-43a0-8974-ed15ddcd6310', 'praca pierwszy subtask',  'work',     'PENDING', '', '', '', '[]', 1, 'usługa', 1, NOW(), NOW());

-- 3. Klonowanie do "pierwsza wersja" (c3524f4f) z nowymi UUIDami + clone WbsMarkerLink + update wbsTree blob
DO $$
DECLARE
  v_root  UUID := gen_random_uuid();
  v_mat   UUID := gen_random_uuid();
  v_work  UUID := gen_random_uuid();
  v_node  TEXT := '80011980-9603-47a3-9bc2-dfdbe49ddbfd';
  v_ver   TEXT := 'c3524f4f-1963-4dcd-bc27-1a7f4a479e1b';
BEGIN
  INSERT INTO wbs_nodes (id, "nodeId", "versionId", "parentId", name, type, status, owner, resources, cost, tags, "sortOrder", unit, quantity, "createdAt", "updatedAt") VALUES
    (v_root::text, v_node, v_ver, NULL,        'pierwszy subtask',       '',         'PENDING', '', '', '', '[]', 0, 'sztuki', 0, NOW(), NOW()),
    (v_mat::text,  v_node, v_ver, v_root::text, 'materiał drugi subtask', 'material', 'PENDING', '', '', '', '["req:39054811-f618-4aa4-9728-9fc027f074a6","auto-requirement"]', 0, 'sztuki', 1, NOW(), NOW()),
    (v_work::text, v_node, v_ver, v_root::text, 'praca pierwszy subtask', 'work',     'PENDING', '', '', '', '[]', 1, 'usługa', 1, NOW(), NOW());

  INSERT INTO wbs_marker_links (id, "wbsNodeId", "markerId", "createdAt")
  SELECT gen_random_uuid(),
    CASE wml."wbsNodeId"
      WHEN '9f100cf5-f2f1-43a0-8974-ed15ddcd6310' THEN v_root::text
      WHEN '6bd9e1bd-62dd-4220-b539-530c5be69f10' THEN v_mat::text
      WHEN 'dede10bc-e43d-480f-a250-7b5a22b2053d' THEN v_work::text
    END,
    wml."markerId",
    NOW()
  FROM wbs_marker_links wml
  WHERE wml."wbsNodeId" IN ('9f100cf5-f2f1-43a0-8974-ed15ddcd6310','6bd9e1bd-62dd-4220-b539-530c5be69f10','dede10bc-e43d-480f-a250-7b5a22b2053d')
  ON CONFLICT DO NOTHING;

  UPDATE order_requirements
  SET "wbsTree" = REPLACE(REPLACE(REPLACE("wbsTree",
        '9f100cf5-f2f1-43a0-8974-ed15ddcd6310', v_root::text),
        '6bd9e1bd-62dd-4220-b539-530c5be69f10', v_mat::text),
        'dede10bc-e43d-480f-a250-7b5a22b2053d', v_work::text),
      "updatedAt" = NOW()
  WHERE "nodeId" = v_node AND "versionId" = v_ver;
END $$;

-- 4. Klonowanie do "druga wersja" (4313163a)
DO $$
DECLARE
  v_root  UUID := gen_random_uuid();
  v_mat   UUID := gen_random_uuid();
  v_work  UUID := gen_random_uuid();
  v_node  TEXT := '80011980-9603-47a3-9bc2-dfdbe49ddbfd';
  v_ver   TEXT := '4313163a-f5ef-4a6b-bb2b-3ed14f5021ea';
BEGIN
  INSERT INTO wbs_nodes (id, "nodeId", "versionId", "parentId", name, type, status, owner, resources, cost, tags, "sortOrder", unit, quantity, "createdAt", "updatedAt") VALUES
    (v_root::text, v_node, v_ver, NULL,        'pierwszy subtask',       '',         'PENDING', '', '', '', '[]', 0, 'sztuki', 0, NOW(), NOW()),
    (v_mat::text,  v_node, v_ver, v_root::text, 'materiał drugi subtask', 'material', 'PENDING', '', '', '', '["req:39054811-f618-4aa4-9728-9fc027f074a6","auto-requirement"]', 0, 'sztuki', 1, NOW(), NOW()),
    (v_work::text, v_node, v_ver, v_root::text, 'praca pierwszy subtask', 'work',     'PENDING', '', '', '', '[]', 1, 'usługa', 1, NOW(), NOW());

  INSERT INTO wbs_marker_links (id, "wbsNodeId", "markerId", "createdAt")
  SELECT gen_random_uuid(),
    CASE wml."wbsNodeId"
      WHEN '9f100cf5-f2f1-43a0-8974-ed15ddcd6310' THEN v_root::text
      WHEN '6bd9e1bd-62dd-4220-b539-530c5be69f10' THEN v_mat::text
      WHEN 'dede10bc-e43d-480f-a250-7b5a22b2053d' THEN v_work::text
    END,
    wml."markerId",
    NOW()
  FROM wbs_marker_links wml
  WHERE wml."wbsNodeId" IN ('9f100cf5-f2f1-43a0-8974-ed15ddcd6310','6bd9e1bd-62dd-4220-b539-530c5be69f10','dede10bc-e43d-480f-a250-7b5a22b2053d')
  ON CONFLICT DO NOTHING;

  UPDATE order_requirements
  SET "wbsTree" = REPLACE(REPLACE(REPLACE("wbsTree",
        '9f100cf5-f2f1-43a0-8974-ed15ddcd6310', v_root::text),
        '6bd9e1bd-62dd-4220-b539-530c5be69f10', v_mat::text),
        'dede10bc-e43d-480f-a250-7b5a22b2053d', v_work::text),
      "updatedAt" = NOW()
  WHERE "nodeId" = v_node AND "versionId" = v_ver;
END $$;

COMMIT;

-- Weryfikacja
SELECT pv.label, COUNT(wn.id) AS wbs_count
FROM project_versions pv
LEFT JOIN wbs_nodes wn ON wn."versionId" = pv.id
WHERE pv."nodeId" = '80011980-9603-47a3-9bc2-dfdbe49ddbfd'
GROUP BY pv.label;

SELECT pv.label, wn.name, wml."markerId"
FROM wbs_marker_links wml
JOIN wbs_nodes wn ON wn.id = wml."wbsNodeId"
LEFT JOIN project_versions pv ON pv.id = wn."versionId"
WHERE wn."nodeId" = '80011980-9603-47a3-9bc2-dfdbe49ddbfd'
ORDER BY pv.label NULLS FIRST, wn."sortOrder";
