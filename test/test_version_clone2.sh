#!/bin/bash
set -e
BASE=http://localhost:3005/api
TOKEN=$(curl -s -X POST $BASE/auth/login -H 'Content-Type: application/json' -d '{"email":"admin@poz.pl","password":"123456"}' | python -c "import sys,json; print(json.load(sys.stdin)['access_token'])")
NODE_ID="7d9989a5-aa5a-436a-8289-9238c17aac16"

SRC_VER=$(curl -s -H "Authorization: Bearer $TOKEN" "$BASE/ai/versions/$NODE_ID" | python -c "import sys,json; v=[x for x in json.load(sys.stdin) if x['isActive']][0]; print(v['id'])")
echo "Source version: $SRC_VER"

# Find 'szafa' node and write distinctive qa + discount
SRC_SZAFA_ID=$(curl -s -H "Authorization: Bearer $TOKEN" "$BASE/wbs-nodes/unified/$NODE_ID?versionId=$SRC_VER" | python -c "
import sys, json
items = json.load(sys.stdin)['items']
n = next((x for x in items if x['name'] == 'szafa'), None)
print(n['id'] if n else '')
")
echo "Source szafa id: $SRC_SZAFA_ID"

curl -s -X PATCH "$BASE/wbs-nodes/$SRC_SZAFA_ID" -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"qa":[{"question":"CLONE-TEST-Q","answer":"CLONE-TEST-A"}]}' > /dev/null

curl -s -X PATCH "$BASE/wbs-nodes/$SRC_SZAFA_ID/budget" -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"unitCost":100,"quantity":3,"margin":20,"discount":17,"unit":"szt"}' > /dev/null

echo ""
echo "=== Source szafa state after edits ==="
curl -s -H "Authorization: Bearer $TOKEN" "$BASE/wbs-nodes/unified/$NODE_ID?versionId=$SRC_VER" | python -c "
import sys, json
items = json.load(sys.stdin)['items']
n = next(x for x in items if x['name'] == 'szafa')
print('qa:', n['qa'])
print('discount:', n['discount'])
print('unitCost:', n['unitCost'])
print('quantity:', n['quantity'])
"

# Create new version
LABEL="clone-test-$(date +%s)"
NEW_VER=$(curl -s -X POST "$BASE/ai/versions" -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d "{\"nodeId\":\"$NODE_ID\",\"label\":\"$LABEL\",\"sourceVersionId\":\"$SRC_VER\"}" | python -c "import sys,json; print(json.load(sys.stdin)['id'])")
echo ""
echo "New version: $NEW_VER"

echo ""
echo "=== NEW version szafa state (should match source!) ==="
curl -s -H "Authorization: Bearer $TOKEN" "$BASE/wbs-nodes/unified/$NODE_ID?versionId=$NEW_VER" | python -c "
import sys, json
items = json.load(sys.stdin)['items']
n = next((x for x in items if x['name'] == 'szafa'), None)
if not n:
    print('SZAFA NOT FOUND in new version!')
else:
    print('id (should be NEW UUID):', n['id'])
    print('qa:', n['qa'])
    print('discount:', n['discount'])
    print('unitCost:', n['unitCost'])
    print('quantity:', n['quantity'])
"

echo ""
echo "=== Isolation test: edit szafa in NEW version ==="
NEW_SZAFA_ID=$(curl -s -H "Authorization: Bearer $TOKEN" "$BASE/wbs-nodes/unified/$NODE_ID?versionId=$NEW_VER" | python -c "
import sys, json
n = next(x for x in json.load(sys.stdin)['items'] if x['name'] == 'szafa')
print(n['id'])
")
curl -s -X PATCH "$BASE/wbs-nodes/$NEW_SZAFA_ID" -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"qa":[{"question":"EDITED-IN-NEW","answer":"NEW-ANSWER"}]}' > /dev/null

echo "Source szafa qa AFTER editing new version (should still be CLONE-TEST):"
curl -s -H "Authorization: Bearer $TOKEN" "$BASE/wbs-nodes/unified/$NODE_ID?versionId=$SRC_VER" | python -c "
import sys, json
n = next(x for x in json.load(sys.stdin)['items'] if x['name'] == 'szafa')
print('  source qa:', n['qa'])
"

echo "New version szafa qa (should be EDITED-IN-NEW):"
curl -s -H "Authorization: Bearer $TOKEN" "$BASE/wbs-nodes/unified/$NODE_ID?versionId=$NEW_VER" | python -c "
import sys, json
n = next(x for x in json.load(sys.stdin)['items'] if x['name'] == 'szafa')
print('  new qa:', n['qa'])
"

echo ""
echo "=== Cleanup ==="
curl -s -X DELETE "$BASE/ai/versions/$NEW_VER" -H "Authorization: Bearer $TOKEN" > /dev/null
curl -s -X PATCH "$BASE/ai/versions/$SRC_VER/activate" -H "Authorization: Bearer $TOKEN" > /dev/null
echo "Deleted clone, reactivated source"
