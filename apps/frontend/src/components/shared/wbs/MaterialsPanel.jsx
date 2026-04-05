import React, { useState, useRef, useCallback, useMemo } from 'react';
import { AgGridReact } from 'ag-grid-react';
import {
  ClientSideRowModelModule,
  TextEditorModule,
  NumberEditorModule,
  SelectEditorModule,
  TextFilterModule,
  NumberFilterModule,
  ValidationModule,
  themeQuartz,
} from 'ag-grid-community';
import { Plus, Search, X } from 'lucide-react';
import { TYPE_LABELS, STRUCTURE_COMMON_CELL_CLASS, STRUCTURE_STATUS_META, normalizeStatusCode, fmtQty } from './wbsConstants';

const MODULES = [
  ClientSideRowModelModule,
  TextEditorModule,
  NumberEditorModule,
  SelectEditorModule,
  TextFilterModule,
  NumberFilterModule,
  ValidationModule,
];

const darkTheme = themeQuartz.withParams({
  backgroundColor: '#0a0a0f',
  foregroundColor: '#e5e7eb',
  headerBackgroundColor: '#111118',
  headerTextColor: '#9ca3af',
  rowHoverColor: 'rgba(255,255,255,0.03)',
  borderColor: 'rgba(255,255,255,0.06)',
  cellHorizontalPaddingScale: 0.6,
  fontSize: 13,
  headerFontSize: 12,
  rowHeight: 32,
  headerHeight: 34,
});

