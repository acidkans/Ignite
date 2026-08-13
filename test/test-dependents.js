// Test podopiecznych i walidacji urlopu opiekuńczego.
const jwt = require('../apps/backend/node_modules/jsonwebtoken');
const fs = require('fs'), path = require('path');
const env = Object.fromEntries(fs.readFileSync(path.join(__dirname,'..','apps','backend','.env'),'utf8').split(/\r?\n/).filter(l=>l.includes('=')&&!l.trim().startsWith('#')).map(l=>[l.slice(0,l.indexOf('=')).trim(), l.slice(l.indexOf('=')+1).trim()]));
const API='http://127.0.0.1:3005/api', SECRET=env.JWT_SECRET||'supersecretkey';
const tok=(sub)=>jwt.sign({sub,email:'test@dev'},SECRET,{expiresIn:'10m'});
const call=async(u,m,url,b)=>{const r=await fetch(API+url,{method:m,headers:{Authorization:`Bearer ${tok(u)}`,'Content-Type':'application/json'},body:b?JSON.stringify(b):undefined});let d=null;try{d=await r.json()}catch{};return{status:r.status,data:d};};

(async()=>{
  const [admin, manager, worker] = process.argv.slice(2);
  const types = (await call(admin,'GET','/leaves/types')).data;
  const opieka = types.find(t=>t.code==='OPIEKA');
  const wypoczynkowy = types.find(t=>t.code==='WYPOCZYNKOWY');

  console.log('1) pracownik dodaje podopiecznego');
  const d1 = await call(worker,'POST','/dependents',{firstName:'Jan',lastName:'Kowalski',birthDate:'2018-04-12'});
  console.log('   status', d1.status, '|', d1.data?.firstName, d1.data?.lastName, '| ur.', String(d1.data?.birthDate).slice(0,10));

  console.log('2) wniosek OPIEKA bez podopiecznego (oczekiwane 400)');
  const bad = await call(worker,'POST','/leave-requests',{leaveTypeId:opieka.id,daysCount:1,dateStart:'2026-09-01T00:00:00.000Z',dateEnd:'2026-09-01T23:59:59.000Z'});
  console.log('   status', bad.status, '|', bad.data?.message);

  console.log('3) wniosek OPIEKA z podopiecznym');
  const ok = await call(worker,'POST','/leave-requests',{leaveTypeId:opieka.id,dependentId:d1.data.id,daysCount:1,dateStart:'2026-09-01T00:00:00.000Z',dateEnd:'2026-09-01T23:59:59.000Z'});
  console.log('   status', ok.status, '| podopieczny we wniosku:', ok.data?.dependent?.firstName, ok.data?.dependent?.lastName);

  console.log('4) wniosek WYPOCZYNKOWY bez podopiecznego (ma przejsc)');
  const ok2 = await call(worker,'POST','/leave-requests',{leaveTypeId:wypoczynkowy.id,daysCount:1,dateStart:'2026-09-02T00:00:00.000Z',dateEnd:'2026-09-02T23:59:59.000Z'});
  console.log('   status', ok2.status);

  console.log('5) cudzy podopieczny we wniosku (oczekiwane 400)');
  const dMgr = await call(manager,'POST','/dependents',{firstName:'Ewa',lastName:'Ciesla',birthDate:'2020-01-05'});
  const cross = await call(worker,'POST','/leave-requests',{leaveTypeId:opieka.id,dependentId:dMgr.data.id,daysCount:1,dateStart:'2026-09-03T00:00:00.000Z',dateEnd:'2026-09-03T23:59:59.000Z'});
  console.log('   status', cross.status, '|', cross.data?.message);

  console.log('6) pracownik czyta podopiecznych przelozonego (oczekiwane 403)');
  const peek = await call(worker,'GET',`/dependents?userId=${manager}`);
  console.log('   status', peek.status, '|', peek.data?.message);

  console.log('7) przelozony czyta podopiecznych podwladnego');
  const sup = await call(manager,'GET',`/dependents?userId=${worker}`);
  console.log('   status', sup.status, '| podopiecznych:', sup.data?.length);

  console.log('8) sprzatanie');
  for (const id of [ok.data?.id, ok2.data?.id]) if (id) await call(admin,'DELETE',`/leave-requests/${id}`);
  console.log('   podopieczni:', (await call(worker,'DELETE',`/dependents/${d1.data.id}`)).status, (await call(manager,'DELETE',`/dependents/${dMgr.data.id}`)).status);
})();
