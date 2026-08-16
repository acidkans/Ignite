import { useState, useEffect, useCallback } from 'react';
import { ChevronDown, Plus, Search, Loader2, CheckCircle2, XCircle, X } from 'lucide-react';
import { API_URL } from '../../config';

// @anchor supplier-picker-theme
// Zestawy klas dla jasnego (domyślnego) i ciemnego wariantu — ciemny używany
// w panelach ofert (DocumentViewer/OffersTab, tło #0f1117).
const THEMES = {
  light: {
    trigger: 'border-gray-300 bg-white hover:border-gray-400',
    triggerText: 'text-gray-900',
    triggerPlaceholder: 'text-gray-400',
    dropdown: 'bg-white border-gray-200',
    divider: 'border-gray-100',
    input: 'border-gray-300 bg-white text-gray-900',
    item: 'hover:bg-gray-50',
    itemSelected: 'bg-teal-50',
    itemText: 'text-gray-900',
    preview: 'bg-gray-50',
    previewName: 'text-gray-900',
    addNip: 'text-teal-700 hover:bg-teal-50',
    addFree: 'text-gray-600 hover:bg-gray-50',
    clear: 'text-gray-400 hover:text-gray-700 hover:bg-gray-100',
  },
  dark: {
    trigger: 'border-white/10 bg-black/40 hover:border-white/25',
    triggerText: 'text-gray-200',
    triggerPlaceholder: 'text-gray-500',
    dropdown: 'bg-[#0f1117] border-white/10',
    divider: 'border-white/5',
    input: 'border-white/10 bg-black/40 text-gray-200',
    item: 'hover:bg-white/5',
    itemSelected: 'bg-teal-500/10',
    itemText: 'text-gray-200',
    preview: 'bg-white/5',
    previewName: 'text-gray-200',
    addNip: 'text-teal-300 hover:bg-teal-500/10',
    addFree: 'text-gray-400 hover:bg-white/5',
    clear: 'text-gray-500 hover:text-gray-200 hover:bg-white/10',
  },
};

// @anchor supplier-picker
// Dropdown wyboru dostawcy z rejestru + tworzenie przez NIP (Biała lista VAT)
// albo wolny wpis (dostawca zagraniczny bez NIP — wystarczy nazwa).
// Reużywalny: modal uploadu oferty (F2), panel dostawcy w ProductCard (F6).
// value: supplierId | null; onChange(supplier | null)
// @anchor supplier-picker-text-class — rozmiar czcionki całego pickera (trigger + lista).
// Domyślnie `text-sm`; wiersze wpisów zakupu podają własny, żeby dropdown nie odstawał
// od pól obok — tam wszystkie okna wpisu mają jeden rozmiar.
// @anchor supplier-picker-size — gęstość triggera dopasowana do pól, obok których picker stoi.
// `md` (domyślne) to modal uploadu oferty, `sm` — karta produktu (pola `py-1.5 text-xs`),
// `xs` — wiersz propozycji produktu (pola `py-0.5`, tekst `text-xs` jak w karcie). Zmienia WYŁĄCZNIE wygląd
// triggera; lista, NIP z Białej listy i wolny wpis działają tak samo w każdym rozmiarze,
// bo to jeden i ten sam wybór dostawcy co przy zakupie.
const SIZES = {
  md: { trigger: 'gap-2 py-2 pl-3 rounded-lg',    padded: 'pr-12',  bare: 'pr-3',   clear: 'right-8 p-1',    chevron: 16, x: 14 },
  sm: { trigger: 'gap-1.5 py-1.5 pl-2 rounded',   padded: 'pr-9',   bare: 'pr-2',   clear: 'right-6 p-0.5',  chevron: 13, x: 12 },
  xs: { trigger: 'gap-1 py-0.5 pl-1.5 rounded',   padded: 'pr-7',   bare: 'pr-1.5', clear: 'right-4 p-0.5',  chevron: 11, x: 10 },
};

