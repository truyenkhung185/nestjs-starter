import { describe, it, expect, beforeEach, vi } from 'vitest';
import { UnauthorizedException } from '@nestjs/common';
import { JwtStrategy } from './jwt.strategy.js';

describe('JwtStrategy', () => {
  let strategy: JwtStrategy;
  let mockConfigService: any;
  let mockUsersService: any;
  let mockRedisService: any;
  let mockI18n: any;

  beforeEach(() => {
    mockConfigService = {
      getOrThrow: vi.fn().mockImplementation((key: string) => {
        if (key === 'JWT_SECRET') return 'super-secret-jwt-key-123456789012345';
        throw new Error(`Key ${key} not found`);
      }),
    };

    mockUsersService = {
      findByIdOrNull: vi.fn(),
    };

    mockRedisService = {
      isTokenBlacklisted: vi.fn().mockResolvedValue(false),
    };

    mockI18n = {
      t: vi.fn().mockImplementation((key: string) => key),
    };

    strategy = new JwtStrategy(
      mockConfigService,
      mockUsersService,
      mockRedisService,
      mockI18n,
    );
  });

  it('should throw UnauthorizedException (401) when token is blacklisted in Redis', async () => {
    mockRedisService.isTokenBlacklisted.mockResolvedValue(true);

    const mockReq = {
      headers: {
        authorization: 'Bearer mock-jwt-token',
      },
    } as any;

    const payload = {
      sub: 'user-id',
      email: 'test@example.com',
      role: 'user',
      jti: 'token-jti-123',
    };

    await expect(strategy.validate(mockReq, payload)).rejects.toThrow(UnauthorizedException);
    expect(mockRedisService.isTokenBlacklisted).toHaveBeenCalledWith('token-jti-123');
  });

  it('should throw UnauthorizedException (401) when user does not exist in DB (user deleted)', async () => {
    mockRedisService.isTokenBlacklisted.mockResolvedValue(false);
    mockUsersService.findByIdOrNull.mockResolvedValue(null);

    const mockReq = {
      headers: {
        authorization: 'Bearer mock-jwt-token',
      },
    } as any;

    const payload = {
      sub: 'deleted-user-id',
      email: 'deleted@example.com',
      role: 'user',
      jti: 'token-jti-456',
    };

    await expect(strategy.validate(mockReq, payload)).rejects.toThrow(UnauthorizedException);
  });

  it('should return user info when token and user are valid', async () => {
    mockRedisService.isTokenBlacklisted.mockResolvedValue(false);
    mockUsersService.findByIdOrNull.mockResolvedValue({
      id: 'valid-user-id',
      email: 'valid@example.com',
      fullName: 'Valid User',
      role: 'user',
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const mockReq = {
      headers: {
        authorization: 'Bearer mock-jwt-token',
      },
    } as any;

    const payload = {
      sub: 'valid-user-id',
      email: 'valid@example.com',
      role: 'user',
      jti: 'token-jti-789',
    };

    const result = await strategy.validate(mockReq, payload);
    expect(result.id).toBe('valid-user-id');
    expect(result.email).toBe('valid@example.com');
    expect(result.jti).toBe('token-jti-789');
  });
});
