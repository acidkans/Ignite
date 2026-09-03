# Kontrola eksportu Excel z zakładki Realizacja po dołożeniu kolumn statusowych.
# Uruchomienie: python test/sprawdz-eksport-statusy.py <plik.xlsx>
#
# Sprawdza dwie rzeczy, które łatwo popsuć jednym wstawionym nagłówkiem:
#   1. czy trzy kolumny statusów stoją tam, gdzie mają (P, Q, R),
#   2. czy formuły odwołujące się do kolumn ZA nimi przesunęły się razem z nimi
#      (suma „Wpisy" → T, licznik rozliczonych w arkuszu „Podsumowanie" → S).
import sys
import zipfile
import re
import xml.etree.ElementTree as ET

NS = '{http://schemas.openxmlformats.org/spreadsheetml/2006/main}'
sciezka = sys.argv[1]
zf = zipfile.ZipFile(sciezka)

wb = ET.fromstring(zf.read('xl/workbook.xml'))
arkusze = {s.get('name'): s.get(
    '{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id')
    for s in wb.iter(NS + 'sheet')}
rels = ET.fromstring(zf.read('xl/_rels/workbook.xml.rels'))
cel = {r.get('Id'): r.get('Target') for r in rels}


def plik(nazwa):
    t = cel[arkusze[nazwa]]
    return 'xl/' + t.lstrip('/') if not t.startswith('xl/') else t


shared = []
if 'xl/sharedStrings.xml' in zf.namelist():
    ss = ET.fromstring(zf.read('xl/sharedStrings.xml'))
    shared = [''.join(t.text or '' for t in si.iter(NS + 't')) for si in ss.iter(NS + 'si')]


def wartosc(c):
    v = c.find(NS + 'v')
    if v is None:
        return ''
    if c.get('t') == 's':
        return shared[int(v.text)]
    return v.text


def wiersze(nazwa):
    sh = ET.fromstring(zf.read(plik(nazwa)))
    out = {}
    for row in sh.iter(NS + 'row'):
        kom = {}
        for c in row.iter(NS + 'c'):
            ref = c.get('r')
            kol = re.match(r'[A-Z]+', ref).group(0)
            f = c.find(NS + 'f')
            kom[kol] = {'v': wartosc(c), 'f': (f.text if f is not None else None)}
        out[int(row.get('r'))] = kom
    return out


bledy = []


def sprawdz(nazwa, got, want):
    ok = got == want
    if not ok:
        bledy.append(nazwa)
    print(f"{'OK  ' if ok else 'FAIL'} {nazwa}" + ('' if ok else f"\n     otrzymano: {got!r}\n     oczekiwano: {want!r}"))


r = wiersze('Realizacja')
naglowki = {k: v['v'] for k, v in r[1].items()}

sprawdz('nagłówek P = Status oferty', naglowki.get('P'), 'Status oferty')
sprawdz('nagłówek Q = Status zakupu', naglowki.get('Q'), 'Status zakupu')
sprawdz('nagłówek R = Status wykonania', naglowki.get('R'), 'Status wykonania')
sprawdz('nagłówek S = Rozliczone', naglowki.get('S'), 'Rozliczone')
sprawdz('nagłówek T = Wpisy', naglowki.get('T'), 'Wpisy')
sprawdz('nagłówek U = Komentarz', naglowki.get('U'), 'Komentarz')

# Kolumny liczbowe PRZED statusami nie mogły się ruszyć — na nich stoją formuły wierszy.
sprawdz('nagłówek M = Koszt całk. wyceny', naglowki.get('M'), 'Koszt całk. wyceny')
sprawdz('nagłówek O = Δ wartość', naglowki.get('O'), 'Δ wartość')

# Wiersz „Razem" — ostatni w arkuszu.
ostatni = max(r)
razem = r[ostatni]
sprawdz('wiersz Razem podpisany', razem.get('A', {}).get('v'), 'Razem')
sprawdz('suma „Wpisy" liczy kolumnę T', razem.get('T', {}).get('f'), f'SUM(T2:T{ostatni - 1})')
sprawdz('suma „Δ wartość" nadal na O', razem.get('O', {}).get('f'), f'SUM(O2:O{ostatni - 1})')

# Statusy w wierszach pozycji: żadna komórka nie może być pusta.
puste = [n for n in range(2, ostatni) if not r[n].get('R', {}).get('v')]
sprawdz('każdy wiersz ma status wykonania', puste, [])
puste_z = [n for n in range(2, ostatni) if not r[n].get('Q', {}).get('v')]
sprawdz('każdy wiersz ma status zakupu', puste_z, [])

# Oś, której dany typ liścia NIE MA, musi nieść „—" — a nie pusto ani wartość startową.
# Oś zakupu ma wyłącznie to, co się kupuje ORAZ montuje: materiał i sprzęt. Oś wykonania —
# wszystko poza noclegiem i paliwem, które są czystym kosztem i nie mają żadnej osi.
BEZ_ZAKUPU = ['Praca', 'Usługa', 'Nocleg', 'Paliwo']
BEZ_WYKONANIA = ['Nocleg', 'Paliwo']


def typy(nazwy):
    return [n for n in range(2, ostatni) if r[n].get('C', {}).get('v') in nazwy]


for nazwa in BEZ_ZAKUPU:
    zle = [n for n in typy([nazwa]) if r[n].get('Q', {}).get('v') != '—']
    sprawdz(f'„{nazwa}" ma „—" w kolumnie zakupu', zle, [])
for nazwa in BEZ_WYKONANIA:
    zle = [n for n in typy([nazwa]) if r[n].get('R', {}).get('v') != '—']
    sprawdz(f'„{nazwa}" ma „—" w kolumnie wykonania', zle, [])

# Materiał i sprzęt MUSZĄ mieć obie osie wypełnione treścią — status albo etykietę bramki.
braki = [n for n in typy(['Materiał', 'Sprzęt'])
         if r[n].get('Q', {}).get('v') in ('', '—') or r[n].get('R', {}).get('v') in ('', '—')]
sprawdz('materiał i sprzęt mają obie osie wypełnione', braki, [])

# Arkusz „Podsumowanie" liczy rozliczone po kolumnie S, nie po starej P.
ps = wiersze('Podsumowanie')
formuly = [c['f'] for row in ps.values() for c in row.values() if c['f']]
countifs = [f for f in formuly if f.startswith('COUNTIFS(Realizacja!')]
sprawdz('COUNTIFS istnieje', len(countifs) > 0, True)
sprawdz('COUNTIFS czyta kolumnę S (Rozliczone)',
        all('Realizacja!$S$' in f for f in countifs), True)
sprawdz('żadna formuła nie czyta już Realizacja!$P$ jako Rozliczone',
        [f for f in formuly if 'Realizacja!$P$' in f], [])

print('\nWszystkie testy przeszły.' if not bledy else f'\n{len(bledy)} test(ów) nie przeszło.')
sys.exit(0 if not bledy else 1)
