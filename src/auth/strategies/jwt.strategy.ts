import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import { I18nService } from 'nestjs-i18n';
import { UsersService } from '../../users/users.service.js';
import { RedisService } from '../../redis/redis.service.js';
import { JwtPayload } from '../interfaces/jwt-payload.interface.js';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private readonly configService: ConfigService,
    private readonly usersService: UsersService,
    private readonly redisService: RedisService,
    private readonly i18n: I18nService,
  ) {
    const jwtSecret = configService.getOrThrow<string>('JWT_SECRET');

    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: jwtSecret,
      passReqToCallback: true,
    });
  }

  async validate(req: Request, payload: JwtPayload) {
    const rawToken = ExtractJwt.fromAuthHeaderAsBearerToken()(req);

    const jti = payload.jti || rawToken;
    if (jti) {
      const isBlacklisted = await this.redisService.isTokenBlacklisted(jti);
      if (isBlacklisted) {
        throw new UnauthorizedException(
          this.i18n.t('auth.TOKEN_REVOKED') || 'Token has been revoked/blacklisted (User logged out)',
        );
      }
    }

    const user = await this.usersService.findByIdOrNull(payload.sub);
    if (!user || !user.isActive) {
      throw new UnauthorizedException(
        this.i18n.t('auth.USER_NOT_FOUND_OR_INACTIVE') || 'User is inactive or not found',
      );
    }

    return {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      role: user.role,
      isActive: user.isActive,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      rawToken,
      jti: payload.jti,
    };
  }
}
