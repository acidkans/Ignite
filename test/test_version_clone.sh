#!/bin/bash
set -e
BASE=http://localhost:3005/api
TOKEN=$(curl -s -X POST $BASE/auth/login -H 'Content-Type: application/json' -d '{"email":"admin@poz.pl","password":"123456"}' | python -c "import sys,json; print(json.load(sys.stdin)['access_token'])")
NODE_ID="7d9989a5-aa5a-436a-8289-9238c17aac16"

echo "=== 1. Active version of source node ==="
SRC_VER=$(curl -s -H "Authorization: Bearer $TOKEN" "$BASE/ai/versions/$NODE_ID" | python -c "import sys,json; v=[x for x in json.load(sys.stdin) if x['isActive']][0]; print(v['id'])")
echo "Source version: $SRC_VER"

echo ""
echo "=== 2. Set qa + discount + offerStatus on source ==="
FIRST_WBS=$(curl -s -H "Authorization: Bearer $TOKEN" "$BASE/wbs-nodes/unified/$NODE_ID?versionId=$SRC_VER" | python -c "import sys,json; d=json.load(sys.stdin); items=d['items']; print(items[0]['id'] if items else '')")
echo "First WBS in source version: $FIRST_WBS"

if [ -n "$FIRST_WBS" ]; then
  curl -s -X PATCH "$BASE/wbs-nodes/$FIRST_WBS" -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
    -d '{"qa":[{"question":"v-clone-q","answer":"v-clone-a"}]}' > /dev/null
  curl -s -X PATCH "$BASE/wbs-nodes/$FIRST_WBS/budget" -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
    -d '{"unitCost":100,"quantity":3,"margin":20,"discount":15,"unit":"szt"}' > /dev/null
fi

echo ""
echo "=== 3. Create new version 'clone-test-X' ==="
LABEL="clone-test-$(date +%s)"
NEW_VER=$(curl -s -X POST "$BASE/ai/versions" -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d "{\"nodeId\":\"$NODE_ID\",\"label\":\"$LABEL\",\"sourceVersionId\":\"$SRC_VER\"}" | python -c "import sys,json; print(json.load(sys.stdin)['id'])")
echo "New version: $NEW_VER"

echo ""
echo "=== 4. Read first WBS in NEW version ==="
curl -s -H "Authorization: Bearer $TOKEN" "$BASE/wbs-nodes/unified/$NODE_ID?versionId=$NEW_VER" | python -c "
import sys, json
d = json.load(sys.stdin)
items = d.get('items', [])
print('items count:', len(items))
if items:
    first = items[0]
    print('id:', first['id'])
    print('name:', first['name'])
    print('qa:', first.get('qa'))
    print('discount:', first.get('discount'))
    print('unitCost:', first.get('unitCost'))
    print('quantity:', first.get('quantity'))
    print('totalCost:', first.get('totalCost'))
"

echo ""
echo "=== 5. Cleanup: delete test version ==="
curl -s -X DELETE "$BASE/ai/versions/$NEW_VER" -H "Authorization: Bearer $TOKEN" > /dev/null
echo "Deleted $NEW_VER"

echo ""
echo "=== 6. Re-activate original source version ==="
curl -s -X PATCH "$BASE/ai/versions/$SRC_VER/activate" -H "Authorization: Bearer $TOKEN" > /dev/null
echo "Reactivated $SRC_VER"
