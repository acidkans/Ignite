import { Injectable } from '@nestjs/common';
import { MailerService } from '@nestjs-modules/mailer';

@Injectable()
export class MailService {
  constructor(private mailerService: MailerService) { }

  async sendUserConfirmation(user: any, token: string) {
    const url = `http://localhost:81/auth/confirm?token=${token}`; // TODO: Użyć ConfigService dla FRONTEND_URL

    try {
      await this.mailerService.sendMail({
        to: user.email,
        subject: 'Witaj w GIGATEL ERP! Potwierdź swój email',
        html: `
            <h1>Witaj ${user.firstName || ''}!</h1>
            <p>Dziękujemy za rejestrację w systemie ERP.</p>
            <p><a href="${url}">Kliknij tutaj, aby potwierdzić konto</a></p>
            <br/>
            <small>Jeśli to nie Ty, zignoruj ten email.</small>
          `,
      });
      console.log(`[MAIL] Wysłano link aktywacyjny do: ${user.email}`);
    } catch (e) {
      console.error('[MAIL ERROR]', e);
      // Rzucamy błąd dalej, żeby frontend wiedział, że coś poszło nie tak (np. złe hasło SMTP)
      throw e;
    }
  }
}
