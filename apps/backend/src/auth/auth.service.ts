import { Injectable, UnauthorizedException } from '@nestjs/common';
import { UsersService } from '../users/users.service';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { MailService } from '../mail/mail.service';

@Injectable()
export class AuthService {
  constructor(
    private usersService: UsersService,
    private jwtService: JwtService,
  ) { }

  async validateUser(email: string, pass: string): Promise<any> {
    console.log(`[AUTH] Validating user: ${email}`);
    const user = await this.usersService.findOne(email);
    if (!user) return null;

    try {
      if (await argon2.verify(user.password, pass)) {
        console.log(`[AUTH] Password verified for ${email}`);
        const { password, ...result } = user;
        return result;
      } else {
        console.log(`[AUTH] Password mismatch for ${email}`);
      }
    } catch (error) {
      console.error(`[AUTH] Password verification error for ${email}:`, error);
    }
    return null;
  }

  async login(user: any) {
    console.log(`[AUTH] Login attempt successful for: ${user.email}`);
    // Wyciągnij nazwy ról (string[]) zamiast obiektów UserRole
    const roleNames = (user.userRoles || []).map((ur: any) => {
      const name = typeof ur === 'string' ? ur : ur?.role?.name || ur?.name;
      if (!name) console.warn(`[AUTH] Missing role name for user ${user.email}`, ur);
      return name;
    }
    ).filter(Boolean);
    console.log(`[AUTH] Assigned roles for token: ${roleNames.join(', ')}`);
    const payload = { email: user.email, sub: user.id, roles: roleNames };
    return {
      access_token: this.jwtService.sign(payload),
    };
  }

  async register(data: any) {
    console.log(`[AUTH] Registering new user: ${data.email}`);
    // 1. Create User
    const user = await this.usersService.create(data);

    // Registration is direct, no email confirmation needed.
    return {
      message: 'Konto zostało utworzone. Możesz się teraz zalogować.',
      userId: user.id
    };
  }
}