// @anchor supplier-picker-placeholder — tekst pustego triggera. Domyślnie „Wybierz dostawcę…";
// przy produkcie mówi „Oferent produktu…", bo tam rejestruje się KTO NAM ZAOFERTOWAŁ,
// co nie przesądza, u kogo ostatecznie kupimy.
export default function SupplierPicker({
  value, onChange, disabled = false, dark = false, textClass = 'text-sm',
  size = 'md', placeholder = 'Wybierz dostawcę…',
}) {
  const t = THEMES[dark ? 'dark' : 'light'];
  const sz = SIZES[size] || SIZES.md;
  const [suppliers, setSuppliers] = useState([]);
  const [open, setOpen] = useState(false);
  // @anchor supplier-picker-query
  const [query, setQuery] = useState('');
  // @anchor supplier-picker-create-mode
  const [createMode, setCreateMode] = useState(false); // false | 'nip' | 'free'
  // @anchor supplier-picker-nip-input
  const [nipInput, setNipInput] = useState('');
  // @anchor supplier-picker-free-name
  const [freeName, setFreeName] = useState('');
  // @anchor supplier-picker-nip-preview
  const [nipPreview, setNipPreview] = useState(null); // {nip, name, address, regon, vatStatus}
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const authHeaders = () => ({
    Authorization: `Bearer ${sessionStorage.getItem('token') || localStorage.getItem('token')}`,
    'Content-Type': 'application/json',
  });

  // @anchor supplier-picker-fetch
  const fetchSuppliers = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/suppliers`, { headers: authHeaders() });
      if (res.ok) setSuppliers(await res.json());
    } catch { /* lista zostaje pusta */ }
  }, []);

  useEffect(() => { fetchSuppliers(); }, [fetchSuppliers]);

  const selected = suppliers.find((s) => s.id === value) || null;
  const filtered = query
    ? suppliers.filter((s) => `${s.name} ${s.nip || ''}`.toLowerCase().includes(query.toLowerCase()))
    : suppliers;

  // @anchor supplier-picker-nip-lookup
  const handleNipLookup = async () => {
    setBusy(true); setError(''); setNipPreview(null);
    try {
      const res = await fetch(`${API_URL}/suppliers/nip-lookup/${encodeURIComponent(nipInput.trim())}`, { headers: authHeaders() });
      const data = await res.json();
      if (!res.ok) { setError(data?.message || 'Nie znaleziono w Białej liście VAT'); return; }
      setNipPreview(data);
    } catch {
      setError('Biała lista VAT niedostępna');
    } finally {
      setBusy(false);
    }
  };

  // @anchor supplier-picker-create
  const handleCreate = async () => {
    setBusy(true); setError('');
    try {
      const body = createMode === 'nip' ? { nip: nipPreview.nip } : { name: freeName.trim() };
      const res = await fetch(`${API_URL}/suppliers`, { method: 'POST', headers: authHeaders(), body: JSON.stringify(body) });
      const data = await res.json();
      if (!res.ok) { setError(data?.message || 'Nie udało się utworzyć dostawcy'); return; }
      await fetchSuppliers();
      onChange?.(data);
      resetCreate(); setOpen(false);
    } catch {
      setError('Błąd zapisu dostawcy');
    } finally {
      setBusy(false);
    }
  };

  const resetCreate = () => { setCreateMode(false); setNipInput(''); setFreeName(''); setNipPreview(null); setError(''); };

  // @anchor supplier-picker-clear — wyczyszczenie wyboru: pole wraca do pustego
  // („Wybierz dostawcę…"), consumer dostaje `onChange(null)`. Dwie drogi: krzyżyk
  // przy wybranej wartości i przycisk „bez dostawcy" w wierszu skrótów nad listą.
  const clearSupplier = () => { onChange?.(null); setOpen(false); resetCreate(); };
  const clearable = !!selected && !disabled;

  return (
    <div className={`relative ${textClass}`}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => { setOpen(!open); resetCreate(); }}
        title={selected ? `${selected.name}${selected.nip ? ` (NIP ${selected.nip})` : ''}` : placeholder}
        className={`w-full flex items-center justify-between border disabled:opacity-50 disabled:cursor-not-allowed ${t.trigger} ${sz.trigger} ${clearable ? sz.padded : sz.bare}`}
      >
        <span className={`truncate ${selected ? t.triggerText : t.triggerPlaceholder}`}>
          {selected ? `${selected.name}${selected.nip ? ` (NIP ${selected.nip})` : ''}` : placeholder}
        </span>
        <ChevronDown size={sz.chevron} className="text-gray-400 shrink-0" />
      </button>
      {clearable && (
        <button
          type="button"
          onClick={clearSupplier}
          title="Usuń dostawcę"
          aria-label="Usuń dostawcę"
          className={`absolute top-1/2 -translate-y-1/2 rounded transition-colors ${t.clear} ${sz.clear}`}
        >
          <X size={sz.x} />
        </button>
      )}

      {/* min-w-[220px]: przy wąskim triggerze (wiersz propozycji, karta produktu) panel
          rozszerza się poza pole, żeby wiersz trzech skrótów i nazwy dostawców się mieściły. */}
      {open && (
        <div className={`absolute z-50 mt-1 w-full min-w-[220px] border rounded-lg shadow-lg overflow-hidden ${t.dropdown}`}>
          {!createMode && (
            <>
              <div className={`flex items-center gap-2 px-3 py-2 border-b ${t.divider}`}>
                <Search size={14} className="text-gray-400 shrink-0" />
                <input
                  autoFocus
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Szukaj po nazwie lub NIP…"
                  className={`w-full outline-none ${textClass} bg-transparent ${t.triggerText}`}
                />
              </div>
              {/* Tworzenie dostawcy stoi NAD listą — gdy kogoś w rejestrze nie ma, szuka się go
                  krótko i od razu dopisuje; przy długiej liście przyciski na dole były poza ekranem.
                  Trzy skróty (NIP / wolny wpis / brak dostawcy) w JEDNYM wierszu — dropdown bywa
                  wąski (wiersz wpisu zakupu), więc etykiety są skrócone, pełne w `title`. */}
              <div className={`border-b flex items-stretch text-xs ${t.divider}`}>
                <button type="button" title="Dodaj dostawcę po NIP (Biała lista VAT)" onClick={() => { resetCreate(); setCreateMode('nip'); }} className={`flex-1 min-w-0 flex items-center justify-center gap-1 px-1.5 py-2 whitespace-nowrap ${t.addNip}`}>
                  <Plus size={12} className="shrink-0" /> po NIP
                </button>
                <button type="button" title="Wolny wpis — dostawca bez NIP (np. zagraniczny)" onClick={() => { resetCreate(); setCreateMode('free'); }} className={`flex-1 min-w-0 flex items-center justify-center gap-1 px-1.5 py-2 whitespace-nowrap border-l ${t.divider} ${t.addFree}`}>
                  <Plus size={12} className="shrink-0" /> bez NIP
                </button>
                <button type="button" title="Wyczyść — bez dostawcy" onClick={clearSupplier} className={`flex-1 min-w-0 flex items-center justify-center px-1.5 py-2 whitespace-nowrap border-l ${t.divider} ${t.addFree} ${value ? '' : t.itemSelected}`}>
                  <span className="italic text-gray-500">bez dostawcy</span>
                </button>
              </div>
              <div className="max-h-48 overflow-y-auto">
                {filtered.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => { onChange?.(s); setOpen(false); }}
                    className={`w-full text-left px-3 py-2 ${t.item} ${s.id === value ? t.itemSelected : ''}`}
                  >
                    <span className={s.isActive ? t.itemText : 'text-gray-500 line-through'}>{s.name}</span>
                    {s.nip && <span className="ml-2 text-xs text-gray-400">NIP {s.nip}</span>}
                    {s.vatStatus && (
                      <span className={`ml-2 text-xs ${s.vatStatus === 'Czynny' ? 'text-teal-500' : 'text-amber-500'}`}>{s.vatStatus}</span>
                    )}
                  </button>
                ))}
                {filtered.length === 0 && <div className="px-3 py-2 text-gray-400">Brak dostawców</div>}
              </div>
            </>
          )}

          {createMode === 'nip' && (
            <div className="p-3 space-y-2">
              <div className="flex gap-2">
                <input
                  autoFocus
                  value={nipInput}
                  onChange={(e) => setNipInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && !busy && nipInput.trim() && handleNipLookup()}
                  placeholder="NIP (10 cyfr)"
                  className={`flex-1 px-2 py-1.5 border rounded outline-none focus:border-teal-500 ${t.input}`}
                />
                <button type="button" onClick={handleNipLookup} disabled={busy || !nipInput.trim()} className="px-3 py-1.5 bg-teal-600 text-white rounded disabled:opacity-50">
                  {busy ? <Loader2 size={14} className="animate-spin" /> : 'Pobierz'}
                </button>
              </div>
              {nipPreview && (
                <div className={`p-2 rounded text-xs space-y-1 ${t.preview}`}>
                  <div className={`font-medium ${t.previewName}`}>{nipPreview.name}</div>
                  {nipPreview.address && <div className="text-gray-500">{nipPreview.address}</div>}
                  <div className={`flex items-center gap-1 ${t.itemText}`}>
                    {nipPreview.vatStatus === 'Czynny'
                      ? <CheckCircle2 size={12} className="text-teal-500" />
                      : <XCircle size={12} className="text-amber-500" />}
                    <span>VAT: {nipPreview.vatStatus || 'brak statusu'}</span>
                  </div>
                  <button type="button" onClick={handleCreate} disabled={busy} className="mt-1 w-full px-2 py-1.5 bg-teal-600 text-white rounded disabled:opacity-50">
                    Utwórz dostawcę
                  </button>
                </div>
              )}
              {error && <div className="text-xs text-red-500">{error}</div>}
              <button type="button" onClick={resetCreate} className="text-xs text-gray-400 hover:text-gray-500">← wróć do listy</button>
            </div>
          )}

          {createMode === 'free' && (
            <div className="p-3 space-y-2">
              <input
                autoFocus
                value={freeName}
                onChange={(e) => setFreeName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && !busy && freeName.trim() && handleCreate()}
                placeholder="Nazwa dostawcy (np. zagraniczny bez NIP)"
                className={`w-full px-2 py-1.5 border rounded outline-none focus:border-teal-500 ${t.input}`}
              />
              <button type="button" onClick={handleCreate} disabled={busy || !freeName.trim()} className="w-full px-2 py-1.5 bg-teal-600 text-white rounded disabled:opacity-50">
                Utwórz dostawcę
              </button>
              {error && <div className="text-xs text-red-500">{error}</div>}
              <button type="button" onClick={resetCreate} className="text-xs text-gray-400 hover:text-gray-500">← wróć do listy</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
