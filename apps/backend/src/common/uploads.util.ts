import { BadRequestException } from '@nestjs/common';
import * as path from 'path';

// @anchor uploads-root
// Katalog plików serwera. Jedna definicja zamiast kopii `path.join(process.cwd(), 'uploads')`
// rozsianych po serwisach (i jednej wpisanej na sztywno '/usr/src/app/uploads').
// `UPLOADS_ROOT` z env pozwala przenieść pliki na osobny wolumen bez zmian w kodzie.
export const UPLOADS_ROOT = path.resolve(process.env.UPLOADS_ROOT || path.join(process.cwd(), 'uploads'));

// @anchor uploads-path
// Pełna ścieżka pliku z wartości zapisanej w bazie (`storagePath`, `fileUrl`, `dataSheetUrl`…).
// Obsługuje trzy formy: samą nazwę pliku (stare rekordy, płaski `uploads/`), ścieżkę względną
// z podkatalogami (`<nodeId>/01 Dokumenty finansowe/...`) i legacy ścieżkę absolutną z Dockera.
// Ścieżka względna nie może wyjść poza `UPLOADS_ROOT` — część wartości przychodzi z URL-a.
export function uploadPath(stored: string): string {
  if (path.isAbsolute(stored)) return stored;
  const full = path.resolve(UPLOADS_ROOT, stored);
  if (full !== UPLOADS_ROOT && !full.startsWith(UPLOADS_ROOT + path.sep)) {
    throw new BadRequestException('Niedozwolona ścieżka pliku');
  }
  return full;
}
