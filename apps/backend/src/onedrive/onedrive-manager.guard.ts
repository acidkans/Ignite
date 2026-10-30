import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';

// @anchor onedrive-manager-emails
// Kto może przypinać folder OneDrive do zamówienia, zakładać jego strukturę i odłączać
// konto wspólne MS. Lista adresów, nie rola — admin spoza listy też nie zmieni folderu.
export const ONEDRIVE_MANAGER_EMAILS = [
  'andrzej@gigatel.app',
  'aromanowicz@europrim.com.pl',
  'a.romanowicz@airtel.com.pl',
];

// @anchor can-manage-onedrive
export const canManageOneDrive = (email?: string | null): boolean =>
  ONEDRIVE_MANAGER_EMAILS.includes(String(email || '').trim().toLowerCase());

// @anchor onedrive-manager-guard
// 403, nie 401 — frontend wylogowuje na każde 401.
@Injectable()
export class OneDriveManagerGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const { user } = context.switchToHttp().getRequest();
    if (!canManageOneDrive(user?.email)) {
      throw new ForbiddenException('Folder OneDrive zamówienia może zmieniać tylko osoba uprawniona');
    }
    return true;
  }
}
