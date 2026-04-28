#!/bin/bash
set -e
BASE=http://localhost:3005/api
TOKEN=$(curl -s -X POST $BASE/auth/login -H 'Content-Type: application/json' -d '{"email":"admin@poz.pl","password":"123456"}' | python -c "import sys,json; print(json.load(sys.stdin)['access_token'])")
NODE_ID="7d9989a5-aa5a-436a-8289-9238c17aac16"

# Set unique data on baseline szafa
curl -s -X PATCH "$BASE/wbs-nodes/1dffab12-3f44-4fa7-96c4-301ce0186ee4" -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"qa":[{"question":"BASELINE-Q","answer":"BASELINE-A"}]}' > /dev/null
curl -s -X PATCH "$BASE/wbs-nodes/1dffab12-3f44-4fa7-96c4-301ce0186ee4/budget" -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"unitCost":50,"quantity":2,"margin":10,"discount":7,"unit":"szt"}' > /dev/null

echo "=== Create new version with NULL source (so it falls back to baseline) ==="
LABEL="clone-test3-$(date +%s)"
NEW_VER=$(curl -s -X POST "$BASE/ai/versions" -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d "{\"nodeId\":\"$NODE_ID\",\"label\":\"$LABEL\"}" | python -c "import sys,json; print(json.load(sys.stdin)['id'])")
echo "New version: $NEW_VER"

echo ""
echo "=== Direct DB check: cloned wbs_nodes for new version ==="
docker exec erp-db psql -U postgres -d erp_db -c "SELECT id, name, qa, discount, \"unitCost\" FROM wbs_nodes WHERE \"versionId\"='$NEW_VER';" 2>&1 | tail -10

echo ""
echo "=== Isolation test: edit szafa qa in new version ==="
NEW_SZAFA_ID=$(docker exec erp-db psql -U postgres -d erp_db -At -c "SELECT id FROM wbs_nodes WHERE \"versionId\"='$NEW_VER' AND name='szafa';")
echo "New szafa id: $NEW_SZAFA_ID (must differ from baseline 1dffab12-...)"

curl -s -X PATCH "$BASE/wbs-nodes/$NEW_SZAFA_ID" -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"qa":[{"question":"NEW-VER-EDIT","answer":"isolated"}]}' > /dev/null

echo "Baseline szafa qa (should still be BASELINE-Q):"
docker exec erp-db psql -U postgres -d erp_db -At -c "SELECT qa FROM wbs_nodes WHERE id='1dffab12-3f44-4fa7-96c4-301ce0186ee4';"

echo "New version szafa qa (should be NEW-VER-EDIT):"
docker exec erp-db psql -U postgres -d erp_db -At -c "SELECT qa FROM wbs_nodes WHERE id='$NEW_SZAFA_ID';"

echo ""
echo "=== Cleanup ==="
docker exec erp-db psql -U postgres -d erp_db -c "DELETE FROM wbs_nodes WHERE \"versionId\"='$NEW_VER';" > /dev/null
curl -s -X DELETE "$BASE/ai/versions/$NEW_VER" -H "Authorization: Bearer $TOKEN" > /dev/null
echo "Cleaned up."
