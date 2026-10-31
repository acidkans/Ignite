import { BadRequestException } from '@nestjs/common';
import { diskStorage } from 'multer';
import { v4 as uuidv4 } from 'uuid';
import * as fs from 'fs';
import * as path from 'path';
import { UPLOADS_ROOT } from '../common/uploads.util';

// @anchor chat-image-dir
// Obrazki wiadomości czatu — osobny podkatalog, żeby nie mieszać ich ze schematami w płaskim uploads/.
export const CHAT_IMAGE_DIR = path.join(UPLOADS_ROOT, 'chat');

// @anchor chat-image-max-bytes
// Zrzut ekranu czy zdjęcie z telefonu mieści się z zapasem; front pilnuje tego samego limitu.
export const CHAT_IMAGE_MAX_BYTES = 15 * 1024 * 1024;

// @anchor chat-image-name-re
// Nazwa pliku nadana przez serwer (uuid + rozszerzenie) — tylko takie przyjmujemy z body i z URL-a.
export const CHAT_IMAGE_NAME_RE = /^[0-9a-f-]{36}\.(png|jpe?g|gif|webp)$/i;

// @anchor chat-image-upload-options
export const chatImageUploadOptions = {
    storage: diskStorage({
        destination: (_req, _file, cb) => {
            fs.mkdirSync(CHAT_IMAGE_DIR, { recursive: true });
            cb(null, CHAT_IMAGE_DIR);
        },
        filename: (_req, file, cb) => {
            // Rozszerzenie z typu MIME (już przefiltrowanego), nie z nazwy — wklejka ze schowka nazywa się „image.png”.
            const ext = (file.mimetype.split('/')[1] || 'png').toLowerCase().replace('jpeg', 'jpg');
            cb(null, `${uuidv4()}.${ext}`);
        },
    }),
    fileFilter: (_req, file, cb) => {
        if (!/^image\/(png|jpe?g|gif|webp)$/i.test(file.mimetype)) {
            return cb(new BadRequestException('Dozwolone tylko obrazki (PNG, JPG, GIF, WEBP)'), false);
        }
        cb(null, true);
    },
    limits: { fileSize: CHAT_IMAGE_MAX_BYTES },
};
