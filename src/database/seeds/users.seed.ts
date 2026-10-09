import { NestFactory } from '@nestjs/core';
import { DataSource } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { AppModule } from '../../app.module';
import { User } from '../../users/entities/user.entity';
import { UserRole } from '../../users/enums/user-role.enum';

async function seedUsers() {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('This development seed script cannot run in production.');
  }

  const app = await NestFactory.createApplicationContext(AppModule);

  try {
    const dataSource = app.get(DataSource);
    const userRepository = dataSource.getRepository(User);

    const accounts = [
      {
        email: 'admin@example.com',
        role: UserRole.ADMIN,
        password: process.env.SEED_ADMIN_PASSWORD ?? 'TechKraft123!',
      },
      {
        email: 'reviewer1@example.com',
        role: UserRole.REVIEWER,
        password: process.env.SEED_REVIEWER1_PASSWORD ?? 'TechKraft123!',
      },
      {
        email: 'reviewer2@example.com',
        role: UserRole.REVIEWER,
        password: process.env.SEED_REVIEWER2_PASSWORD ?? 'TechKraft123!',
      },
      {
        email: 'sales1@example.com',
        role: UserRole.SALES,
        password: process.env.SEED_SALES1_PASSWORD ?? 'TechKraft123!',
      },
      {
        email: 'sales2@example.com',
        role: UserRole.SALES,
        password: process.env.SEED_SALES2_PASSWORD ?? 'TechKraft123!',
      },
    ];

    for (const account of accounts) {
      const existingUser = await userRepository.findOne({
        where: { email: account.email },
      });

      if (existingUser) {
        console.log(`Already exists: ${account.email}`);
        continue;
      }

      const passwordHash = await bcrypt.hash(account.password, 12);

      const user = userRepository.create({
        email: account.email,
        passwordHash,
        role: account.role,
      });

      await userRepository.save(user);
      console.log(`Created ${account.role}: ${account.email}`);
    }

    console.log('User seeding completed.');
  } finally {
    await app.close();
  }
}

seedUsers().catch((error) => {
  console.error('User seeding failed:', error);
  process.exitCode = 1;
});
