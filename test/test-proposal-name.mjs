import { composeProposalName } from '../apps/frontend/src/components/shared/wbs/proposalName.js';

const katalog = [
    { manufacturer: 'ACME', model: 'XYZ-100', productName: 'ACME Switch XYZ-100 24p' },
    { manufacturer: 'ACME', model: 'XYZ-200', productName: 'ACME Switch XYZ-200 48p' },
    { manufacturer: 'BETA', model: null,       productName: 'BETA uchwyt uniwersalny' },
];

let bledy = 0;
const sprawdz = (opis, wynik, oczekiwane) => {
    const ok = wynik === oczekiwane;
    if (!ok) bledy++;
    console.log(`${ok ? 'OK  ' : 'BLAD'} ${opis}\n       got:  ${JSON.stringify(wynik)}\n       want: ${JSON.stringify(oczekiwane)}`);
};

sprawdz('wpisana nazwa handlowa ma pierwszenstwo',
    composeProposalName({ productName: 'Wlasna nazwa', manufacturer: 'ACME', model: 'XYZ-100' }, katalog),
    'Wlasna nazwa');

sprawdz('producent + model znane w katalogu -> nazwa handlowa z katalogu',
    composeProposalName({ productName: '', manufacturer: 'ACME', model: 'XYZ-200' }, katalog),
    'ACME Switch XYZ-200 48p');

sprawdz('dopasowanie bez wzgledu na wielkosc liter',
    composeProposalName({ productName: '', manufacturer: 'acme', model: 'xyz-100' }, katalog),
    'ACME Switch XYZ-100 24p');

sprawdz('producent + model spoza katalogu -> zlozenie',
    composeProposalName({ productName: '', manufacturer: 'GAMMA', model: 'Q-9' }, katalog),
    'GAMMA Q-9');

sprawdz('sam producent spoza katalogu -> sam producent',
    composeProposalName({ productName: '', manufacturer: 'GAMMA', model: '' }, katalog),
    'GAMMA');

sprawdz('sam producent znany w katalogu -> nazwa z katalogu',
    composeProposalName({ productName: '', manufacturer: 'BETA', model: '' }, katalog),
    'BETA uchwyt uniwersalny');

sprawdz('brak producenta -> pusto (wolajacy pokaze komunikat)',
    composeProposalName({ productName: '', manufacturer: '', model: 'XYZ-100' }, katalog),
    '');

sprawdz('biale znaki nie robia nazwy',
    composeProposalName({ productName: '   ', manufacturer: '  ACME ', model: ' XYZ-100 ' }, katalog),
    'ACME Switch XYZ-100 24p');

sprawdz('pusty katalog nie wywraca skladania',
    composeProposalName({ productName: '', manufacturer: 'ACME', model: 'XYZ-100' }, null),
    'ACME XYZ-100');

console.log(bledy === 0 ? '\nWszystkie testy OK' : `\n${bledy} bledow`);
process.exit(bledy === 0 ? 0 : 1);
