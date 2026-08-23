import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'crypto';

// @anchor leave-decision-token-ttl-days
/// Jak dlugo dziala przycisk w mailu. Po tym czasie przelozony musi wejsc do aplikacji.
export const LEAVE_DECISION_TOKEN_TTL_DAYS = 14;

// @anchor leave-decision-token-payload
export interface LeaveDecisionTokenPayload {
  /// wniosek, ktorego dotyczy decyzja
  requestId: string;
  /// kto decyduje — token jest imienny, nie da sie go uzyc w cudzym imieniu
  deciderId: string;
  /// adres, na ktory mail poszedl — przy kliknięciu musi nadal byc adresem przelozonego
  deciderEmail: string;
  /// APPROVED albo REJECTED — akcja jest wpisana w podpis, nie w parametr URL
  decision: 'APPROVED' | 'REJECTED';
  /// wygasniecie, epoch w sekundach
  exp: number;
}

const b64url = (buf: Buffer) => buf.toString('base64url');

// @anchor leave-decision-token-service
/// Podpisany token do przyciskow „Zatwierdz" / „Odrzuc" w mailu do przelozonego.
/// HMAC-SHA256 na JWT_SECRET — bez wpisu w bazie, bo caly stan siedzi w podpisie.
/// Jednorazowosc wynika z logiki: link dziala tylko dopoki wniosek ma status PENDING.
@Injectable()
export class LeaveDecisionTokenService {
  constructor(private config: ConfigService) {}

  private secret(): string {
    return this.config.get<string>('JWT_SECRET') || 'supersecretkey';
  }

  private sign(body: string): Buffer {
    return createHmac('sha256', this.secret()).update(body).digest();
  }

  // @anchor issue-leave-decision-token
  issue(payload: Omit<LeaveDecisionTokenPayload, 'exp'>, ttlDays = LEAVE_DECISION_TOKEN_TTL_DAYS): string {
    const full: LeaveDecisionTokenPayload = {
      ...payload,
      exp: Math.floor(Date.now() / 1000) + ttlDays * 86400,
    };
    const body = b64url(Buffer.from(JSON.stringify(full), 'utf8'));
    return `${body}.${b64url(this.sign(body))}`;
  }

  // @anchor verify-leave-decision-token
  /// Zwraca payload albo null — bledny podpis, zly format i wygasniecie traktujemy tak samo,
  /// zeby nie podpowiadac, ktory element tokenu jest nie tak.
  verify(token: string | undefined | null): LeaveDecisionTokenPayload | null {
    if (!token || typeof token !== 'string') return null;
    const [body, signature] = token.split('.');
    if (!body || !signature) return null;

    const expected = this.sign(body);
    let given: Buffer;
    try {
      given = Buffer.from(signature, 'base64url');
    } catch {
      return null;
    }
    if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;

    let payload: LeaveDecisionTokenPayload;
    try {
      payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    } catch {
      return null;
    }
    if (!payload?.requestId || !payload?.deciderId || !payload?.deciderEmail) return null;
    if (payload.decision !== 'APPROVED' && payload.decision !== 'REJECTED') return null;
    if (!payload.exp || payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  }
}
