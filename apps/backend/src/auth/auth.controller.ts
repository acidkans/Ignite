import { Controller, Request, Post, UseGuards, Body, UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';

import { LoginDto } from './dto/login.dto';
import { Public } from './decorators/public.decorator';

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) { }

  // @anchor auth-login-endpoint — jedyna publiczna trasa modułu. Samodzielna rejestracja
  // (`POST /auth/register`) usunięta w audycie 2026-11-10 — konta zakłada ADMIN przez `POST /users`.
  @Public()
  @Post('login')
  async login(@Body() body: LoginDto) {
    const user = await this.authService.validateUser(body.email, body.password);
    if (!user) {
      throw new UnauthorizedException('Błędny email lub hasło.');
    }
    return this.authService.login(user); // Returns JWT
  }
}
