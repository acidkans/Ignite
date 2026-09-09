import { diskStorage } from 'multer';
import { v4 as uuidv4 } from 'uuid';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Konfiguracja multera dla uploadów schematów i załączników znaczników.
 *
 * Powód istnienia: `FileInterceptor('file')` bez opcji używa memoryStorage —
 * CAŁY plik ląduje w RAM procesu, a dopiero serwis przepisuje go na dysk przez
 * `fs.writeFileSync(path, file.buffer)`. Przy zdjęciu z telefonu to nieistotne,
 * ale przy filmie 90 MB to 90 MB w pamięci na każdą równoległą wysyłkę — a
 * kontener backendu ma `mem_limit: 1g` (i dzieli go z Chromium od eksportu PDF).
 * Kilka takich uploadów naraz kończyło się OOM-em.
 *
 * diskStorage zapisuje strumieniowo prosto do katalogu docelowego: pamięć
 * procesu nie rośnie z rozmiarem pliku, a serwis dostaje gotowe `file.filename`
 * i `file.path`.
 */

/// Katalog docelowy — ta sama ścieżka, z której czyta SchematicsService.
// @anchor schematics-upload-dir
export const UPLOAD_DIR = path.join(process.cwd(), 'uploads');

/**
 * Serwerowy limit rozmiaru pojedynczego pliku.
 *
 * Musi być zgodny z `MAX_ATTACHMENT_BYTES` we froncie (`apps/frontend/src/config.js`).
 * Front blokuje plik przed dodaniem do kolejki, ten limit jest drugą linią obrony —
 * dla starych klientów z cache'owanym SW i dla wysyłek spoza aplikacji.
 *
 * Wartość wynika z proxy Cloudflare przed `erp.gigatel.org`: na planach Free i Pro
 * ucina ono żądania powyżej 100 MB własnym 413, zanim dotrą tutaj.
 */
// @anchor max-upload-bytes
export const MAX_UPLOAD_BYTES = 90 * 1024 * 1024;

// @anchor schematics-upload-options
export const schematicsUploadOptions = {
  storage: diskStorage({
    destination: (_req, _file, cb) => {
      // mkdir przy każdym żądaniu jest tani (recursive: true nie rzuca, gdy
      // katalog istnieje), a ratuje przed pierwszym uploadem na świeżym wolumenie.
      fs.mkdirSync(UPLOAD_DIR, { recursive: true });
      cb(null, UPLOAD_DIR);
    },
    filename: (_req, file, cb) => {
      cb(null, `${uuidv4()}${path.extname(file.originalname)}`);
    },
  }),
  limits: { fileSize: MAX_UPLOAD_BYTES },
};
