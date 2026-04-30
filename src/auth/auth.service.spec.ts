// src/auth/auth.service.spec.ts
import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from './auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { UnauthorizedException } from '@nestjs/common';
import { Role } from '@prisma/client';

describe('AuthService', () => {
  let service: AuthService;
  let prisma: PrismaService;
  let jwtService: JwtService;

  const mockPrisma = {
    company: { findUnique: jest.fn() },
    employee: { findFirst: jest.fn(), create: jest.fn() },
    refreshToken: { create: jest.fn(), deleteMany: jest.fn() },
    auditLog: { create: jest.fn() },
    $transaction: jest.fn((cb) => cb(mockPrisma)),
  };

  const mockJwtService = {
    sign: jest.fn().mockReturnValue('mocked_token'),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: JwtService, useValue: mockJwtService },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    prisma = module.get<PrismaService>(PrismaService);
    jwtService = module.get<JwtService>(JwtService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('validateUser', () => {
    it('should return user data if credentials are valid', async () => {
      const mockCompany = { id: 1, subdomain: 'test' };
      const mockUser = {
        id: 1,
        email: 'test@test.com',
        password_hash: await bcrypt.hash('password', 10),
        role: Role.ADMIN,
        company: mockCompany,
      };

      mockPrisma.company.findUnique.mockResolvedValue(mockCompany);
      mockPrisma.employee.findFirst.mockResolvedValue(mockUser);

      const result = await service.validateUser(
        'test@test.com',
        'test',
        'password',
      );
      expect(result).toBeDefined();
      expect(result.email).toBe('test@test.com');
      expect(result.password_hash).toBeUndefined();
    });

    it('should return null if company not found', async () => {
      mockPrisma.company.findUnique.mockResolvedValue(null);
      const result = await service.validateUser(
        'test@test.com',
        'test',
        'password',
      );
      expect(result).toBeNull();
    });

    it('should return null if password is invalid', async () => {
      const mockCompany = { id: 1, subdomain: 'test' };
      const mockUser = {
        id: 1,
        email: 'test@test.com',
        password_hash: await bcrypt.hash('password', 10),
        role: Role.ADMIN,
        company: mockCompany,
      };
      mockPrisma.company.findUnique.mockResolvedValue(mockCompany);
      mockPrisma.employee.findFirst.mockResolvedValue(mockUser);

      const result = await service.validateUser(
        'test@test.com',
        'test',
        'wrong',
      );
      expect(result).toBeNull();
    });
  });

  describe('login', () => {
    it('should return access token and user data', async () => {
      const mockCompany = { id: 1, subdomain: 'test', name: 'Test Co' };
      const mockUser = {
        id: 1,
        email: 'test@test.com',
        password_hash: 'hash',
        name: 'Test User',
        role: Role.ADMIN,
        company_id: 1,
        company: mockCompany,
      };

      jest.spyOn(service, 'validateUser').mockResolvedValue(mockUser as any);

      const result = await service.login(
        { email: 'test@test.com', subdomain: 'test', password: 'pass' },
        null,
      );

      expect(result).toHaveProperty('access_token');
      expect(result.user.email).toBe('test@test.com');
      expect(mockPrisma.refreshToken.create).toHaveBeenCalled();
      expect(mockPrisma.auditLog.create).toHaveBeenCalled();
    });

    it('should throw UnauthorizedException if validateUser returns null', async () => {
      jest.spyOn(service, 'validateUser').mockResolvedValue(null);
      await expect(
        service.login(
          { email: 'test@test.com', subdomain: 'test', password: 'wrong' },
          null,
        ),
      ).rejects.toThrow(UnauthorizedException);
    });
  });
});
