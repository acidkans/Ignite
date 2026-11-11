import { Injectable, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { ClsService } from 'nestjs-cls';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

// @anchor jwt-auth-guard
// Działa globalnie (APP_GUARD w AppModule) i nadal bywa podpięty przez `@UseGuards` na
// kontrolerach. Drugie przejście na tym samym żądaniu nie weryfikuje tokenu ponownie —
// `JwtStrategy.validate` czyta użytkownika z bazy, więc podwójne wywołanie to podwójne zapytanie.
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(
    private readonly cls: ClsService,
    private readonly reflector: Reflector,
  ) {
    super();
  }

  canActivate(context: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const req = context.switchToHttp().getRequest();
    if (req?.user) return true;

    return super.canActivate(context);
  }

  handleRequest(err, user, info, context, status) {
    if (user) {
      // Put user info into CLS context
      this.cls.set('user', user);
    }
    return super.handleRequest(err, user, info, context, status);
  }
}
