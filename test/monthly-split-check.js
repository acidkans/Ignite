// Sprawdzenie logiki rozbicia urlopu na miesiace — kopia splitDaysIntoMonths z leaves.service.ts
function monthKey(ms){const d=new Date(ms);return `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}`;}
function split(fromStr,toStr,daysCount){
  const from=new Date(fromStr),to=new Date(toStr);
  const start=Date.UTC(from.getUTCFullYear(),from.getUTCMonth(),from.getUTCDate());
  const end=Date.UTC(to.getUTCFullYear(),to.getUTCMonth(),to.getUTCDate());
  if(isNaN(start)||isNaN(end)||end<start)return{months:{},workingDays:0};
  const perMonth={};let workingDays=0;
  for(let ms=start;ms<=end;ms+=86400000){const dow=new Date(ms).getUTCDay();if(dow===0||dow===6)continue;
    const k=monthKey(ms);perMonth[k]=(perMonth[k]||0)+1;workingDays++;}
  if(workingDays===0){for(let ms=start;ms<=end;ms+=86400000){const k=monthKey(ms);perMonth[k]=(perMonth[k]||0)+1;workingDays++;}}
  const keys=Object.keys(perMonth);const months={};let assigned=0;
  keys.forEach((k,i)=>{if(i===keys.length-1){months[k]=Math.round((daysCount-assigned)*100)/100;return;}
    const share=Math.round((daysCount*perMonth[k]/workingDays)*100)/100;months[k]=share;assigned=Math.round((assigned+share)*100)/100;});
  return{months,workingDays,perMonth};
}
const cases=[
  ['jeden miesiac','2026-07-06','2026-07-10',5],
  ['przelom miesiecy','2026-06-29','2026-07-03',5],
  ['przelom roku','2026-12-28','2027-01-05',7],
  ['caly weekend','2026-07-04','2026-07-05',2],
  ['reczny wymiar mniejszy','2026-06-29','2026-07-03',2.5],
  ['jeden dzien','2026-07-15','2026-07-15',1],
  ['trzy miesiace','2026-05-25','2026-07-10',35],
];
let bad=0;
for(const [name,f,t,d] of cases){
  const r=split(f,t,d);
  const sum=Math.round(Object.values(r.months).reduce((a,b)=>a+b,0)*100)/100;
  const ok=Math.abs(sum-d)<0.001;
  if(!ok)bad++;
  console.log(`${ok?'OK ':'BLAD'} | ${name.padEnd(24)} | ${f}..${t} | daysCount=${d} | dni robocze=${r.workingDays} | ${JSON.stringify(r.months)} | suma=${sum}`);
}
console.log(bad?`\n${bad} przypadkow nie sumuje sie do daysCount`:'\nWszystkie sumy zgadzaja sie z daysCount');
