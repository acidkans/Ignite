// Sprawdza, czy przełożony widzi wpisy podwładnego (scope SUBORDINATES).
const jwt = require('../apps/backend/node_modules/jsonwebtoken');
const fs = require('fs'), path = require('path');
const env = Object.fromEntries(fs.readFileSync(path.join(__dirname,'..','apps','backend','.env'),'utf8').split(/\r?\n/).filter(l=>l.includes('=')&&!l.trim().startsWith('#')).map(l=>[l.slice(0,l.indexOf('=')).trim(), l.slice(l.indexOf('=')+1).trim()]));
const API='http://127.0.0.1:3005/api', SECRET=env.JWT_SECRET||'supersecretkey';
const tok=(sub)=>jwt.sign({sub,email:'test@dev'},SECRET,{expiresIn:'10m'});
const call=async(u,m,url,b)=>{const r=await fetch(API+url,{method:m,headers:{Authorization:`Bearer ${tok(u)}`,'Content-Type':'application/json'},body:b?JSON.stringify(b):undefined});return{status:r.status,data:await r.json().catch(()=>null)};};
(async()=>{
  const [admin,manager,user]=process.argv.slice(2);
  const types=(await call(admin,'GET','/leaves/types')).data;
  const c=await call(admin,'POST','/leaves',{userId:user,leaveTypeId:types[0].id,dateFrom:'2026-09-07',dateTo:'2026-09-11'});
  console.log('utworzono wpis podwladnego, daysCount(auto) =', c.data.daysCount);
  const sup=await call(manager,'GET',`/leaves?leaveTypeId=${types[0].id}`);
  console.log('przelozony widzi wpisow:', sup.data.length, '| pracownik:', sup.data[0]?.user?.lastName);
  const emp=await call(manager,'GET','/leaves/employees');
  console.log('lista pracownikow dla przelozonego:', emp.data.map(e=>e.email).join(', '));
  console.log('sprzatanie:', (await call(admin,'DELETE',`/leaves/${c.data.id}`)).status);
})();
