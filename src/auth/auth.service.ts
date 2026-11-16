import {
  Injectable,
  ConflictException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { I18nService } from 'nestjs-i18n';
import { UsersService } from '../users/users.service.js';
import { RedisService } from '../redis/redis.service.js';
import { RegisterDto } from './dto/register.dto.js';
import { LoginDto } from './dto/login.dto.js';
import { JwtPayload } from './interfaces/jwt-payload.interface.js';

// Constant dummy hash for timing-attack mitigation (generated with bcrypt cost factor 10)
const DUMMY_HASH = '$2b$10$7EqJtq98hPqEX7fNZaFWoO0v2c1KjQ9aK9eA0e0CqHjO8t6gV3kSm';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly redisService: RedisService,
    private readonly i18n: I18nService,
  ) {}

  private async generateTokens(basePayload: Omit<JwtPayload, 'jti'>) {
    const accessSecret = this.configService.getOrThrow<string>('JWT_SECRET');
    const accessExpiresIn = this.configService.get<string>('JWT_EXPIRES_IN') || '15m';

    const jti = crypto.randomUUID();
    const payload: JwtPayload = {
      ...basePayload,
      jti,
    };

    const accessToken = await this.jwtService.signAsync(payload, {
      secret: accessSecret,
      expiresIn: accessExpiresIn as any,
    });

    return { accessToken };
  }

  async register(registerDto: RegisterDto) {
    const existingUser = await this.usersService.findByEmail(registerDto.email);
    if (existingUser) {
      throw new ConflictException(
        this.i18n.t('auth.EMAIL_ALREADY_EXISTS') || 'Email already exists',
      );
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(registerDto.password, salt);

    let newUser;
    try {
      newUser = await this.usersService.create({
        email: registerDto.email,
        password: hashedPassword,
        fullName: registerDto.fullName,
      });
    } catch (err: any) {
      // Postgres unique constraint violation code is 23505
      if (err?.code === '23505' || err?.message?.includes('duplicate key') || err?.message?.includes('unique')) {
        throw new ConflictException(
          this.i18n.t('auth.EMAIL_ALREADY_EXISTS') || 'Email already exists',
        );
      }
      throw err;
    }

    const tokens = await this.generateTokens({
      sub: newUser.id,
      email: newUser.email,
      role: newUser.role,
    });

    return {
      message: this.i18n.t('auth.REGISTRATION_SUCCESS') || 'Registration successful',
      user: newUser,
      tokens,
    };
  }

  async login(loginDto: LoginDto) {
    const user = await this.usersService.findByEmail(loginDto.email);

    if (!user) {
      // Mitigate timing attacks by executing bcrypt.compare against a dummy hash
      await bcrypt.compare(loginDto.password, DUMMY_HASH);
      throw new UnauthorizedException(
        this.i18n.t('auth.INVALID_CREDENTIALS') || 'Invalid email or password',
      );
    }

    const isPasswordValid = await bcrypt.compare(loginDto.password, user.password);
    if (!isPasswordValid) {
      throw new UnauthorizedException(
        this.i18n.t('auth.INVALID_CREDENTIALS') || 'Invalid email or password',
      );
    }

    if (!user.isActive) {
      throw new UnauthorizedException(
        this.i18n.t('auth.ACCOUNT_INACTIVE') || 'Account is inactive',
      );
    }

    const tokens = await this.generateTokens({
      sub: user.id,
      email: user.email,
      role: user.role,
    });

    return {
      message: this.i18n.t('auth.LOGIN_SUCCESS') || 'Login successful',
      tokens,
      user,
    };
  }

  async logout(userId: string, tokenOrJti?: string) {
    if (tokenOrJti) {
      let jti = tokenOrJti;
      let ttlSeconds = 86400;

      // If tokenOrJti looks like a JWT token (has dots), decode and compute remaining TTL
      if (tokenOrJti.includes('.')) {
        try {
          const decoded: any = this.jwtService.decode(tokenOrJti);
          if (decoded && typeof decoded === 'object') {
            if (decoded.jti) {
              jti = decoded.jti;
            }
            if (decoded.exp) {
              const now = Math.floor(Date.now() / 1000);
              ttlSeconds = Math.max(0, decoded.exp - now);
            }
          }
        } catch {
          // If decoding fails, fallback to using tokenOrJti directly
        }
      }

      await this.redisService.blacklistToken(jti, ttlSeconds);
    }

    return {
      message: this.i18n.t('auth.LOGOUT_SUCCESS') || 'Logout successful, token added to Redis blacklist',
    };
  }
}
