import { SetMetadata } from '@nestjs/common';

// @anchor is-public-key
export const IS_PUBLIC_KEY = 'isPublic';

// @anchor public-decorator
// Zwalnia trasę (albo cały kontroler) z globalnego `JwtAuthGuard` (APP_GUARD w AppModule).
// Domyślnie KAŻDA trasa wymaga JWT — nowy kontroler bez `@UseGuards` nie jest już publiczny.
// Używać tylko tam, gdzie klient z definicji nie ma nagłówka Authorization: logowanie,
// health, redirect OAuth, przyciski z maili, pliki ładowane przez <img>/<video>/react-pdf.
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
