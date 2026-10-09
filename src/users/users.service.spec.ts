import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { jest } from '@jest/globals';
import { Repository } from 'typeorm';

import { UsersService } from './users.service';
import { User } from './entities/user.entity';
import { UserRole } from './enums/user-role.enum';

describe('UsersService', () => {
  let usersService: UsersService;

  let repository: {
    findOne: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
  };

  beforeEach(async () => {
    repository = {
      findOne: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,

        {
          provide: getRepositoryToken(User),
          useValue: repository,
        },
      ],
    }).compile();

    usersService = module.get<UsersService>(UsersService);

    jest.clearAllMocks();
  });

  describe('findByEmail', () => {
    it('should find user by lowercase email', async () => {
      const user = {
        id: 'user-123',
        email: 'john@example.com',
      };

      repository.findOne.mockResolvedValue(user);

      const result = await usersService.findByEmail('John@Example.com');

      expect(repository.findOne).toHaveBeenCalledWith({
        where: {
          email: 'john@example.com',
        },
      });

      expect(result).toEqual(user);
    });
  });

  describe('findById', () => {
    it('should find user by id', async () => {
      const user = {
        id: 'user-123',
        email: 'john@example.com',
      };

      repository.findOne.mockResolvedValue(user);

      const result = await usersService.findById('user-123');

      expect(repository.findOne).toHaveBeenCalledWith({
        where: {
          id: 'user-123',
        },
      });

      expect(result).toEqual(user);
    });
  });

  describe('create', () => {
    it('should create a new user', async () => {
      repository.findOne.mockResolvedValue(null);

      const entity = {
        id: 'user-123',
        email: 'john@example.com',
        passwordHash: 'hash',
        role: UserRole.SALES,
        firstName: 'John',
        lastName: 'Doe',
        isActive: true,
      };

      repository.create.mockReturnValue(entity);

      repository.save.mockResolvedValue(entity);

      const result = await usersService.create({
        email: 'John@Example.com',
        passwordHash: 'hash',
        role: UserRole.SALES,
        firstName: 'John',
        lastName: 'Doe',
      });

      expect(repository.create).toHaveBeenCalledWith({
        email: 'john@example.com',
        passwordHash: 'hash',
        role: UserRole.SALES,
        firstName: 'John',
        lastName: 'Doe',
        isActive: true,
      });

      expect(repository.save).toHaveBeenCalledWith(entity);

      expect(result).toEqual(entity);
    });

    it('should reject duplicate email', async () => {
      repository.findOne.mockResolvedValue({
        id: 'existing-user',
        email: 'john@example.com',
      });

      await expect(
        usersService.create({
          email: 'john@example.com',
          passwordHash: 'hash',
          role: UserRole.SALES,
        }),
      ).rejects.toThrow(
        new ConflictException('A user with this email already exists'),
      );

      expect(repository.create).not.toHaveBeenCalled();

      expect(repository.save).not.toHaveBeenCalled();
    });
  });
});
