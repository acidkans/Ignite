# Logika WBS — stan na v2026.04.05.71

## Architektura

```
Backend (NestJS + Prisma)
  └─ GET /wbs-nodes/unified/{nodeId}  →  { items: WbsNode[] }
       └─ depth obliczane rekurencyjnie: buildDepths(null, 0)
       └─ parentId=null → depth=0 (Przedmioty Projektu)

Frontend (React + AG Grid)
  ├─ UnifiedWbsPanel.jsx      — drzewo WBS (struktura, budżet, materiały)
  └─ MaterialRequirementsPanel.jsx  — panel Materiały2 (fallback z WBS)
```

---

## 1. Backend — getUnifiedTree()

**Plik:** `apps/backend/src/wbs-nodes/wbs-nodes.service.ts`

### Obliczanie depth

```typescript
const buildDepths = (parentId: string | null, depth: number) => {
    const children = nodes.filter(n => n.parentId === parentId);
    for (const node of children) {
        depthMap[node.id] = depth;
        buildDepths(node.id, depth + 1);
    }
};
buildDepths(null, 0);
```

- `parentId=null` → depth **0** (korzenie — Przedmioty Projektu)
- Każdy poziom zagnieżdżenia +1
- depth NIE jest kolumną w bazie — obliczany w runtime

### Zwracane dane per node

| Pole | Opis |
|------|------|
| `id`, `parentId` | Relacja parent-child |
| `name`, `type`, `status`, `owner` | Podstawowe pola |
| `depth` | Obliczany poziom zagnieżdżenia (0-based) |
| `path` | Ścieżka tekstowa: `"kamery18 › kamera kopulkowa"` |
| `budgetType`, `unit`, `unitCost`, `quantity`, `totalCost`, `margin`, `discount` | Pola budżetowe |
| `materials[]` | Powiązane materiały (z WbsNodeMaterial) |
| `materialsTotalCost`, `materialsCount` | Agregaty |
| `tags` | Znaczniki |

### Wersjonowanie

Gdy `versionId` podane → pobiera wiersze wersji + bazowe, merge po ID (wersja nadpisuje bazę).

---

## 2. Frontend — UnifiedWbsPanel.jsx

### Drzewo AG Grid (widok STRUCTURE)

**Brak syntetycznego roota** — drzewo zaczyna się od poziomu depth=0 (Przedmioty Projektu).

#### buildRows() — konstrukcja wierszy

```
childrenMap: Map<parentId, WbsNode[]>
  '__root__' → [nodes bez parentId]  (depth=0)
  nodeId     → [children]             (depth=1+)
```

**addVisible(parentId, depth)** — rekurencyjne budowanie widocznych wierszy:
1. Pobiera dzieci z `childrenMap`
2. Sortuje po `sortOrder`
3. Każdy wiersz dostaje flagi:
   - `_depth` — poziom zagnieżdżenia (=depth z API)
   - `_isProjectItem` — `depth === 0` (Przedmiot Projektu)
   - `_hasChildren` — ma podwęzły lub powiązane wymagania
   - `_isRequirementLeaf` — wirtualny wiersz wymagania (z `__req__:` prefix)
4. Jeśli węzeł jest rozwinięty (`expandedIds.has(id)`) → rekursja + dodanie requirement leafs

#### Wiersze wymagań (requirement leafs)

Wymagania z `allRequirements` (MaterialRequirement z DB) z alokacjami (`wbsNodeAllocations`) są wstawiane jako wiersze potomne w drzewie z prefiksem `__req__:`.

#### Flagi wierszy i ich wpływ na edycję

| Flaga | Znaczenie | Blokuje edycję |
|-------|-----------|----------------|
| `_isProjectItem` | Przedmiot Projektu (depth=0) | type, requirementsQty |
| `_isRequirementLeaf` | Wirtualny wiersz wymagania | name, type, status, owner, requirementsQty |
| `_hasChildren` | Ma podwęzły | requirementsQty |

