/**
 * Shared WBS constants and formatters
 */

import { Clock } from 'lucide-react';

export const TASK_CATEGORIES = [
    { key: 'terminowe',     label: 'Terminowe',     icon: Clock, iconColor: 'text-orange-400', color: 'orange' },
    { key: 'instalacyjne',  label: 'Instalacyjne',  icon: Clock, iconColor: 'text-blue-400',   color: 'blue' },
    { key: 'organizacyjne', label: 'Organizacyjne', icon: Clock, iconColor: 'text-purple-400', color: 'purple' },
    { key: 'jakosciowe',    label: 'Jakościowe',    icon: Clock, iconColor: 'text-green-400',  color: 'green' },
    { key: 'techniczne',    label: 'Techniczne',    icon: Clock, iconColor: 'text-cyan-400',   color: 'cyan' },
    { key: 'finansowe',     label: 'Finansowe',     icon: Clock, iconColor: 'text-yellow-400', color: 'yellow' },
    { key: 'sla',           label: 'SLA',           icon: Clock, iconColor: 'text-indigo-400', color: 'indigo' },
    { key: 'gwarancyjne',   label: 'Gwarancyjne',   icon: Clock, iconColor: 'text-rose-400',   color: 'rose' },
];

export const MODULES = [
  'ClientSideRowModelModule',
  'TextEditorModule',
  'NumberEditorModule',
  'SelectEditorModule',
  'TextFilterModule',
  'NumberFilterModule',
  'ValidationModule',
];

export const darkTheme = {
  accentColor: '#4f9ef5',
  backgroundColor: '#1a1d23',
  borderColor: 'rgba(255,255,255,0.06)',
  cellHorizontalPaddingScale: 0.6,
  fontSize: 13,
  headerFontSize: 12,
  rowHeight: 32,
  headerHeight: 34,
};

// Type labels
export const TYPE_LABELS = {
  work: 'Praca',
  material: 'Materiał',
  equipment: 'Sprzęt',
  service: 'Usługa',
  lodging: 'Nocleg',
  fuel: 'Paliwo',
  product: 'Produkt',
};

export const TYPE_OPTIONS = ['', 'work', 'material', 'equipment', 'service', 'lodging', 'fuel'];

export const BUDGET_TYPE_LABELS = {
  WORK: 'Praca',
  MATERIAL: 'Materiał',
  EXTERNAL_SERVICE: 'Usługa Obca',
};

export const UNIT_OPTIONS = [
  'sztuki',
  'kilometry',
  'metry',
  'dni',
  'godziny',
  'tygodnie',
  'miesiące',
  'l',
  'kg',
  't',
  'm2',
  'm3',
  'kpl',
  'rbh',
  'kurs',
  'usługa',
  'pakiet',
];

export const MATERIAL_STATUS_LABELS = {
  PENDING: 'Oczekuje',
  PROPOSAL: 'Propozycja',
  CONFIRMED: 'Potwierdzone',
  REJECTED: 'Odrzucone',
  ORDERED: 'Zamówione',
  IN_STOCK: 'Na magazynie',
  ISSUED: 'Wydane',
};

export const STRUCTURE_STATUS_META = {
  '': { label: 'Brak', color: 'text-gray-400' },
  PENDING: { label: 'Oczekuje', color: 'text-amber-400' },
  PROPOSAL: { label: 'Propozycja', color: 'text-blue-400' },
  CONFIRMED: { label: 'Potwierdzone', color: 'text-green-400' },
  REJECTED: { label: 'Odrzucone', color: 'text-red-400' },
  ORDERED: { label: 'Zamowione', color: 'text-violet-400' },
  IN_STOCK: { label: 'Na magazynie', color: 'text-cyan-400' },
  ISSUED: { label: 'Wydane', color: 'text-emerald-400' },
  MIXED: { label: 'Mieszany', color: 'text-sky-300' },
};

export const MATERIAL_STATUS_LABEL_TO_CODE = Object.fromEntries(
  Object.entries(MATERIAL_STATUS_LABELS).map(([code, label]) => [String(label).toUpperCase(), code])
);

export const STRUCTURE_COMMON_CELL_CLASS = 'text-sm leading-6';

// Formatter functions
export const fmtPLN = v =>
  v != null && v !== 0
    ? v.toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : '';

export const fmtQty = v =>
  v != null && v !== 0
    ? v.toLocaleString('pl-PL', { maximumFractionDigits: 2 })
    : '';

export const fmtPct = v =>
  v != null && v !== 0
    ? v.toLocaleString('pl-PL', { maximumFractionDigits: 1 }) + '%'
    : '';

export const fmtPLNFull = v =>
  (Number(v) || 0).toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const fmtPctFull = v =>
  (Number(v) || 0).toLocaleString('pl-PL', { maximumFractionDigits: 1 }) + '%';

// Utility functions
export const normKey = value => String(value || '').trim().toLowerCase();

export const makeMaterialLookupKey = (subjectName, itemName) =>
  `${normKey(subjectName)}::${normKey(itemName)}`;

export const parseLocaleNumber = value => {
  if (value == null) return null;
  const normalized = String(value).trim().replace(/\s/g, '').replace(',', '.');
  if (!normalized) return null;
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
};

export const normalizeStatusCode = value => {
  if (value == null) return '';
  const raw = String(value).trim();
  if (!raw) return '';
  const upper = raw.toUpperCase();
  if (MATERIAL_STATUS_LABEL_TO_CODE[upper]) {
    return MATERIAL_STATUS_LABEL_TO_CODE[upper];
  }
  return raw;
};

export const isLeafNode = node => !node || !node.children || node.children.length === 0;

export const buildHierarchy = (flat = [], parentId = null) => {
  if (!Array.isArray(flat)) return [];
  return flat
    .filter(node => (node?.parentId ?? null) === parentId)
    .map(node => ({
      ...node,
      children: buildHierarchy(flat, node.id),
    }));
};

export const flattenHierarchy = (root, depth = 0) => {
  if (!root) return [];
  const result = [{ ...root, depth }];
  if (Array.isArray(root.children)) {
    root.children.forEach(child => {
      result.push(...flattenHierarchy(child, depth + 1));
    });
  }
  return result;
};
