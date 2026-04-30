import { Injectable, UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class SuperAdminJwtAuthGuard extends AuthGuard('super-admin-jwt') {
  handleRequest(err, user, info) {
    if (err || !user) {
      throw (
        err ||
        new UnauthorizedException(
          'Bu işlem için Süper Admin olarak giriş yapmalısınız.',
        )
      );
    }
    return user;
  }
}
