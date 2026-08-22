\pset pager off
\echo == MR w AMP_5G z wieloma alokacjami (rozdmuchane ilosci) ==
SELECT mr.name, mr.quantity AS mr_qty, w.quantity AS wbs_qty, mr."wbsNodeAllocations"
FROM material_requirements mr
LEFT JOIN wbs_nodes w ON w.id = mr."wbsNodeId"
WHERE mr."nodeId" = 'd1bb2395-2fd0-4e9e-9760-f722e780224c'
  AND (length(mr."wbsNodeAllocations") - length(replace(mr."wbsNodeAllocations", ':', ''))) > 1
ORDER BY mr."updatedAt" DESC LIMIT 20;
\echo == wiersze relacyjne dla tego wymagania ==
SELECT * FROM wbs_node_materials WHERE "materialId" = '5abec407-da1c-4a9c-82ea-3ab3939ede08';
