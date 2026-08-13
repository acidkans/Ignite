// Dni bez sobot i niedziel + wymagalnosc rodzaju urlopu i dat.
// Daty wysylane tak jak robi to UI: lokalna polnoc -> ISO UTC (22:00 dnia poprzedniego latem).
const jwt = require('../apps/backend/node_modules/jsonwebtoken');
const fs=require('fs'), path=require('path');
const env=Object.fromEntries(fs.readFileSync(path.join(__dirname,'..','apps','backend','.env'),'utf8').split(/\r?\n/).filter(l=>l.includes('=')&&!l.trim().startsWith('#')).map(l=>[l.slice(0,l.indexOf('=')).trim(),l.slice(l.indexOf('=')+1).trim()]));
const API='http://127.0.0.1:3005/api';
const tok=(s)=>jwt.sign({sub:s,email:'t@d'},env.JWT_SECRET||'supersecretkey',{expiresIn:'10m'});
const call=async(u,m,url,b)=>{const r=await fetch(API+url,{method:m,headers:{Authorization:`Bearer ${tok(u)}`,'Content-Type':'application/json'},body:b?JSON.stringify(b):undefined});let d=null;try{d=await r.json()}catch{};return{status:r.status,data:d};};

// lokalna polnoc/23:59 w Europe/Warsaw -> ISO (tak jak new Date('YYYY-MM-DDTHH:mm').toISOString() w przegladarce)
const localStart=(day)=>new Date(`${day}T00:00:00+02:00`).toISOString();
const localEnd=(day)=>new Date(`${day}T23:59:00+02:00`).toISOString();

(async()=>{
  const [admin, worker]=process.argv.slice(2);
  const types=(await call(admin,'GET','/leaves/types')).data;
  const wyp=types.find(t=>t.code==='WYPOCZYNKOWY');
  const created=[];

  const cases=[
    ['wt-sr 11-12.08 (bez weekendu)','2026-08-11','2026-08-12',2],
    ['pt-pn 14-17.08 (sob+nd w srodku)','2026-08-14','2026-08-17',2],
    ['pon-pt 10-14.08 (pelny tydzien)','2026-08-10','2026-08-14',5],
    ['pon-nd 10-16.08','2026-08-10','2026-08-16',5],
    ['sama sobota 15.08','2026-08-15','2026-08-15',0],
  ];
  for (const [label,from,to,expected] of cases){
    const r=await call(worker,'POST','/leave-requests',{leaveTypeId:wyp.id,dateStart:localStart(from),dateEnd:localEnd(to)});
    created.push(r.data?.id);
    const got=r.data?.daysCount;
    console.log(`${label.padEnd(36)} dni=${got} (oczekiwane ${expected}) ${got===expected?'OK':'BLAD'}`);
  }

  console.log('\nwymagalnosc pol:');
  const noType=await call(worker,'POST','/leave-requests',{dateStart:localStart('2026-08-18'),dateEnd:localEnd('2026-08-19')});
  console.log('  bez rodzaju urlopu ->', noType.status, '|', noType.data?.message);
  const noDates=await call(worker,'POST','/leave-requests',{leaveTypeId:wyp.id});
  console.log('  bez dat            ->', noDates.status, '|', noDates.data?.message);
  const reversed=await call(worker,'POST','/leave-requests',{leaveTypeId:wyp.id,dateStart:localStart('2026-08-20'),dateEnd:localEnd('2026-08-18')});
  console.log('  data do < od       ->', reversed.status, '|', reversed.data?.message);
  const clearType=await call(admin,'PATCH',`/leave-requests/${created[0]}`,{leaveTypeId:null});
  console.log('  edycja: kasowanie rodzaju ->', clearType.status, '|', clearType.data?.message);

  for (const id of created) if (id) await call(admin,'DELETE',`/leave-requests/${id}`);
  console.log('\nsprzatanie ok');
})();
