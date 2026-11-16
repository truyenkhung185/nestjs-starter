import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service.js';
import { UserRole } from '../users/entities/user.entity.js';

describe('AuthService', () => {
  let authService: AuthService;
  let mockUsersService: any;
  let mockJwtService: any;
  let mockConfigService: any;
  let mockRedisService: any;
  let mockI18n: any;

  beforeEach(() => {
    mockUsersService = {
      findByEmail: vi.fn(),
      findById: vi.fn(),
      findByIdOrNull: vi.fn(),
      create: vi.fn(),
    };

    mockJwtService = {
      signAsync: vi.fn().mockResolvedValue('mock-access-token'),
      decode: vi.fn(),
    };

    mockConfigService = {
      getOrThrow: vi.fn().mockImplementation((key: string) => {
        if (key === 'JWT_SECRET') return 'super-secret-key-for-test-1234567890';
        throw new Error(`Key ${key} not found`);
      }),
      get: vi.fn().mockImplementation((key: string) => {
        if (key === 'JWT_EXPIRES_IN') return '15m';
        return null;
      }),
    };

    mockRedisService = {
      blacklistToken: vi.fn().mockResolvedValue(undefined),
      isTokenBlacklisted: vi.fn().mockResolvedValue(false),
    };

    mockI18n = {
      t: vi.fn().mockImplementation((key: string) => key),
    };

    authService = new AuthService(
      mockUsersService,
      mockJwtService,
      mockConfigService,
      mockRedisService,
      mockI18n,
    );
  });

  describe('register', () => {
    it('should throw ConflictException (409) if email already exists', async () => {
      mockUsersService.findByEmail.mockResolvedValue({ id: '1', email: 'test@example.com' });

      await expect(
        authService.register({
          email: 'test@example.com',
          password: 'Password123!',
          fullName: 'Test User',
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('should catch database unique constraint violation (23505) and throw ConflictException (409)', async () => {
      mockUsersService.findByEmail.mockResolvedValue(null);
      mockUsersService.create.mockRejectedValue({ code: '23505', message: 'duplicate key value' });

      await expect(
        authService.register({
          email: 'test@example.com',
          password: 'Password123!',
          fullName: 'Test User',
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('should successfully register a new user', async () => {
      mockUsersService.findByEmail.mockResolvedValue(null);
      mockUsersService.create.mockResolvedValue({
        id: 'user-uuid',
        email: 'test@example.com',
        role: UserRole.USER,
        fullName: 'Test User',
      });

      const result = await authService.register({
        email: 'test@example.com',
        password: 'Password123!',
        fullName: 'Test User',
      });

      expect(result).toHaveProperty('message');
      expect(result).toHaveProperty('tokens');
      expect(result.tokens.accessToken).toBe('mock-access-token');
    });
  });

  describe('login', () => {
    it('should throw UnauthorizedException (401) if email not found (and run dummy compare for timing mitigation)', async () => {
      mockUsersService.findByEmail.mockResolvedValue(null);

      await expect(
        authService.login({
          email: 'unknown@example.com',
          password: 'Password123!',
        }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException (401) if password does not match', async () => {
      mockUsersService.findByEmail.mockResolvedValue({
        id: 'user-uuid',
        email: 'test@example.com',
        password: '$2b$10$invalidpasswordhashsomething',
        isActive: true,
      });

      await expect(
        authService.login({
          email: 'test@example.com',
          password: 'WrongPassword123!',
        }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException (401) if account is inactive', async () => {
      // Create a valid bcrypt hash for "Password123!"
      const bcrypt = await import('bcrypt');
      const hash = await bcrypt.hash('Password123!', 10);

      mockUsersService.findByEmail.mockResolvedValue({
        id: 'user-uuid',
        email: 'test@example.com',
        password: hash,
        isActive: false,
      });

      await expect(
        authService.login({
          email: 'test@example.com',
          password: 'Password123!',
        }),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('logout', () => {
    it('should calculate remaining TTL and blacklist token with jti', async () => {
      const expInFuture = Math.floor(Date.now() / 1000) + 3600; // 1 hour later
      mockJwtService.decode.mockReturnValue({
        jti: 'mock-jti-uuid',
        exp: expInFuture,
      });

      const fakeJwt = 'header.payload.signature';
      const result = await authService.logout('user-uuid', fakeJwt);

      expect(mockRedisService.blacklistToken).toHaveBeenCalledWith(
        'mock-jti-uuid',
        expect.any(Number),
      );
      expect(result.message).toBeDefined();
    });
  });
});
