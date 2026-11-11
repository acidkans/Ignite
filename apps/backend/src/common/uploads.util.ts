import { BadRequestException } from '@nestjs/common';
import * as path from 'path';

// @anchor uploads-root
// Katalog plików serwera. Jedna definicja zamiast kopii `path.join(process.cwd(), 'uploads')`
// rozsianych po serwisach (i jednej wpisanej na sztywno '/usr/src/app/uploads').
// `UPLOADS_ROOT` z env pozwala przenieść pliki na osobny wolumen bez zmian w kodzie.
export const UPLOADS_ROOT = path.resolve(process.env.UPLOADS_ROOT || path.join(process.cwd(), 'uploads'));

// @anchor legacy-uploads-roots
// Katalogi, pod którymi stare rekordy zapisywały ABSOLUTNE ścieżki plików (kontener Dockera).
// Taka ścieżka jest przepisywana na ten sam plik pod bieżącym `UPLOADS_ROOT`.
const LEGACY_UPLOADS_ROOTS = ['/usr/src/app/uploads'];

// @anchor uploads-path
// Pełna ścieżka pliku z wartości zapisanej w bazie (`storagePath`, `fileUrl`, `dataSheetUrl`…).
// Obsługuje trzy formy: samą nazwę pliku (stare rekordy, płaski `uploads/`), ścieżkę względną
// z podkatalogami (`<nodeId>/01 Dokumenty finansowe/...`) i legacy ścieżkę absolutną z Dockera.
// Wynik ZAWSZE leży wewnątrz `UPLOADS_ROOT` — ścieżka absolutna spoza katalogu plików albo
// z `..` kończy się 400. Wcześniej absolutna wracała bez sprawdzenia i `%2Fetc%2F...` w URL-u
// albo `imageUrl: "/usr/src/app/.env"` w PATCH czytały dowolny plik serwera (audyt 2026-11-10).
export function uploadPath(stored: string): string {
  const value = String(stored ?? '');
  let rel = value;
  if (path.isAbsolute(value) || path.posix.isAbsolute(value)) {
    const norm = value.split(path.win32.sep).join('/');
    const roots = [UPLOADS_ROOT.split(path.win32.sep).join('/'), ...LEGACY_UPLOADS_ROOTS];
    const root = roots.find(r => norm.startsWith(r + '/'));
    if (!root) throw new BadRequestException('Niedozwolona ścieżka pliku');
    rel = norm.slice(root.length + 1);
  }
  const full = path.resolve(UPLOADS_ROOT, rel);
  if (full !== UPLOADS_ROOT && !full.startsWith(UPLOADS_ROOT + path.sep)) {
    throw new BadRequestException('Niedozwolona ścieżka pliku');
  }
  return full;
}

// @anchor assert-upload-ref
// Walidacja wartości ścieżki pliku przychodzącej z body (np. `dataSheetUrl` kopiowany z katalogu
// materiałów): null/'' przechodzi, reszta musi wskazywać plik w `UPLOADS_ROOT` — inaczej 400.
export function assertUploadRef(value: unknown): void {
  if (value === undefined || value === null || value === '') return;
  if (typeof value !== 'string') throw new BadRequestException('Niedozwolona ścieżka pliku');
  uploadPath(value);
}
