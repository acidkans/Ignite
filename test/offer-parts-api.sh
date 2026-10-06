#!/usr/bin/env bash
# Test API PUT /material-requirements/:id/offer-parts (pozycja ofertowana w częściach) na DEV
API=http://localhost:3001/api
NODE=219f64a5-515e-45a3-b1c0-0ded85e2a85d
O1=3e1904fe-0050-4362-b133-bd6bd5c625bd
O2=d7d93c4e-dbe6-4a1c-92a4-2d769521be8f
TOKEN=$(curl -s -X POST $API/auth/login -H 'Content-Type: application/json' -d '{"email":"claude-test@ignite.test","password":"BEyE-uNo7p5x"}' | python -c "import sys,json;d=json.load(sys.stdin);print(d.get('access_token') or d.get('accessToken') or d)")
REQ=$(docker exec -i erp-db psql -U postgres -d erp_db -At -c "select id from material_requirements where \"nodeId\"='$NODE' and \"versionId\" is null and \"offerId\" is null and \"budgetedPriceNetto\" is null limit 1")
ORIG_MAT=$(docker exec -i erp-db psql -U postgres -d erp_db -At -c "select coalesce(\"materialId\",'NULL') from material_requirements where id='$REQ'")
echo "req=$REQ orig_mat=$ORIG_MAT"
H="Authorization: Bearer $TOKEN"
echo "--- composite: O1 poz0 x2 + O1 poz1 x1 + cała O2 x0.5"
curl -s -X PUT $API/material-requirements/$REQ/offer-parts -H "$H" -H 'Content-Type: application/json' \
  -d "{\"parts\":[{\"offerId\":\"$O1\",\"positionIdx\":0,\"qty\":2},{\"offerId\":\"$O1\",\"positionIdx\":1,\"qty\":1},{\"offerId\":\"$O2\",\"positionIdx\":null,\"qty\":0.5}]}" \
  | python -c "import sys,json;d=json.load(sys.stdin);s=json.loads(d['offerPositionSnapshot']);print('budget',d['budgetedPriceNetto'],'offerId',d['offerId'],'idx',d['offerPositionIdx']);print('lp',s['lp']);[print(' ',p['lp'],p['name'][:40],p['priceNetto'],'x',p['qty']) for p in s['parts']]"
docker exec -i erp-db psql -U postgres -d erp_db -At -c "select \"positionIdx\", qty from material_requirement_offer_parts where \"materialRequirementId\"='$REQ' order by \"sortOrder\""
echo "--- single position qty=1 -> legacy path"
curl -s -X PUT $API/material-requirements/$REQ/offer-parts -H "$H" -H 'Content-Type: application/json' \
  -d "{\"parts\":[{\"offerId\":\"$O1\",\"positionIdx\":2,\"qty\":1}]}" | python -c "import sys,json;d=json.load(sys.stdin);print('budget',d['budgetedPriceNetto'],'idx',d['offerPositionIdx'])"
docker exec -i erp-db psql -U postgres -d erp_db -At -c "select count(*) from material_requirement_offer_parts where \"materialRequirementId\"='$REQ'"
echo "--- bad qty"
curl -s -X PUT $API/material-requirements/$REQ/offer-parts -H "$H" -H 'Content-Type: application/json' -d "{\"parts\":[{\"offerId\":\"$O1\",\"positionIdx\":0,\"qty\":0},{\"offerId\":\"$O1\",\"positionIdx\":1}]}"; echo
echo "--- empty -> remove"
curl -s -X PUT $API/material-requirements/$REQ/offer-parts -H "$H" -H 'Content-Type: application/json' -d '{"parts":[]}' | python -c "import sys,json;d=json.load(sys.stdin);print('offerId',d['offerId'])"
# przywróć stan wyjściowy
docker exec -i erp-db psql -U postgres -d erp_db -At -c "update material_requirements set \"budgetedPriceNetto\"=null, \"materialId\"=$( [ "$ORIG_MAT" = NULL ] && echo null || echo "'$ORIG_MAT'") where id='$REQ' and \"offerId\" is null" >/dev/null
