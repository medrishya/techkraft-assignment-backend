import { ConflictException, Injectable } from '@nestjs/common';

import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { User } from './entities/user.entity';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
  ) {}

  async findByEmail(email: string): Promise<User | null> {
    return this.usersRepository.findOne({
      where: {
        email: email.toLowerCase(),
      },
    });
  }

  async findById(id: string): Promise<User | null> {
    return this.usersRepository.findOne({
      where: { id },
    });
  }

  async create(data: {
    email: string;
    passwordHash: string;
    role: User['role'];
    firstName?: string;
    lastName?: string;
  }): Promise<User> {
    const existingUser = await this.findByEmail(data.email);

    if (existingUser) {
      throw new ConflictException('A user with this email already exists');
    }

    const user = this.usersRepository.create({
      email: data.email.toLowerCase(),
      passwordHash: data.passwordHash,
      role: data.role,
      firstName: data.firstName ?? null,
      lastName: data.lastName ?? null,
      isActive: true,
    });

    return this.usersRepository.save(user);
  }
}
