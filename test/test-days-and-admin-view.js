// Sprawdza liczenie dni z zakresu dat oraz widok "Wnioski" admina (wszyscy + dane wnioskującego).
const jwt = require('../apps/backend/node_modules/jsonwebtoken');
const fs=require('fs'), path=require('path');
const env=Object.fromEntries(fs.readFileSync(path.join(__dirname,'..','apps','backend','.env'),'utf8').split(/\r?\n/).filter(l=>l.includes('=')&&!l.trim().startsWith('#')).map(l=>[l.slice(0,l.indexOf('=')).trim(),l.slice(l.indexOf('=')+1).trim()]));
const API='http://127.0.0.1:3005/api';
const tok=(s)=>jwt.sign({sub:s,email:'t@d'},env.JWT_SECRET||'supersecretkey',{expiresIn:'10m'});
const call=async(u,m,url,b)=>{const r=await fetch(API+url,{method:m,headers:{Authorization:`Bearer ${tok(u)}`,'Content-Type':'application/json'},body:b?JSON.stringify(b):undefined});let d=null;try{d=await r.json()}catch{};return{status:r.status,data:d};};

(async()=>{
  const [admin, worker] = process.argv.slice(2);
  const types=(await call(admin,'GET','/leaves/types')).data;
  const wyp=types.find(t=>t.code==='WYPOCZYNKOWY');
  const created=[];

  const cases=[
    ['11.08 00:00 -> 12.08 23:59','2026-08-11T00:00:00.000Z','2026-08-12T23:59:00.000Z',2],
    ['ten sam dzien','2026-08-11T00:00:00.000Z','2026-08-11T23:59:00.000Z',1],
    ['tydzien 11-17.08','2026-08-11T00:00:00.000Z','2026-08-17T23:59:00.000Z',7],
  ];
  for (const [label,from,to,expected] of cases){
    const r=await call(worker,'POST','/leave-requests',{leaveTypeId:wyp.id,dateStart:from,dateEnd:to});
    created.push(r.data?.id);
    console.log(`${label.padEnd(28)} dni=${r.data?.daysCount} (oczekiwane ${expected}) ${r.data?.daysCount===expected?'OK':'BLAD'}`);
  }

  console.log('recznie podane dni maja pierwszenstwo:');
  const manual=await call(worker,'POST','/leave-requests',{leaveTypeId:wyp.id,dateStart:'2026-08-11T00:00:00.000Z',dateEnd:'2026-08-17T23:59:00.000Z',daysCount:3});
  created.push(manual.data?.id);
  console.log('   dni =', manual.data?.daysCount, manual.data?.daysCount===3?'OK':'BLAD');

  console.log('zmiana dat przeliczana przy edycji:');
  const patched=await call(admin,'PATCH',`/leave-requests/${created[0]}`,{dateEnd:'2026-08-14T23:59:00.000Z'});
  console.log('   dni =', patched.data?.daysCount, '(oczekiwane 4)', patched.data?.daysCount===4?'OK':'BLAD');

  console.log('widok Wnioski admina:');
  const adminView=await call(admin,'GET','/leave-requests/mine');
  const foreign=adminView.data.filter(r=>r.userId!==admin);
  console.log('   wnioskow lacznie:', adminView.data.length, '| cudzych:', foreign.length);
  console.log('   dane wnioskujacego:', foreign[0] ? `${foreign[0].user?.firstName} ${foreign[0].user?.lastName} <${foreign[0].user?.email}> ${foreign[0].user?.company}` : 'brak');

  console.log('widok Wnioski pracownika (tylko swoje):');
  const workerView=await call(worker,'GET','/leave-requests/mine');
  console.log('   wnioskow:', workerView.data.length, '| wszystkie moje:', workerView.data.every(r=>r.userId===worker));

  for (const id of created) if (id) await call(admin,'DELETE',`/leave-requests/${id}`);
  console.log('sprzatanie ok');
})();
