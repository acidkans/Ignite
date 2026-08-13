// Sprawdza, czy pytający zawsze widzi siebie na liście /leaves/employees (dla zakładki Moje dane).
const jwt = require('../apps/backend/node_modules/jsonwebtoken');
const fs=require('fs'), path=require('path');
const env=Object.fromEntries(fs.readFileSync(path.join(__dirname,'..','apps','backend','.env'),'utf8').split(/\r?\n/).filter(l=>l.includes('=')&&!l.trim().startsWith('#')).map(l=>[l.slice(0,l.indexOf('=')).trim(),l.slice(l.indexOf('=')+1).trim()]));
const API='http://127.0.0.1:3005/api';
const tok=(s)=>jwt.sign({sub:s,email:'t@d'},env.JWT_SECRET||'supersecretkey',{expiresIn:'10m'});
(async()=>{
  const admin=process.argv[2];
  const r=await fetch(API+'/leaves/employees',{headers:{Authorization:`Bearer ${tok(admin)}`}});
  const list=await r.json();
  console.log('status',r.status,'| pracownikow:',list.length,'| admin jest na liscie:',list.some(u=>u.id===admin));
  console.log('   admin:', list.filter(u=>u.id===admin).map(u=>`${u.firstName} ${u.lastName} <${u.email}> firma=${u.company||'brak'}`).join(''));
})();
