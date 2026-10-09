import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { jest } from '@jest/globals';

import { UsersService } from '../users/users.service';
import { UserRole } from '../users/enums/user-role.enum';

// Mock bcrypt BEFORE importing the module that uses it
const bcryptHashMock = jest.fn();
const bcryptCompareMock = jest.fn();

jest.unstable_mockModule('bcrypt', () => ({
  hash: bcryptHashMock,
  compare: bcryptCompareMock,
}));

// These imports must happen AFTER unstable_mockModule()
const { AuthService } = await import('./auth.service');

describe('AuthService', () => {
  let authService: AuthService;

  let usersService: {
    findByEmail: jest.Mock;
    findById: jest.Mock;
    create: jest.Mock;
  };

  let jwtService: {
    signAsync: jest.Mock;
  };

  beforeEach(async () => {
    usersService = {
      findByEmail: jest.fn(),
      findById: jest.fn(),
      create: jest.fn(),
    };

    jwtService = {
      signAsync: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,

        {
          provide: UsersService,
          useValue: usersService,
        },

        {
          provide: JwtService,
          useValue: jwtService,
        },
      ],
    }).compile();

    authService = module.get<AuthService>(AuthService);

    jest.clearAllMocks();
  });

  describe('register', () => {
    it('should create a SALES user', async () => {
      const dto = {
        email: 'sales@example.com',
        password: 'StrongPassword123!',
        firstName: 'John',
        lastName: 'Doe',
      };

      const createdUser = {
        id: 'user-123',
        email: 'sales@example.com',
        passwordHash: 'hashed-password',
        role: UserRole.SALES,
        firstName: 'John',
        lastName: 'Doe',
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      bcryptHashMock.mockResolvedValue('hashed-password');

      usersService.create.mockResolvedValue(createdUser);

      const result = await authService.register(dto);

      expect(bcryptHashMock).toHaveBeenCalledWith('StrongPassword123!', 12);

      expect(usersService.create).toHaveBeenCalledWith({
        email: 'sales@example.com',
        passwordHash: 'hashed-password',
        role: UserRole.SALES,
        firstName: 'John',
        lastName: 'Doe',
      });

      expect(result).toEqual({
        id: 'user-123',
        email: 'sales@example.com',
        role: UserRole.SALES,
        firstName: 'John',
        lastName: 'Doe',
        isActive: true,
        createdAt: createdUser.createdAt,
        updatedAt: createdUser.updatedAt,
      });

      expect(result).not.toHaveProperty('passwordHash');
    });
  });

  describe('login', () => {
    it('should login with valid credentials', async () => {
      const user = {
        id: 'user-123',
        email: 'sales@example.com',
        passwordHash: 'hashed-password',
        role: UserRole.SALES,
        firstName: 'John',
        lastName: 'Doe',
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      usersService.findByEmail.mockResolvedValue(user);

      bcryptCompareMock.mockResolvedValue(true);

      jwtService.signAsync.mockResolvedValue('jwt-token');

      const result = await authService.login({
        email: 'sales@example.com',
        password: 'StrongPassword123!',
      });

      expect(usersService.findByEmail).toHaveBeenCalledWith(
        'sales@example.com',
      );

      expect(bcryptCompareMock).toHaveBeenCalledWith(
        'StrongPassword123!',
        'hashed-password',
      );

      expect(jwtService.signAsync).toHaveBeenCalledWith({
        sub: 'user-123',
        email: 'sales@example.com',
        role: UserRole.SALES,
      });

      expect(result.accessToken).toBe('jwt-token');
      expect(result.tokenType).toBe('Bearer');

      expect(result.user).toEqual(
        expect.objectContaining({
          id: 'user-123',
          email: 'sales@example.com',
          role: UserRole.SALES,
        }),
      );
    });

    it('should reject an unknown email', async () => {
      usersService.findByEmail.mockResolvedValue(null);

      await expect(
        authService.login({
          email: 'unknown@example.com',
          password: 'StrongPassword123!',
        }),
      ).rejects.toThrow(new UnauthorizedException('Invalid email or password'));

      expect(bcryptCompareMock).not.toHaveBeenCalled();
      expect(jwtService.signAsync).not.toHaveBeenCalled();
    });

    it('should reject an inactive user', async () => {
      usersService.findByEmail.mockResolvedValue({
        id: 'user-123',
        email: 'sales@example.com',
        passwordHash: 'hashed-password',
        role: UserRole.SALES,
        isActive: false,
      });

      await expect(
        authService.login({
          email: 'sales@example.com',
          password: 'StrongPassword123!',
        }),
      ).rejects.toThrow(new UnauthorizedException('User account is inactive'));

      expect(bcryptCompareMock).not.toHaveBeenCalled();
    });

    it('should reject an incorrect password', async () => {
      usersService.findByEmail.mockResolvedValue({
        id: 'user-123',
        email: 'sales@example.com',
        passwordHash: 'hashed-password',
        role: UserRole.SALES,
        isActive: true,
      });

      bcryptCompareMock.mockResolvedValue(false);

      await expect(
        authService.login({
          email: 'sales@example.com',
          password: 'WrongPassword123!',
        }),
      ).rejects.toThrow(new UnauthorizedException('Invalid email or password'));

      expect(jwtService.signAsync).not.toHaveBeenCalled();
    });
  });

  describe('validateUser', () => {
    it('should return an active user', async () => {
      const user = {
        id: 'user-123',
        email: 'sales@example.com',
        role: UserRole.SALES,
        isActive: true,
      };

      usersService.findById.mockResolvedValue(user);

      const result = await authService.validateUser('user-123');

      expect(usersService.findById).toHaveBeenCalledWith('user-123');

      expect(result).toEqual(user);
    });

    it('should return null when user does not exist', async () => {
      usersService.findById.mockResolvedValue(null);

      const result = await authService.validateUser('missing-user');

      expect(result).toBeNull();
    });

    it('should return null for an inactive user', async () => {
      usersService.findById.mockResolvedValue({
        id: 'user-123',
        isActive: false,
      });

      const result = await authService.validateUser('user-123');

      expect(result).toBeNull();
    });
  });
});
