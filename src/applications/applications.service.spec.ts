import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { ApplicationsService } from './applications.service';
import { jest } from '@jest/globals';
import { ApplicationStatus } from './enums/application-status.enum';
import { RiskStatus } from './enums/risk-status.enum';
import { UserRole } from '../users/enums/user-role.enum';

describe('ApplicationsService', () => {
  let service: ApplicationsService;

  let applicationRepository: {
    create: jest.Mock;
    save: jest.Mock;
    findOne: jest.Mock;
    findAndCount: jest.Mock;
  };

  let userRepository: {
    findOne: jest.Mock;
  };

  let riskReviewQueue: {
    record: jest.Mock;
  };

  let mockAuditTrailService: {
    enqueue: jest.Mock;
  };

  const salesUser = {
    id: 'sales-1',
    email: 'sales@example.com',
    role: UserRole.SALES,
    isActive: true,
  };

  const anotherSalesUser = {
    id: 'sales-2',
    email: 'sales2@example.com',
    role: UserRole.SALES,
    isActive: true,
  };

  const reviewerUser = {
    id: 'reviewer-1',
    email: 'reviewer@example.com',
    role: UserRole.REVIEWER,
    isActive: true,
  };

  const anotherReviewer = {
    id: 'reviewer-2',
    email: 'reviewer2@example.com',
    role: UserRole.REVIEWER,
    isActive: true,
  };

  const adminUser = {
    id: 'admin-1',
    email: 'admin@example.com',
    role: UserRole.ADMIN,
    isActive: true,
  };

  const createDto = {
    businessName: 'Acme Store',
    legalBusinessName: 'Acme Store LLC',
    businessType: 'RETAIL',
    ownerName: 'John Doe',
    ownerEmail: 'john@acme.com',
    ownerPhone: '+123456789',
    processingVolume: 10000,
    processingCurrency: 'USD',
  };

  const createApplication = (overrides: Record<string, any> = {}) => ({
    id: 'application-1',
    businessName: 'Acme Store',
    legalBusinessName: 'Acme Store LLC',
    businessType: 'RETAIL',
    ownerName: 'John Doe',
    ownerEmail: 'john@acme.com',
    ownerPhone: '+123456789',
    processingVolume: 10000,
    processingCurrency: 'USD',

    applicationStatus: ApplicationStatus.DRAFT,
    riskStatus: RiskStatus.PENDING,

    createdById: salesUser.id,
    createdBy: salesUser,

    assignedReviewerId: null,
    assignedReviewer: null,

    ...overrides,
  });

  beforeEach(() => {
    applicationRepository = {
      create: jest.fn(),
      save: jest.fn(),
      findOne: jest.fn(),
      findAndCount: jest.fn(),
    };

    userRepository = {
      findOne: jest.fn(),
    };

    riskReviewQueue = { enqueue: jest.fn().mockResolvedValue(undefined) };

    mockAuditTrailService = { record: jest.fn().mockResolvedValue(undefined) };

    service = new ApplicationsService(
      applicationRepository as any,
      userRepository as any,
      riskReviewQueue as any,
      mockAuditTrailService as any,
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // ============================================================
  // CREATE
  // ============================================================

  describe('create', () => {
    it('should allow SALES to create an application', async () => {
      const application = createApplication();

      applicationRepository.create.mockReturnValue(application);

      applicationRepository.save.mockResolvedValue(application);

      const result = await service.create(createDto, salesUser as any);

      expect(applicationRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          ...createDto,
          processingCurrency: 'USD',
          createdById: salesUser.id,
          applicationStatus: ApplicationStatus.DRAFT,
          riskStatus: RiskStatus.PENDING,
        }),
      );

      expect(applicationRepository.save).toHaveBeenCalledWith(application);

      expect(result).toEqual(application);
    });

    it('should allow ADMIN to create an application', async () => {
      const application = createApplication({
        createdById: adminUser.id,
      });

      applicationRepository.create.mockReturnValue(application);

      applicationRepository.save.mockResolvedValue(application);

      const result = await service.create(createDto, adminUser as any);

      expect(result).toEqual(application);
    });

    it('should reject REVIEWER from creating an application', async () => {
      await expect(
        service.create(createDto, reviewerUser as any),
      ).rejects.toThrow(ForbiddenException);

      expect(applicationRepository.create).not.toHaveBeenCalled();
    });

    it('should default processing currency to USD', async () => {
      const dtoWithoutCurrency = {
        ...createDto,
        processingCurrency: undefined,
      };

      const application = createApplication();

      applicationRepository.create.mockReturnValue(application);

      applicationRepository.save.mockResolvedValue(application);

      await service.create(dtoWithoutCurrency, salesUser as any);

      expect(applicationRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          processingCurrency: 'USD',
        }),
      );
    });
  });

  // ============================================================
  // FIND ALL
  // ============================================================

  describe('findAll', () => {
    it('should return only applications created by SALES user', async () => {
      const applications = [createApplication()];

      applicationRepository.findAndCount.mockResolvedValue([applications, 1]);

      const result = await service.findAll(
        {
          page: 1,
          limit: 20,
        } as any,
        salesUser as any,
      );

      expect(applicationRepository.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            createdById: salesUser.id,
          },
        }),
      );

      expect(result.data).toEqual(applications);
      expect(result.meta).toEqual({
        page: 1,
        limit: 20,
        total: 1,
        totalPages: 1,
      });
    });

    it('should return only assigned applications for REVIEWER', async () => {
      const applications = [
        createApplication({
          assignedReviewerId: reviewerUser.id,
          applicationStatus: ApplicationStatus.UNDER_REVIEW,
        }),
      ];

      applicationRepository.findAndCount.mockResolvedValue([applications, 1]);

      await service.findAll(
        {
          page: 1,
          limit: 20,
        } as any,
        reviewerUser as any,
      );

      expect(applicationRepository.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            assignedReviewerId: reviewerUser.id,
          },
        }),
      );
    });

    it('should return all applications for ADMIN', async () => {
      const applications = [
        createApplication(),
        createApplication({
          id: 'application-2',
          createdById: anotherSalesUser.id,
        }),
      ];

      applicationRepository.findAndCount.mockResolvedValue([applications, 2]);

      const result = await service.findAll(
        {
          page: 1,
          limit: 20,
        } as any,
        adminUser as any,
      );

      expect(applicationRepository.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {},
        }),
      );

      expect(result.meta.total).toBe(2);
    });

    it('should filter applications by status', async () => {
      applicationRepository.findAndCount.mockResolvedValue([[], 0]);

      await service.findAll(
        {
          page: 1,
          limit: 20,
          status: ApplicationStatus.SUBMITTED,
        } as any,
        salesUser as any,
      );

      expect(applicationRepository.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            createdById: salesUser.id,
            applicationStatus: ApplicationStatus.SUBMITTED,
          },
        }),
      );
    });

    it('should calculate pagination correctly', async () => {
      applicationRepository.findAndCount.mockResolvedValue([[], 45]);

      const result = await service.findAll(
        {
          page: 2,
          limit: 20,
        } as any,
        adminUser as any,
      );

      expect(applicationRepository.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 20,
          take: 20,
        }),
      );

      expect(result.meta).toEqual({
        page: 2,
        limit: 20,
        total: 45,
        totalPages: 3,
      });
    });
  });

  // ============================================================
  // FIND ONE
  // ============================================================

  describe('findOne', () => {
    it('should allow SALES to view their own application', async () => {
      const application = createApplication();

      applicationRepository.findOne.mockResolvedValue(application);

      const result = await service.findOne(application.id, salesUser as any);

      expect(result).toEqual(application);
    });

    it('should reject SALES viewing another user application', async () => {
      const application = createApplication({
        createdById: anotherSalesUser.id,
      });

      applicationRepository.findOne.mockResolvedValue(application);

      await expect(
        service.findOne(application.id, salesUser as any),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should allow ADMIN to view any application', async () => {
      const application = createApplication({
        createdById: anotherSalesUser.id,
      });

      applicationRepository.findOne.mockResolvedValue(application);

      const result = await service.findOne(application.id, adminUser as any);

      expect(result).toEqual(application);
    });

    it('should allow assigned REVIEWER to view application', async () => {
      const application = createApplication({
        assignedReviewerId: reviewerUser.id,
        applicationStatus: ApplicationStatus.UNDER_REVIEW,
      });

      applicationRepository.findOne.mockResolvedValue(application);

      const result = await service.findOne(application.id, reviewerUser as any);

      expect(result).toEqual(application);
    });

    it('should reject unassigned REVIEWER from viewing application', async () => {
      const application = createApplication({
        assignedReviewerId: anotherReviewer.id,
      });

      applicationRepository.findOne.mockResolvedValue(application);

      await expect(
        service.findOne(application.id, reviewerUser as any),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw NotFoundException when application does not exist', async () => {
      applicationRepository.findOne.mockResolvedValue(null);

      await expect(
        service.findOne('missing-id', salesUser as any),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ============================================================
  // UPDATE
  // ============================================================

  describe('update', () => {
    it('should allow SALES to update their own DRAFT application', async () => {
      const application = createApplication();

      applicationRepository.findOne.mockResolvedValue(application);

      applicationRepository.save.mockImplementation(async (value) => value);

      const dto = {
        businessName: 'Updated Business',
      };

      const result = await service.update(
        application.id,
        dto as any,
        salesUser as any,
      );

      expect(result.businessName).toBe('Updated Business');

      expect(applicationRepository.save).toHaveBeenCalled();
    });

    it('should allow SALES to update NEEDS_INFO application', async () => {
      const application = createApplication({
        applicationStatus: ApplicationStatus.NEEDS_INFO,
        riskStatus: RiskStatus.NEEDS_INFO,
      });

      applicationRepository.findOne.mockResolvedValue(application);

      applicationRepository.save.mockImplementation(async (value) => value);

      await service.update(
        application.id,
        {
          ownerPhone: '+987654321',
        } as any,
        salesUser as any,
      );

      expect(application.ownerPhone).toBe('+987654321');
    });

    it('should reject SALES updating another user application', async () => {
      const application = createApplication({
        createdById: anotherSalesUser.id,
      });

      applicationRepository.findOne.mockResolvedValue(application);

      await expect(
        service.update(
          application.id,
          {
            businessName: 'Hacked',
          } as any,
          salesUser as any,
        ),
      ).rejects.toThrow(ForbiddenException);

      expect(applicationRepository.save).not.toHaveBeenCalled();
    });

    it('should reject SALES updating SUBMITTED application', async () => {
      const application = createApplication({
        applicationStatus: ApplicationStatus.SUBMITTED,
      });

      applicationRepository.findOne.mockResolvedValue(application);

      await expect(
        service.update(
          application.id,
          {
            businessName: 'Updated',
          } as any,
          salesUser as any,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject SALES updating UNDER_REVIEW application', async () => {
      const application = createApplication({
        applicationStatus: ApplicationStatus.UNDER_REVIEW,
      });

      applicationRepository.findOne.mockResolvedValue(application);

      await expect(
        service.update(
          application.id,
          {
            businessName: 'Updated',
          } as any,
          salesUser as any,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject SALES updating COMPLETED application', async () => {
      const application = createApplication({
        applicationStatus: ApplicationStatus.COMPLETED,
      });

      applicationRepository.findOne.mockResolvedValue(application);

      await expect(
        service.update(
          application.id,
          {
            businessName: 'Updated',
          } as any,
          salesUser as any,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should allow ADMIN to update application', async () => {
      const application = createApplication({
        applicationStatus: ApplicationStatus.COMPLETED,
      });

      applicationRepository.findOne.mockResolvedValue(application);

      applicationRepository.save.mockImplementation(async (value) => value);

      const result = await service.update(
        application.id,
        {
          businessName: 'Admin Update',
        } as any,
        adminUser as any,
      );

      expect(result.businessName).toBe('Admin Update');
    });
  });

  // ============================================================
  // SUBMIT
  // ============================================================

  describe('submit', () => {
    it('should transition DRAFT → SUBMITTED', async () => {
      const application = createApplication({
        applicationStatus: ApplicationStatus.DRAFT,
        riskStatus: RiskStatus.PENDING,
      });

      applicationRepository.findOne.mockResolvedValue(application);

      applicationRepository.save.mockImplementation(async (value) => value);

      const result = await service.submit(application.id, salesUser as any);

      expect(result.applicationStatus).toBe(ApplicationStatus.SUBMITTED);
      expect(riskReviewQueue.enqueue).toHaveBeenCalledWith(application.id);
      expect(mockAuditTrailService.record).toHaveBeenCalled();
      expect(result.riskStatus).toBe(RiskStatus.PENDING);
    });

    it('should transition NEEDS_INFO → SUBMITTED', async () => {
      const application = createApplication({
        applicationStatus: ApplicationStatus.NEEDS_INFO,
        riskStatus: RiskStatus.NEEDS_INFO,
      });

      applicationRepository.findOne.mockResolvedValue(application);

      applicationRepository.save.mockImplementation(async (value) => value);

      const result = await service.submit(application.id, salesUser as any);

      expect(result.applicationStatus).toBe(ApplicationStatus.SUBMITTED);
      expect(riskReviewQueue.enqueue).toHaveBeenCalledWith(application.id);
      expect(result.riskStatus).toBe(RiskStatus.PENDING);
    });

    it('should reject submitting UNDER_REVIEW application', async () => {
      const application = createApplication({
        applicationStatus: ApplicationStatus.UNDER_REVIEW,
      });

      applicationRepository.findOne.mockResolvedValue(application);

      await expect(
        service.submit(application.id, salesUser as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject submitting COMPLETED application', async () => {
      const application = createApplication({
        applicationStatus: ApplicationStatus.COMPLETED,
      });

      applicationRepository.findOne.mockResolvedValue(application);

      await expect(
        service.submit(application.id, salesUser as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject SALES submitting another user application', async () => {
      const application = createApplication({
        createdById: anotherSalesUser.id,
      });

      applicationRepository.findOne.mockResolvedValue(application);

      await expect(
        service.submit(application.id, salesUser as any),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  // ============================================================
  // ASSIGN REVIEWER
  // ============================================================

  describe('assignReviewer', () => {
    it('should allow ADMIN to assign an active REVIEWER', async () => {
      const application = createApplication({
        applicationStatus: ApplicationStatus.SUBMITTED,
      });

      applicationRepository.findOne.mockResolvedValue(application);

      userRepository.findOne.mockResolvedValue(reviewerUser);

      applicationRepository.save.mockImplementation(async (value) => value);

      const result = await service.assignReviewer(
        application.id,
        {
          reviewerId: reviewerUser.id,
        },
        adminUser as any,
      );

      expect(result.assignedReviewerId).toBe(reviewerUser.id);

      expect(result.applicationStatus).toBe(ApplicationStatus.UNDER_REVIEW);
    });

    it('should reject SALES assigning reviewer', async () => {
      await expect(
        service.assignReviewer(
          'application-1',
          {
            reviewerId: reviewerUser.id,
          },
          salesUser as any,
        ),
      ).rejects.toThrow(ForbiddenException);

      expect(applicationRepository.findOne).not.toHaveBeenCalled();
    });

    it('should reject REVIEWER assigning reviewer', async () => {
      await expect(
        service.assignReviewer(
          'application-1',
          {
            reviewerId: reviewerUser.id,
          },
          reviewerUser as any,
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should reject assigning reviewer from DRAFT', async () => {
      const application = createApplication({
        applicationStatus: ApplicationStatus.DRAFT,
      });

      applicationRepository.findOne.mockResolvedValue(application);

      await expect(
        service.assignReviewer(
          application.id,
          {
            reviewerId: reviewerUser.id,
          },
          adminUser as any,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject assigning reviewer from UNDER_REVIEW', async () => {
      const application = createApplication({
        applicationStatus: ApplicationStatus.UNDER_REVIEW,
      });

      applicationRepository.findOne.mockResolvedValue(application);

      await expect(
        service.assignReviewer(
          application.id,
          {
            reviewerId: reviewerUser.id,
          },
          adminUser as any,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject non-existent reviewer', async () => {
      const application = createApplication({
        applicationStatus: ApplicationStatus.SUBMITTED,
      });

      applicationRepository.findOne.mockResolvedValue(application);

      userRepository.findOne.mockResolvedValue(null);

      await expect(
        service.assignReviewer(
          application.id,
          {
            reviewerId: 'missing-reviewer',
          },
          adminUser as any,
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('should reject assigning a SALES user as reviewer', async () => {
      const application = createApplication({
        applicationStatus: ApplicationStatus.SUBMITTED,
      });

      applicationRepository.findOne.mockResolvedValue(application);

      userRepository.findOne.mockResolvedValue(salesUser);

      await expect(
        service.assignReviewer(
          application.id,
          {
            reviewerId: salesUser.id,
          },
          adminUser as any,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject inactive reviewer', async () => {
      const inactiveReviewer = {
        ...reviewerUser,
        isActive: false,
      };

      const application = createApplication({
        applicationStatus: ApplicationStatus.SUBMITTED,
      });

      applicationRepository.findOne.mockResolvedValue(application);

      userRepository.findOne.mockResolvedValue(inactiveReviewer);

      await expect(
        service.assignReviewer(
          application.id,
          {
            reviewerId: inactiveReviewer.id,
          },
          adminUser as any,
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ============================================================
  // RISK DECISION
  // ============================================================

  describe('recordRiskDecision', () => {
    it('should allow assigned REVIEWER to approve', async () => {
      const application = createApplication({
        applicationStatus: ApplicationStatus.UNDER_REVIEW,
        assignedReviewerId: reviewerUser.id,
      });

      applicationRepository.findOne.mockResolvedValue(application);

      applicationRepository.save.mockImplementation(async (value) => value);

      const result = await service.recordRiskDecision(
        application.id,
        {
          decision: RiskStatus.APPROVED,
        },
        reviewerUser as any,
      );

      expect(result.riskStatus).toBe(RiskStatus.APPROVED);

      expect(result.applicationStatus).toBe(ApplicationStatus.COMPLETED);
    });

    it('should allow assigned REVIEWER to reject', async () => {
      const application = createApplication({
        applicationStatus: ApplicationStatus.UNDER_REVIEW,
        assignedReviewerId: reviewerUser.id,
      });

      applicationRepository.findOne.mockResolvedValue(application);

      applicationRepository.save.mockImplementation(async (value) => value);

      const result = await service.recordRiskDecision(
        application.id,
        {
          decision: RiskStatus.REJECTED,
          reason: 'High risk merchant',
        },
        reviewerUser as any,
      );

      expect(result.riskStatus).toBe(RiskStatus.REJECTED);

      expect(result.applicationStatus).toBe(ApplicationStatus.COMPLETED);
    });

    it('should allow assigned REVIEWER to request information', async () => {
      const application = createApplication({
        applicationStatus: ApplicationStatus.UNDER_REVIEW,
        assignedReviewerId: reviewerUser.id,
      });

      applicationRepository.findOne.mockResolvedValue(application);

      applicationRepository.save.mockImplementation(async (value) => value);

      const result = await service.recordRiskDecision(
        application.id,
        {
          decision: RiskStatus.NEEDS_INFO,
          reason: 'Need additional documents',
        },
        reviewerUser as any,
      );

      expect(result.riskStatus).toBe(RiskStatus.NEEDS_INFO);

      expect(result.applicationStatus).toBe(ApplicationStatus.NEEDS_INFO);
    });

    it('should allow ADMIN to approve application', async () => {
      const application = createApplication({
        applicationStatus: ApplicationStatus.UNDER_REVIEW,
        assignedReviewerId: reviewerUser.id,
      });

      applicationRepository.findOne.mockResolvedValue(application);

      applicationRepository.save.mockImplementation(async (value) => value);

      const result = await service.recordRiskDecision(
        application.id,
        {
          decision: RiskStatus.APPROVED,
        },
        adminUser as any,
      );

      expect(result.riskStatus).toBe(RiskStatus.APPROVED);

      expect(result.applicationStatus).toBe(ApplicationStatus.COMPLETED);
    });

    it('should reject unassigned REVIEWER', async () => {
      const application = createApplication({
        applicationStatus: ApplicationStatus.UNDER_REVIEW,
        assignedReviewerId: anotherReviewer.id,
      });

      applicationRepository.findOne.mockResolvedValue(application);

      await expect(
        service.recordRiskDecision(
          application.id,
          {
            decision: RiskStatus.APPROVED,
          },
          reviewerUser as any,
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should reject SALES making risk decision', async () => {
      const application = createApplication({
        applicationStatus: ApplicationStatus.UNDER_REVIEW,
        assignedReviewerId: reviewerUser.id,
      });

      applicationRepository.findOne.mockResolvedValue(application);

      await expect(
        service.recordRiskDecision(
          application.id,
          {
            decision: RiskStatus.APPROVED,
          },
          salesUser as any,
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should reject PENDING as a risk decision', async () => {
      const application = createApplication({
        applicationStatus: ApplicationStatus.UNDER_REVIEW,
        assignedReviewerId: reviewerUser.id,
      });

      applicationRepository.findOne.mockResolvedValue(application);

      await expect(
        service.recordRiskDecision(
          application.id,
          {
            decision: RiskStatus.PENDING,
          },
          reviewerUser as any,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject risk decision when application is not UNDER_REVIEW', async () => {
      const application = createApplication({
        applicationStatus: ApplicationStatus.SUBMITTED,
        assignedReviewerId: reviewerUser.id,
      });

      applicationRepository.findOne.mockResolvedValue(application);

      await expect(
        service.recordRiskDecision(
          application.id,
          {
            decision: RiskStatus.APPROVED,
          },
          reviewerUser as any,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject risk decision on COMPLETED application', async () => {
      const application = createApplication({
        applicationStatus: ApplicationStatus.COMPLETED,
        riskStatus: RiskStatus.APPROVED,
        assignedReviewerId: reviewerUser.id,
      });

      applicationRepository.findOne.mockResolvedValue(application);

      await expect(
        service.recordRiskDecision(
          application.id,
          {
            decision: RiskStatus.REJECTED,
          },
          reviewerUser as any,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw NotFoundException when application does not exist', async () => {
      applicationRepository.findOne.mockResolvedValue(null);

      await expect(
        service.recordRiskDecision(
          'missing-id',
          {
            decision: RiskStatus.APPROVED,
          },
          reviewerUser as any,
        ),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
