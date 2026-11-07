import { BadRequestException } from '@nestjs/common';
import { diskStorage } from 'multer';
import { v4 as uuidv4 } from 'uuid';
import * as fs from 'fs';
import * as path from 'path';
import { UPLOADS_ROOT } from '../common/uploads.util';

// @anchor watek-mail-zal-dir
// Załączniki maili wątków (wysłane i odebrane) — osobny podkatalog uploads/watek-mail.
export const ZAL_DIR = path.join(UPLOADS_ROOT, 'watek-mail');

// @anchor watek-mail-zal-max-bytes
export const ZAL_MAX_BYTES = 15 * 1024 * 1024;

// @anchor watek-mail-zal-name-re
// Nazwa pliku nadana przez serwer (uuid + rozszerzenie) — tylko takie przyjmujemy z body i z URL-a.
export const ZAL_NAME_RE = /^[0-9a-f-]{36}\.[a-z0-9]{1,8}$/i;

// @anchor watek-mail-zal-zakazane
// Pliki wykonywalne / skrypty — nie wysyłamy i nie zapisujemy.
const ZAKAZANE_RE = /\.(exe|bat|cmd|com|scr|msi|js|vbs|ps1|jar|sh|dll)$/i;

// @anchor watek-mail-zal-rozszerzenie
// Rozszerzenie z nazwy (albo z typu MIME — wklejka ze schowka nazywa się „image.png”).
export const rozszerzenie = (name: string, mime: string) => {
  const z = String(name || '').match(/\.([a-z0-9]{1,8})$/i)?.[1];
  return (z || (String(mime || '').split('/')[1] || 'bin').replace('jpeg', 'jpg').replace(/[^a-z0-9]/gi, '').slice(0, 8) || 'bin').toLowerCase();
};

export const czyZakazany = (name: string) => ZAKAZANE_RE.test(String(name || ''));

// Zapis bufora (załącznik z odebranego maila) pod nazwą uuid.ext — zwraca nadaną nazwę.
export const zapiszBufor = (buf: Buffer, name: string, mime: string) => {
  fs.mkdirSync(ZAL_DIR, { recursive: true });
  const fileName = `${uuidv4()}.${rozszerzenie(name, mime)}`;
  fs.writeFileSync(path.join(ZAL_DIR, fileName), buf);
  return fileName;
};

// @anchor watek-mail-zal-upload-options
export const zalUploadOptions = {
  storage: diskStorage({
    destination: (_req, _file, cb) => {
      fs.mkdirSync(ZAL_DIR, { recursive: true });
      cb(null, ZAL_DIR);
    },
    filename: (_req, file, cb) => cb(null, `${uuidv4()}.${rozszerzenie(file.originalname, file.mimetype)}`),
  }),
  fileFilter: (_req, file, cb) => {
    if (czyZakazany(file.originalname)) return cb(new BadRequestException('Tego rodzaju pliku nie można dołączyć do maila.'), false);
    cb(null, true);
  },
  limits: { fileSize: ZAL_MAX_BYTES },
};
