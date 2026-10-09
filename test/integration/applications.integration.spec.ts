import { INestApplication } from '@nestjs/common';
import { Repository, DataSource } from 'typeorm';
import { getRepositoryToken } from '@nestjs/typeorm';

import { createTestApp } from './setup';

import { ApplicationsService } from '../../src/applications/applications.service';
import { MerchantApplication } from '../../src/applications/entities/merchant-application.entity';
import { User } from '../../src/users/entities/user.entity';

import { UserRole } from '../../src/users/enums/user-role.enum';
import { ApplicationStatus } from '../../src/applications/enums/application-status.enum';
import { RiskStatus } from '../../src/applications/enums/risk-status.enum';

describe('ApplicationsService - Integration', () => {
  let app: INestApplication;
  let service: ApplicationsService;
  let applicationRepository: Repository<MerchantApplication>;
  let userRepository: Repository<User>;
  let dataSource: DataSource;
  let admin: User;
  let sales: User;
  let anotherSales: User;
  let reviewer: User;
  let anotherReviewer: User;

  beforeAll(async () => {
    const testapp = await createTestApp();
    app = testapp.app;
    service = app.get(ApplicationsService);
    dataSource = testapp.dataSource;
    applicationRepository = app.get(getRepositoryToken(MerchantApplication));

    userRepository = app.get(getRepositoryToken(User));
  });

  beforeEach(async () => {
    await dataSource.query(`
    TRUNCATE TABLE merchant_applications, users
    RESTART IDENTITY
    CASCADE
  `);

    admin = await userRepository.save(
      userRepository.create({
        email: 'admin@test.com',
        passwordHash: 'hashed-password',
        role: UserRole.ADMIN,
        firstName: 'Admin',
        lastName: 'User',
        isActive: true,
      }),
    );

    sales = await userRepository.save(
      userRepository.create({
        email: 'sales@test.com',
        passwordHash: 'hashed-password',
        role: UserRole.SALES,
        firstName: 'Sales',
        lastName: 'User',
        isActive: true,
      }),
    );

    anotherSales = await userRepository.save(
      userRepository.create({
        email: 'sales2@test.com',
        passwordHash: 'hashed-password',
        role: UserRole.SALES,
        firstName: 'Another',
        lastName: 'Sales',
        isActive: true,
      }),
    );

    reviewer = await userRepository.save(
      userRepository.create({
        email: 'reviewer@test.com',
        passwordHash: 'hashed-password',
        role: UserRole.REVIEWER,
        firstName: 'Reviewer',
        lastName: 'User',
        isActive: true,
      }),
    );

    anotherReviewer = await userRepository.save(
      userRepository.create({
        email: 'reviewer2@test.com',
        passwordHash: 'hashed-password',
        role: UserRole.REVIEWER,
        firstName: 'Another',
        lastName: 'Reviewer',
        isActive: true,
      }),
    );
  });

  afterAll(async () => {
    await dataSource.query(`
    TRUNCATE TABLE merchant_applications, users
    RESTART IDENTITY
    CASCADE
  `);
    await app.close();
  });

  describe('create()', () => {
    it('should create a DRAFT application for SALES', async () => {
      const result = await service.create(
        {
          businessName: 'Test Business',
          legalBusinessName: 'Test Business LLC',
          businessType: 'LLC',
          ownerName: 'John Doe',
          ownerEmail: 'john@test.com',
          ownerPhone: '+123456789',
          processingVolume: 10000,
        },
        sales,
      );

      expect(result.id).toBeDefined();
      expect(result.createdById).toBe(sales.id);
      expect(result.applicationStatus).toBe(ApplicationStatus.DRAFT);
      expect(result.riskStatus).toBe(RiskStatus.PENDING);
      expect(result.processingCurrency).toBe('USD');

      const persisted = await applicationRepository.findOneBy({
        id: result.id,
      });

      expect(persisted).not.toBeNull();
      expect(persisted?.createdById).toBe(sales.id);
    });

    it('should allow ADMIN to create an application', async () => {
      const result = await service.create(
        {
          businessName: 'Admin Business',
          legalBusinessName: 'Admin Business LLC',
          businessType: 'LLC',
          ownerName: 'Admin Owner',
          ownerEmail: 'owner@test.com',
          ownerPhone: '+123456789',
        },
        admin,
      );

      expect(result.createdById).toBe(admin.id);
      expect(result.applicationStatus).toBe(ApplicationStatus.DRAFT);
    });

    it('should reject REVIEWER creating an application', async () => {
      await expect(
        service.create(
          {
            businessName: 'Reviewer Business',
            legalBusinessName: 'Reviewer Business LLC',
            businessType: 'LLC',
            ownerName: 'Reviewer Owner',
            ownerEmail: 'owner@test.com',
            ownerPhone: '+123456789',
          },
          reviewer,
        ),
      ).rejects.toThrow('Only ADMIN or SALES can create applications');
    });
  });

  describe('findAll()', () => {
    it('should return only applications created by SALES user', async () => {
      await service.create(
        {
          businessName: 'Sales Business',
          legalBusinessName: 'Sales Business LLC',
          businessType: 'LLC',
          ownerName: 'Owner One',
          ownerEmail: 'one@test.com',
          ownerPhone: '+111111111',
        },
        sales,
      );

      await service.create(
        {
          businessName: 'Other Business',
          legalBusinessName: 'Other Business LLC',
          businessType: 'LLC',
          ownerName: 'Owner Two',
          ownerEmail: 'two@test.com',
          ownerPhone: '+222222222',
        },
        anotherSales,
      );

      const result = await service.findAll(
        {
          page: 1,
          limit: 20,
        },
        sales,
      );

      expect(result.meta.total).toBe(1);
      expect(result.data).toHaveLength(1);
      expect(result.data[0].createdById).toBe(sales.id);
    });

    it('should return only applications assigned to REVIEWER', async () => {
      const first = await service.create(
        {
          businessName: 'Business One',
          legalBusinessName: 'Business One LLC',
          businessType: 'LLC',
          ownerName: 'Owner One',
          ownerEmail: 'one@test.com',
          ownerPhone: '+111111111',
        },
        sales,
      );

      const second = await service.create(
        {
          businessName: 'Business Two',
          legalBusinessName: 'Business Two LLC',
          businessType: 'LLC',
          ownerName: 'Owner Two',
          ownerEmail: 'two@test.com',
          ownerPhone: '+222222222',
        },
        sales,
      );

      first.applicationStatus = ApplicationStatus.SUBMITTED;
      second.applicationStatus = ApplicationStatus.SUBMITTED;

      await applicationRepository.save([first, second]);

      await service.assignReviewer(
        first.id,
        { reviewerId: reviewer.id },
        admin,
      );

      await service.assignReviewer(
        second.id,
        { reviewerId: anotherReviewer.id },
        admin,
      );

      const result = await service.findAll(
        {
          page: 1,
          limit: 20,
        },
        reviewer,
      );

      expect(result.meta.total).toBe(1);
      expect(result.data).toHaveLength(1);
      expect(result.data[0].id).toBe(first.id);
      expect(result.data[0].assignedReviewerId).toBe(reviewer.id);
    });

    it('should allow ADMIN to see all applications', async () => {
      await service.create(
        {
          businessName: 'Business One',
          legalBusinessName: 'Business One LLC',
          businessType: 'LLC',
          ownerName: 'Owner One',
          ownerEmail: 'one@test.com',
          ownerPhone: '+111111111',
        },
        sales,
      );

      await service.create(
        {
          businessName: 'Business Two',
          legalBusinessName: 'Business Two LLC',
          businessType: 'LLC',
          ownerName: 'Owner Two',
          ownerEmail: 'two@test.com',
          ownerPhone: '+222222222',
        },
        anotherSales,
      );

      const result = await service.findAll(
        {
          page: 1,
          limit: 20,
        },
        admin,
      );

      expect(result.meta.total).toBe(2);
    });

    it('should filter by application status', async () => {
      const draft = await service.create(
        {
          businessName: 'Draft Business',
          legalBusinessName: 'Draft Business LLC',
          businessType: 'LLC',
          ownerName: 'Draft Owner',
          ownerEmail: 'draft@test.com',
          ownerPhone: '+111111111',
        },
        sales,
      );

      const submitted = await service.create(
        {
          businessName: 'Submitted Business',
          legalBusinessName: 'Submitted Business LLC',
          businessType: 'LLC',
          ownerName: 'Submitted Owner',
          ownerEmail: 'submitted@test.com',
          ownerPhone: '+222222222',
        },
        sales,
      );

      submitted.applicationStatus = ApplicationStatus.SUBMITTED;
      await applicationRepository.save(submitted);

      const result = await service.findAll(
        {
          page: 1,
          limit: 20,
          status: ApplicationStatus.SUBMITTED,
        },
        sales,
      );

      expect(result.meta.total).toBe(1);
      expect(result.data[0].id).toBe(submitted.id);
      expect(result.data[0].id).not.toBe(draft.id);
    });

    it('should paginate results', async () => {
      for (let i = 0; i < 5; i++) {
        await service.create(
          {
            businessName: `Business ${i}`,
            legalBusinessName: `Business ${i} LLC`,
            businessType: 'LLC',
            ownerName: `Owner ${i}`,
            ownerEmail: `owner${i}@test.com`,
            ownerPhone: `+12345678${i}`,
          },
          sales,
        );
      }

      const result = await service.findAll(
        {
          page: 2,
          limit: 2,
        },
        sales,
      );

      expect(result.data).toHaveLength(2);
      expect(result.meta.page).toBe(2);
      expect(result.meta.limit).toBe(2);
      expect(result.meta.total).toBe(5);
      expect(result.meta.totalPages).toBe(3);
    });
  });

  describe('findOne()', () => {
    it('should allow SALES to view their own application', async () => {
      const application = await service.create(
        {
          businessName: 'My Business',
          legalBusinessName: 'My Business LLC',
          businessType: 'LLC',
          ownerName: 'Owner',
          ownerEmail: 'owner@test.com',
          ownerPhone: '+123456789',
        },
        sales,
      );

      const result = await service.findOne(application.id, sales);

      expect(result.id).toBe(application.id);
    });

    it('should prevent SALES from viewing another user application', async () => {
      const application = await service.create(
        {
          businessName: 'Other Business',
          legalBusinessName: 'Other Business LLC',
          businessType: 'LLC',
          ownerName: 'Owner',
          ownerEmail: 'owner@test.com',
          ownerPhone: '+123456789',
        },
        anotherSales,
      );

      await expect(service.findOne(application.id, sales)).rejects.toThrow(
        'You can only access applications you created',
      );
    });

    it('should allow ADMIN to view any application', async () => {
      const application = await service.create(
        {
          businessName: 'Business',
          legalBusinessName: 'Business LLC',
          businessType: 'LLC',
          ownerName: 'Owner',
          ownerEmail: 'owner@test.com',
          ownerPhone: '+123456789',
        },
        sales,
      );

      const result = await service.findOne(application.id, admin);

      expect(result.id).toBe(application.id);
    });

    it('should allow assigned REVIEWER to view application', async () => {
      const application = await service.create(
        {
          businessName: 'Business',
          legalBusinessName: 'Business LLC',
          businessType: 'LLC',
          ownerName: 'Owner',
          ownerEmail: 'owner@test.com',
          ownerPhone: '+123456789',
        },
        sales,
      );

      application.applicationStatus = ApplicationStatus.SUBMITTED;
      await applicationRepository.save(application);

      await service.assignReviewer(
        application.id,
        { reviewerId: reviewer.id },
        admin,
      );

      const result = await service.findOne(application.id, reviewer);

      expect(result.id).toBe(application.id);
      expect(result.assignedReviewerId).toBe(reviewer.id);
    });

    it('should reject unassigned REVIEWER', async () => {
      const application = await service.create(
        {
          businessName: 'Business',
          legalBusinessName: 'Business LLC',
          businessType: 'LLC',
          ownerName: 'Owner',
          ownerEmail: 'owner@test.com',
          ownerPhone: '+123456789',
        },
        sales,
      );

      await expect(service.findOne(application.id, reviewer)).rejects.toThrow(
        'You are not assigned to this application',
      );
    });

    it('should throw when application does not exist', async () => {
      await expect(
        service.findOne('00000000-0000-0000-0000-000000000000', admin),
      ).rejects.toThrow('Application not found');
    });
  });

  describe('update()', () => {
    it('should allow SALES to update their DRAFT', async () => {
      const application = await service.create(
        {
          businessName: 'Original Business',
          legalBusinessName: 'Original Business LLC',
          businessType: 'LLC',
          ownerName: 'Owner',
          ownerEmail: 'owner@test.com',
          ownerPhone: '+123456789',
        },
        sales,
      );

      const result = await service.update(
        application.id,
        {
          businessName: 'Updated Business',
        },
        sales,
      );

      expect(result.businessName).toBe('Updated Business');

      const persisted = await applicationRepository.findOneBy({
        id: application.id,
      });

      expect(persisted?.businessName).toBe('Updated Business');
    });

    it('should allow SALES to update NEEDS_INFO application', async () => {
      const application = await service.create(
        {
          businessName: 'Business',
          legalBusinessName: 'Business LLC',
          businessType: 'LLC',
          ownerName: 'Owner',
          ownerEmail: 'owner@test.com',
          ownerPhone: '+123456789',
        },
        sales,
      );

      application.applicationStatus = ApplicationStatus.NEEDS_INFO;
      application.riskStatus = RiskStatus.NEEDS_INFO;

      await applicationRepository.save(application);

      const result = await service.update(
        application.id,
        {
          businessName: 'Updated Business',
        },
        sales,
      );

      expect(result.businessName).toBe('Updated Business');
    });

    it('should prevent SALES from updating another user application', async () => {
      const application = await service.create(
        {
          businessName: 'Business',
          legalBusinessName: 'Business LLC',
          businessType: 'LLC',
          ownerName: 'Owner',
          ownerEmail: 'owner@test.com',
          ownerPhone: '+123456789',
        },
        anotherSales,
      );

      await expect(
        service.update(
          application.id,
          { businessName: 'Hacked Business' },
          sales,
        ),
      ).rejects.toThrow('You can only edit applications you created');
    });

    it.each([
      ApplicationStatus.SUBMITTED,
      ApplicationStatus.UNDER_REVIEW,
      ApplicationStatus.COMPLETED,
    ])('should reject SALES updating application in %s', async (status) => {
      const application = await service.create(
        {
          businessName: 'Business',
          legalBusinessName: 'Business LLC',
          businessType: 'LLC',
          ownerName: 'Owner',
          ownerEmail: 'owner@test.com',
          ownerPhone: '+123456789',
        },
        sales,
      );

      application.applicationStatus = status;
      await applicationRepository.save(application);

      await expect(
        service.update(application.id, { businessName: 'Updated' }, sales),
      ).rejects.toThrow(
        `Application cannot be edited while status is ${status}`,
      );
    });

    it('should allow ADMIN to update any application', async () => {
      const application = await service.create(
        {
          businessName: 'Business',
          legalBusinessName: 'Business LLC',
          businessType: 'LLC',
          ownerName: 'Owner',
          ownerEmail: 'owner@test.com',
          ownerPhone: '+123456789',
        },
        sales,
      );

      const result = await service.update(
        application.id,
        { businessName: 'Admin Updated' },
        admin,
      );

      expect(result.businessName).toBe('Admin Updated');
    });

    it('should prevent REVIEWER from updating applications', async () => {
      const application = await service.create(
        {
          businessName: 'Business',
          legalBusinessName: 'Business LLC',
          businessType: 'LLC',
          ownerName: 'Owner',
          ownerEmail: 'owner@test.com',
          ownerPhone: '+123456789',
        },
        sales,
      );

      await expect(
        service.update(application.id, { businessName: 'Updated' }, reviewer),
      ).rejects.toThrow('You do not have permission to edit applications');
    });
  });

  describe('submit()', () => {
    it('should submit a DRAFT application', async () => {
      const application = await service.create(
        {
          businessName: 'Business',
          legalBusinessName: 'Business LLC',
          businessType: 'LLC',
          ownerName: 'Owner',
          ownerEmail: 'owner@test.com',
          ownerPhone: '+123456789',
        },
        sales,
      );

      const result = await service.submit(application.id, sales);

      expect(result.applicationStatus).toBe(ApplicationStatus.SUBMITTED);
      expect(result.riskStatus).toBe(RiskStatus.PENDING);
    });

    it('should resubmit a NEEDS_INFO application', async () => {
      const application = await service.create(
        {
          businessName: 'Business',
          legalBusinessName: 'Business LLC',
          businessType: 'LLC',
          ownerName: 'Owner',
          ownerEmail: 'owner@test.com',
          ownerPhone: '+123456789',
        },
        sales,
      );

      application.applicationStatus = ApplicationStatus.NEEDS_INFO;
      application.riskStatus = RiskStatus.NEEDS_INFO;

      await applicationRepository.save(application);

      const result = await service.submit(application.id, sales);

      expect(result.applicationStatus).toBe(ApplicationStatus.SUBMITTED);
      expect(result.riskStatus).toBe(RiskStatus.PENDING);
    });

    it.each([
      ApplicationStatus.SUBMITTED,
      ApplicationStatus.UNDER_REVIEW,
      ApplicationStatus.COMPLETED,
    ])('should reject submission from %s', async (status) => {
      const application = await service.create(
        {
          businessName: 'Business',
          legalBusinessName: 'Business LLC',
          businessType: 'LLC',
          ownerName: 'Owner',
          ownerEmail: 'owner@test.com',
          ownerPhone: '+123456789',
        },
        sales,
      );

      application.applicationStatus = status;
      await applicationRepository.save(application);

      await expect(service.submit(application.id, sales)).rejects.toThrow(
        `Application cannot be edited while status is ${status}`,
      );
    });
  });

  describe('assignReviewer()', () => {
    it('should assign an active REVIEWER and move application to UNDER_REVIEW', async () => {
      const application = await service.create(
        {
          businessName: 'Business',
          legalBusinessName: 'Business LLC',
          businessType: 'LLC',
          ownerName: 'Owner',
          ownerEmail: 'owner@test.com',
          ownerPhone: '+123456789',
        },
        sales,
      );

      await service.submit(application.id, sales);

      const result = await service.assignReviewer(
        application.id,
        { reviewerId: reviewer.id },
        admin,
      );

      expect(result.assignedReviewerId).toBe(reviewer.id);
      expect(result.applicationStatus).toBe(ApplicationStatus.UNDER_REVIEW);

      const persisted = await applicationRepository.findOneBy({
        id: application.id,
      });

      expect(persisted?.assignedReviewerId).toBe(reviewer.id);
      expect(persisted?.applicationStatus).toBe(ApplicationStatus.UNDER_REVIEW);
    });

    it('should reject SALES assigning reviewers', async () => {
      const application = await service.create(
        {
          businessName: 'Business',
          legalBusinessName: 'Business LLC',
          businessType: 'LLC',
          ownerName: 'Owner',
          ownerEmail: 'owner@test.com',
          ownerPhone: '+123456789',
        },
        sales,
      );

      await expect(
        service.assignReviewer(
          application.id,
          { reviewerId: reviewer.id },
          sales,
        ),
      ).rejects.toThrow('Only ADMIN can assign reviewers');
    });

    it('should reject REVIEWER assigning reviewers', async () => {
      const application = await service.create(
        {
          businessName: 'Business',
          legalBusinessName: 'Business LLC',
          businessType: 'LLC',
          ownerName: 'Owner',
          ownerEmail: 'owner@test.com',
          ownerPhone: '+123456789',
        },
        sales,
      );

      await expect(
        service.assignReviewer(
          application.id,
          { reviewerId: reviewer.id },
          reviewer,
        ),
      ).rejects.toThrow('Only ADMIN can assign reviewers');
    });

    it('should reject assignment unless application is SUBMITTED', async () => {
      const application = await service.create(
        {
          businessName: 'Business',
          legalBusinessName: 'Business LLC',
          businessType: 'LLC',
          ownerName: 'Owner',
          ownerEmail: 'owner@test.com',
          ownerPhone: '+123456789',
        },
        sales,
      );

      await expect(
        service.assignReviewer(
          application.id,
          { reviewerId: reviewer.id },
          admin,
        ),
      ).rejects.toThrow(
        `Application cannot be assigned from status ${ApplicationStatus.DRAFT}`,
      );
    });

    it('should reject nonexistent reviewer', async () => {
      const application = await service.create(
        {
          businessName: 'Business',
          legalBusinessName: 'Business LLC',
          businessType: 'LLC',
          ownerName: 'Owner',
          ownerEmail: 'owner@test.com',
          ownerPhone: '+123456789',
        },
        sales,
      );

      await service.submit(application.id, sales);

      await expect(
        service.assignReviewer(
          application.id,
          {
            reviewerId: '00000000-0000-0000-0000-000000000000',
          },
          admin,
        ),
      ).rejects.toThrow('Reviewer not found');
    });

    it('should reject assigning a SALES user as reviewer', async () => {
      const application = await service.create(
        {
          businessName: 'Business',
          legalBusinessName: 'Business LLC',
          businessType: 'LLC',
          ownerName: 'Owner',
          ownerEmail: 'owner@test.com',
          ownerPhone: '+123456789',
        },
        sales,
      );

      await service.submit(application.id, sales);

      await expect(
        service.assignReviewer(application.id, { reviewerId: sales.id }, admin),
      ).rejects.toThrow('User must have REVIEWER role');
    });

    it('should reject inactive reviewer', async () => {
      reviewer.isActive = false;
      await userRepository.save(reviewer);

      const application = await service.create(
        {
          businessName: 'Business',
          legalBusinessName: 'Business LLC',
          businessType: 'LLC',
          ownerName: 'Owner',
          ownerEmail: 'owner@test.com',
          ownerPhone: '+123456789',
        },
        sales,
      );

      await service.submit(application.id, sales);

      await expect(
        service.assignReviewer(
          application.id,
          { reviewerId: reviewer.id },
          admin,
        ),
      ).rejects.toThrow('Reviewer is inactive');
    });
  });

  describe('recordRiskDecision()', () => {
    async function createUnderReviewApplication() {
      const application = await service.create(
        {
          businessName: 'Business',
          legalBusinessName: 'Business LLC',
          businessType: 'LLC',
          ownerName: 'Owner',
          ownerEmail: 'owner@test.com',
          ownerPhone: '+123456789',
        },
        sales,
      );

      await service.submit(application.id, sales);

      return service.assignReviewer(
        application.id,
        { reviewerId: reviewer.id },
        admin,
      );
    }

    it('should approve application', async () => {
      const application = await createUnderReviewApplication();

      const result = await service.recordRiskDecision(
        application.id,
        {
          decision: RiskStatus.APPROVED,
        },
        reviewer,
      );

      expect(result.riskStatus).toBe(RiskStatus.APPROVED);
      expect(result.applicationStatus).toBe(ApplicationStatus.COMPLETED);
    });

    it('should reject application', async () => {
      const application = await createUnderReviewApplication();

      const result = await service.recordRiskDecision(
        application.id,
        {
          decision: RiskStatus.REJECTED,
          reason: 'High risk merchant',
        },
        reviewer,
      );

      expect(result.riskStatus).toBe(RiskStatus.REJECTED);
      expect(result.applicationStatus).toBe(ApplicationStatus.COMPLETED);
    });

    it('should request additional information', async () => {
      const application = await createUnderReviewApplication();

      const result = await service.recordRiskDecision(
        application.id,
        {
          decision: RiskStatus.NEEDS_INFO,
          reason: 'Need additional business documents',
        },
        reviewer,
      );

      expect(result.riskStatus).toBe(RiskStatus.NEEDS_INFO);
      expect(result.applicationStatus).toBe(ApplicationStatus.NEEDS_INFO);
    });

    it('should allow ADMIN to make a risk decision', async () => {
      const application = await createUnderReviewApplication();

      const result = await service.recordRiskDecision(
        application.id,
        {
          decision: RiskStatus.APPROVED,
        },
        admin,
      );

      expect(result.riskStatus).toBe(RiskStatus.APPROVED);
      expect(result.applicationStatus).toBe(ApplicationStatus.COMPLETED);
    });

    it('should reject an unassigned REVIEWER', async () => {
      const application = await createUnderReviewApplication();

      await expect(
        service.recordRiskDecision(
          application.id,
          { decision: RiskStatus.APPROVED },
          anotherReviewer,
        ),
      ).rejects.toThrow('You are not the assigned reviewer');
    });

    it('should reject SALES making a risk decision', async () => {
      const application = await createUnderReviewApplication();

      await expect(
        service.recordRiskDecision(
          application.id,
          { decision: RiskStatus.APPROVED },
          sales,
        ),
      ).rejects.toThrow('SALES users cannot make risk decisions');
    });

    it('should reject PENDING as a risk decision', async () => {
      const application = await createUnderReviewApplication();

      await expect(
        service.recordRiskDecision(
          application.id,
          { decision: RiskStatus.PENDING },
          reviewer,
        ),
      ).rejects.toThrow('PENDING cannot be used as a risk decision');
    });

    it('should reject risk decision when application is not UNDER_REVIEW', async () => {
      const application = await service.create(
        {
          businessName: 'Business',
          legalBusinessName: 'Business LLC',
          businessType: 'LLC',
          ownerName: 'Owner',
          ownerEmail: 'owner@test.com',
          ownerPhone: '+123456789',
        },
        sales,
      );

      await expect(
        service.recordRiskDecision(
          application.id,
          { decision: RiskStatus.APPROVED },
          admin,
        ),
      ).rejects.toThrow(
        `Risk decision cannot be made from status ${ApplicationStatus.DRAFT}`,
      );
    });

    it('should reject a second decision after COMPLETED', async () => {
      const application = await createUnderReviewApplication();

      await service.recordRiskDecision(
        application.id,
        { decision: RiskStatus.APPROVED },
        reviewer,
      );

      await expect(
        service.recordRiskDecision(
          application.id,
          { decision: RiskStatus.REJECTED },
          reviewer,
        ),
      ).rejects.toThrow(
        `Risk decision cannot be made from status ${ApplicationStatus.COMPLETED}`,
      );
    });
  });

  describe('full lifecycle', () => {
    it('should complete DRAFT -> SUBMITTED -> UNDER_REVIEW -> APPROVED -> COMPLETED', async () => {
      const application = await service.create(
        {
          businessName: 'Lifecycle Business',
          legalBusinessName: 'Lifecycle Business LLC',
          businessType: 'LLC',
          ownerName: 'Lifecycle Owner',
          ownerEmail: 'lifecycle@test.com',
          ownerPhone: '+123456789',
          processingVolume: 50000,
        },
        sales,
      );

      expect(application.applicationStatus).toBe(ApplicationStatus.DRAFT);

      await service.submit(application.id, sales);

      let persisted = await applicationRepository.findOneBy({
        id: application.id,
      });

      expect(persisted?.applicationStatus).toBe(ApplicationStatus.SUBMITTED);

      await service.assignReviewer(
        application.id,
        { reviewerId: reviewer.id },
        admin,
      );

      persisted = await applicationRepository.findOneBy({
        id: application.id,
      });

      expect(persisted?.applicationStatus).toBe(ApplicationStatus.UNDER_REVIEW);
      expect(persisted?.assignedReviewerId).toBe(reviewer.id);

      await service.recordRiskDecision(
        application.id,
        { decision: RiskStatus.APPROVED },
        reviewer,
      );

      persisted = await applicationRepository.findOneBy({
        id: application.id,
      });

      expect(persisted?.applicationStatus).toBe(ApplicationStatus.COMPLETED);
      expect(persisted?.riskStatus).toBe(RiskStatus.APPROVED);
    });

    it('should support NEEDS_INFO -> update -> resubmit -> review', async () => {
      const application = await service.create(
        {
          businessName: 'Needs Info Business',
          legalBusinessName: 'Needs Info Business LLC',
          businessType: 'LLC',
          ownerName: 'Owner',
          ownerEmail: 'owner@test.com',
          ownerPhone: '+123456789',
        },
        sales,
      );

      await service.submit(application.id, sales);

      await service.assignReviewer(
        application.id,
        { reviewerId: reviewer.id },
        admin,
      );

      await service.recordRiskDecision(
        application.id,
        {
          decision: RiskStatus.NEEDS_INFO,
          reason: 'Need more documents',
        },
        reviewer,
      );

      let persisted = await applicationRepository.findOneBy({
        id: application.id,
      });

      expect(persisted?.applicationStatus).toBe(ApplicationStatus.NEEDS_INFO);
      expect(persisted?.riskStatus).toBe(RiskStatus.NEEDS_INFO);

      await service.update(
        application.id,
        {
          businessName: 'Updated Business',
        },
        sales,
      );

      await service.submit(application.id, sales);

      persisted = await applicationRepository.findOneBy({
        id: application.id,
      });

      expect(persisted?.applicationStatus).toBe(ApplicationStatus.SUBMITTED);
      expect(persisted?.riskStatus).toBe(RiskStatus.PENDING);

      await service.assignReviewer(
        application.id,
        { reviewerId: reviewer.id },
        admin,
      );

      persisted = await applicationRepository.findOneBy({
        id: application.id,
      });

      expect(persisted?.applicationStatus).toBe(ApplicationStatus.UNDER_REVIEW);
    });
  });

  describe('database persistence', () => {
    it('should persist createdBy and assignedReviewer relationships', async () => {
      const application = await service.create(
        {
          businessName: 'Relationship Business',
          legalBusinessName: 'Relationship Business LLC',
          businessType: 'LLC',
          ownerName: 'Owner',
          ownerEmail: 'owner@test.com',
          ownerPhone: '+123456789',
        },
        sales,
      );

      await service.submit(application.id, sales);

      await service.assignReviewer(
        application.id,
        { reviewerId: reviewer.id },
        admin,
      );

      const persisted = await applicationRepository.findOne({
        where: { id: application.id },
        relations: {
          createdBy: true,
          assignedReviewer: true,
        },
      });

      expect(persisted).not.toBeNull();
      expect(persisted?.createdBy.id).toBe(sales.id);
      expect(persisted?.createdBy.email).toBe('sales@test.com');
      expect(persisted?.assignedReviewer?.id).toBe(reviewer.id);
      expect(persisted?.assignedReviewer?.email).toBe('reviewer@test.com');
    });

    it('should persist timestamps', async () => {
      const application = await service.create(
        {
          businessName: 'Timestamp Business',
          legalBusinessName: 'Timestamp Business LLC',
          businessType: 'LLC',
          ownerName: 'Owner',
          ownerEmail: 'owner@test.com',
          ownerPhone: '+123456789',
        },
        sales,
      );

      expect(application.createdAt).toBeInstanceOf(Date);
      expect(application.updatedAt).toBeInstanceOf(Date);
    });
  });
});