export default function MaterialsPanel({ wbsData, nodeId, onDataChange, isManagerOrAdmin = false }) {
  const gridRef = useRef(null);
  const [selectedMaterial, setSelectedMaterial] = useState(null);
  const [proposedProducts, setProposedProducts] = useState([]);
  const [productSearchInput, setProductSearchInput] = useState('');
  const [allProducts, setAllProducts] = useState([]);
  const [loadingProducts, setLoadingProducts] = useState(false);

  // Filtruj materiały (equipment/material)
  const materials = useMemo(() => {
    return (Array.isArray(wbsData) ? wbsData : []).filter((item) => {
      const typeValue = String(item?.type || '').trim().toLowerCase();
      const budgetTypeValue = String(item?.budgetType || '').trim().toUpperCase();
      return (
        typeValue === 'material' ||
        typeValue === 'equipment' ||
        typeValue === 'device' ||
        budgetTypeValue === 'MATERIAL' ||
        budgetTypeValue === 'DEVICE'
      );
    });
  }, [wbsData]);

  // Załaduj dostępne produkty gdy zmieni się wybrany materiał
  const loadProductProposals = useCallback(async (materialId) => {
    if (!materialId) return;

    setLoadingProducts(true);
    try {
      // Szukaj produktów w WBS (węzłów typu product)
      const availableProducts = wbsData.filter(item => item.type === 'product');
      setAllProducts(availableProducts);

      // Załaduj już przypisane produkty dla tego materiału
      const response = await fetch(`/api/wbs-nodes/${materialId}/products`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });

      if (response.ok) {
        const assigned = await response.json();
        setProposedProducts(assigned || []);
      } else {
        setProposedProducts([]);
      }
    } catch (err) {
      console.error('[MaterialsPanel] Error loading products:', err);
      setProposedProducts([]);
    } finally {
      setLoadingProducts(false);
    }
  }, [wbsData]);

  const handleSelectMaterial = useCallback((material) => {
    setSelectedMaterial(material);
    setProductSearchInput('');
    loadProductProposals(material.id);
  }, [loadProductProposals]);

  const handleAddProduct = useCallback(async (product) => {
    if (!selectedMaterial) return;

    try {
      const response = await fetch(`/api/wbs-nodes/${selectedMaterial.id}/products`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productId: product.id, productName: product.name }),
      });

      if (response.ok) {
        const updated = await response.json();
        setProposedProducts(updated || []);
        setProductSearchInput('');
        onDataChange?.();
      }
    } catch (err) {
      console.error('[MaterialsPanel] Error adding product:', err);
    }
  }, [selectedMaterial, onDataChange]);

  const handleRemoveProduct = useCallback(async (productId) => {
    if (!selectedMaterial) return;

    try {
      const response = await fetch(`/api/wbs-nodes/${selectedMaterial.id}/products/${productId}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
      });

      if (response.ok) {
        setProposedProducts(prev => prev.filter(p => p.id !== productId));
        onDataChange?.();
      }
    } catch (err) {
      console.error('[MaterialsPanel] Error removing product:', err);
    }
  }, [selectedMaterial, onDataChange]);

  // Filtruj produkty wg tekstu szukania
  const filteredAvailableProducts = useMemo(() => {
    if (!productSearchInput.trim()) return allProducts;
    const lower = productSearchInput.toLowerCase();
    return allProducts.filter(p =>
      p.name?.toLowerCase().includes(lower) ||
      p.id?.toLowerCase().includes(lower)
    );
  }, [allProducts, productSearchInput]);

  // Kolumny dla tabeli materiałów
  const columnDefs = [
    {
      field: 'name',
      headerName: 'Nazwa',
      flex: 1,
      minWidth: 200,
      cellClass: STRUCTURE_COMMON_CELL_CLASS,
    },
    {
      field: 'type',
      headerName: 'Typ',
      width: 120,
      valueFormatter: (p) => TYPE_LABELS[p.value] || p.value || '',
      cellClass: STRUCTURE_COMMON_CELL_CLASS,
    },
    {
      field: 'status',
      headerName: 'Status',
      width: 130,
      cellRenderer: (p) => {
        const code = normalizeStatusCode(p.value);
        const meta = STRUCTURE_STATUS_META[code] || { label: 'Brak', color: 'text-gray-300' };
        return <span className={`text-xs font-semibold ${meta.color}`}>{meta.label}</span>;
      },
      cellClass: STRUCTURE_COMMON_CELL_CLASS,
    },
    {
      field: 'quantity',
      headerName: 'Ilość',
      width: 100,
      valueFormatter: fmtQty,
      cellClass: STRUCTURE_COMMON_CELL_CLASS,
    },
    {
      headerName: 'Akcje',
      width: 100,
      cellRenderer: (p) => (
        <button
          onClick={() => handleSelectMaterial(p.data)}
          className={`px-2 py-1 text-xs rounded transition-all ${
            selectedMaterial?.id === p.data.id
              ? 'bg-blue-500 text-white'
              : 'bg-blue-500/20 text-blue-300 hover:bg-blue-500/40'
          }`}
        >
          {selectedMaterial?.id === p.data.id ? 'Wybrano' : 'Wybierz'}
        </button>
      ),
      cellClass: STRUCTURE_COMMON_CELL_CLASS,
    },
  ];

  return (
    <div className="h-full flex flex-col gap-4 p-4 bg-black/40 rounded-lg">
      {/* Główna tabela materiałów */}
      <div className="flex-1 flex flex-col min-h-0">
        <div className="mb-2 flex items-center justify-between gap-3">
          <h3 className="text-sm font-semibold text-gray-300">Materiały i urządzenia</h3>
          <span className="text-xs text-gray-400">Pozycje: {materials.length}</span>
        </div>
        <div className="flex-1 border border-white/10 rounded-lg overflow-hidden">
          <AgGridReact
            ref={gridRef}
            rowData={materials}
            columnDefs={columnDefs}
            modules={MODULES}
            theme={darkTheme}
            rowSelection={{
              mode: 'singleRow',
              enableClickSelection: true,
            }}
            onSelectionChanged={(e) => {
              if (e.api.getSelectedRows().length > 0) {
                handleSelectMaterial(e.api.getSelectedRows()[0]);
              }
            }}
          />
        </div>
        {materials.length === 0 && (
          <div className="mt-2 rounded border border-amber-400/20 bg-amber-400/5 px-3 py-2 text-xs text-amber-200">
            Brak pozycji typu material/equipment w aktualnym WBS (sprawdzane pola: type i budgetType).
          </div>
        )}
      </div>

      {/* Panel zarządzania produktami dla wybranego materiału */}
      {selectedMaterial && (
        <div className="bg-black/60 border border-white/10 rounded-lg p-4">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-sm font-semibold text-gray-300">
              Produkty dla: <span className="text-blue-300">{selectedMaterial.name}</span>
            </h4>
            <button
              onClick={() => {
                setSelectedMaterial(null);
                setProposedProducts([]);
              }}
              className="p-1 hover:bg-white/10 rounded transition-all"
            >
              <X size={16} className="text-gray-400" />
            </button>
          </div>

          {/* Wyszukiwanie i dodawanie produktów */}
          <div className="mb-3">
            <div className="flex gap-2 mb-2">
              <div className="flex-1 relative">
                <input
                  type="text"
                  placeholder="Szukaj produktu..."
                  value={productSearchInput}
                  onChange={(e) => setProductSearchInput(e.target.value)}
                  className="w-full px-3 py-1.5 bg-white/5 border border-white/10 rounded text-sm text-white placeholder-gray-500 focus:border-blue-500/50 focus:bg-white/10"
                />
                <Search size={14} className="absolute right-3 top-2 text-gray-500 pointer-events-none" />
              </div>
            </div>

            {productSearchInput && (
              <div className="max-h-48 overflow-y-auto border border-white/10 rounded bg-white/5 divide-y divide-white/10">
                {loadingProducts ? (
                  <div className="p-2 text-xs text-gray-500">Ładowanie...</div>
                ) : filteredAvailableProducts.length > 0 ? (
                  filteredAvailableProducts
                    .filter(p => !proposedProducts.some(pp => pp.id === p.id))
                    .map(product => (
                      <button
                        key={product.id}
                        onClick={() => handleAddProduct(product)}
                        className="w-full text-left px-3 py-2 text-xs text-gray-300 hover:bg-white/10 transition-all flex items-center justify-between"
                      >
                        <div>
                          <div className="font-medium">{product.name}</div>
                          <div className="text-gray-500 text-[10px]">{product.id}</div>
                        </div>
                        <Plus size={14} className="text-gray-500" />
                      </button>
                    ))
                ) : (
                  <div className="p-2 text-xs text-gray-500">Brak pasujących produktów</div>
                )}
              </div>
            )}
          </div>

          {/* Tabela przypisanych produktów */}
          {proposedProducts.length > 0 && (
            <div className="border border-white/10 rounded overflow-hidden">
              <table className="w-full text-xs">
                <thead className="bg-white/5 border-b border-white/10">
                  <tr>
                    <th className="px-3 py-2 text-left text-gray-400 font-semibold">Produkt</th>
                    <th className="w-20 px-3 py-2 text-right text-gray-400 font-semibold">Akcje</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/10">
                  {proposedProducts.map(product => (
                    <tr key={product.id} className="hover:bg-white/5 transition-all">
                      <td className="px-3 py-2 text-gray-300">{product.name}</td>
                      <td className="px-3 py-2">
                        <button
                          onClick={() => handleRemoveProduct(product.id)}
                          className="text-red-400 hover:text-red-300 transition-all"
                          title="Usuń"
                        >
                          <X size={14} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {proposedProducts.length === 0 && !productSearchInput && (
            <div className="text-xs text-gray-500 p-2">Brak przypisanych produktów. Wyszukaj i dodaj nowy.</div>
          )}
        </div>
      )}
    </div>
  );
}