- **Status** nie jest edytowalny dla type=`material`/`equipment` (dziedziczony z materiałów)
- **Nazwa** edytowalna przez double-click na span (uruchamia `api.startEditingCell`)

#### Auto-expand

Przy fetch danych: węzły z `depth === 0` i `depth === 1` są automatycznie rozwijane.

### TreeNameRenderer

```
paddingLeft = depth × 20px
depth=0 → font-semibold text-white (pogrubiony)
depth>0 → text-gray-300
_isRequirementLeaf → text-blue-200 + ikona Package
```

- Klik → zaznaczenie wiersza
- Double-click na nazwie → edycja inline
- Przycisk `+` → dodanie podgałęzi (`addNode(parentId)`)
- Chevron → expand/collapse

### onCellValueChanged — zapis zmian

1. **name/type/status/owner** → `PATCH /wbs-nodes/{id}` + aktualizacja lokalnego `wbsData`
2. **type zmiana na material/equipment** → dziedziczenie kosztów z `materialMetaByLookupKey`
3. **requirementsQty** → sync ilości do powiązanych MaterialRequirements
4. **Pola budżetowe** (unitCost, quantity, margin, discount) → przeliczenie cen + zapis

---

## 3. Frontend — MaterialRequirementsPanel.jsx (Materiały2)

### fetchRequirements() — 3 równoległe zapytania

```
Promise.all([
  GET /material-requirements/node/{nodeId}   → reqItems (z DB)
  GET /subtasks/node/{nodeId}                → subtasks
  GET /wbs-nodes/unified/{nodeId}            → unifiedItems (WBS)
])
```

### Fallback — wirtualne wymagania z WBS

Gdy `reqItems` (z DB) jest puste → wyświetlane są `wbsFallbackRequirements` wygenerowane z unified WBS:

**Filtr fallback:**
```
depth >= 1
AND (type IN ['material', 'materiał', 'equipment', 'device']
     OR budgetType IN ['MATERIAL', 'DEVICE'])
```

- depth=0 (Przedmioty Projektu) — **pomijane**
- depth=1+ z typem materiał/urządzenie — **wyświetlane jako wirtualne wymagania**

**Wirtualne wymaganie:**
```javascript
{
  id: `__wbs_fallback__:${node.id}`,
  name: node.name,
  type: 'MATERIAL' | 'DEVICE',
  quantity: node.quantity || 1,
  status: 'PENDING',
  _virtualWbsRequirement: true,
}
```

### displayedRequirements — przełączanie źródła

```javascript
const displayedRequirements = requirements.length > 0 ? requirements : wbsFallbackRequirements;
const hasVirtualRequirements = requirements.length === 0 && wbsFallbackRequirements.length > 0;
```

- Jeśli istnieją prawdziwe MaterialRequirements w DB → używane są one
- Jeśli brak → fallback z WBS (read-only, `isLocked = true`)

---

## 4. Spójność depth między komponentami

| Komponent | depth=0 | depth=1 | depth=2+ |
|-----------|---------|---------|----------|
| Backend API | Przedmioty Projektu (parentId=null) | Elementy bezpośrednie | Elementy zagnieżdżone |
| AG Grid drzewo | Przedmioty Projektu (`_isProjectItem=true`) | Elementy | Podelementy |
| Materiały2 fallback | **pomijane** | Pokazywane (jeśli typ material/device) | Pokazywane (jeśli typ material/device) |

**Depth jest spójny** — AG Grid i Materiały2 używają tych samych wartości depth co backend API.

---

## 5. Drag & Drop wymagań

Nieprzypisane wymagania (koszyk) można przeciągnąć na węzeł WBS w drzewie:
- `onDragOver`: identyfikuje target (ignoruje wiersze `__req__:`)
- `onDrop`: przypisuje wymaganie do węzła WBS
- Przycisk "→ Przypisz" na koszyczku — szybkie przypisanie do zaznaczonego węzła
