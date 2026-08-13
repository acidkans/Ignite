// Test przepływu wniosków urlopowych: składanie, widoczność, zatwierdzanie, dashboard.
const jwt = require('../apps/backend/node_modules/jsonwebtoken');
const fs = require('fs'), path = require('path');
const env = Object.fromEntries(fs.readFileSync(path.join(__dirname,'..','apps','backend','.env'),'utf8').split(/\r?\n/).filter(l=>l.includes('=')&&!l.trim().startsWith('#')).map(l=>[l.slice(0,l.indexOf('=')).trim(), l.slice(l.indexOf('=')+1).trim()]));
const API='http://127.0.0.1:3005/api', SECRET=env.JWT_SECRET||'supersecretkey';
const tok=(sub)=>jwt.sign({sub,email:'test@dev'},SECRET,{expiresIn:'10m'});
const call=async(u,m,url,b)=>{const r=await fetch(API+url,{method:m,headers:{Authorization:`Bearer ${tok(u)}`,'Content-Type':'application/json'},body:b?JSON.stringify(b):undefined});let d=null;try{d=await r.json()}catch{};return{status:r.status,data:d};};

(async()=>{
  const [admin, manager, worker] = process.argv.slice(2);
  const types = (await call(admin,'GET','/leaves/types')).data;

  console.log('1) pracownik sklada wlasny wniosek');
  const created = await call(worker,'POST','/leave-requests',{
    leaveTypeId: types[0].id, daysCount: 4,
    dateStart:'2026-08-25T00:00:00.000Z', dateEnd:'2026-08-28T23:59:59.000Z',
    comment:'urlop testowy', remainingCurrentYear: 19,
  });
  console.log('   status', created.status, '| rodzaj:', created.data?.leaveType?.name, '| dni:', created.data?.daysCount, '| zlozono:', !!created.data?.submittedAt);
  const id = created.data?.id;

  console.log('2) pracownik widzi swoj wniosek');
  const mine = await call(worker,'GET','/leave-requests/mine');
  console.log('   status', mine.status, '| moich wnioskow:', mine.data?.length);

  console.log('3) przelozony widzi wniosek podwladnego');
  const subs = await call(manager,'GET','/leave-requests/subordinates');
  console.log('   status', subs.status, '| wnioskow podwladnych:', subs.data?.length, '| autor:', subs.data?.[0]?.user?.lastName);

  console.log('4) pracownik probuje zatwierdzic wlasny wniosek (oczekiwane 403)');
  const selfApprove = await call(worker,'PATCH',`/leave-requests/${id}`,{approvedAt:new Date().toISOString()});
  console.log('   status', selfApprove.status, '|', selfApprove.data?.message);

  console.log('5) przelozony zatwierdza');
  const approved = await call(manager,'PATCH',`/leave-requests/${id}`,{approvedAt:new Date().toISOString()});
  console.log('   status', approved.status, '| zatwierdzony:', !!approved.data?.approvedAt);

  console.log('6) pracownik probuje edytowac zatwierdzony (oczekiwane 403)');
  const late = await call(worker,'PATCH',`/leave-requests/${id}`,{comment:'zmiana'});
  console.log('   status', late.status, '|', late.data?.message);

  console.log('7) dashboard pracownika');
  const dash = await call(worker,'GET','/leave-requests/dashboard');
  console.log('   status', dash.status, '| saldo z tego roku:', dash.data?.balance?.remainingCurrentYear, '| wnioskow w tabeli:', dash.data?.requests?.length, '| pracownik:', dash.data?.subject?.email);

  console.log('8) przelozony oglada dashboard podwladnego');
  const dash2 = await call(manager,'GET',`/leave-requests/dashboard?userId=${worker}`);
  console.log('   status', dash2.status, '| podmiot:', dash2.data?.subject?.email, '| przelozony:', dash2.data?.subject?.supervisorName);

  console.log('9) pracownik probuje ogladac dashboard przelozonego (oczekiwane 403)');
  const dash3 = await call(worker,'GET',`/leave-requests/dashboard?userId=${manager}`);
  console.log('   status', dash3.status, '|', dash3.data?.message);

  console.log('10) sprzatanie:', (await call(admin,'DELETE',`/leave-requests/${id}`)).status);
})();
