import { jest } from '@jest/globals';
import { RiskReviewService } from './risk-review.service';
import { MerchantApplication } from '../applications/entities/merchant-application.entity';
import { RiskReview } from './entities/risk-review.entity';
import { ApplicationStatus } from '../applications/enums/application-status.enum';
import { RiskStatus } from '../applications/enums/risk-status.enum';
import { KybDecision, KybProvider } from './providers/kyb.provider';

import { Repository } from 'typeorm';
import { AuditService } from '../audit/audit.service';

describe('RiskReviewService', () => {
  let service: RiskReviewService;

  let applicationRepository: {
    findOne: jest.Mock;
    save: jest.Mock;
  };

  let riskReviewRepository: {
    findOne: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
  };

  let kybProvider: {
    check: jest.Mock;
  };

  const mockAuditTrailService = {
    record: jest.fn().mockResolvedValue(undefined),
  };

  const applicationId = 'd9428888-122b-11e1-b85c-61cd3cbb3210';

  const createApplication = (
    overrides: Partial<MerchantApplication> = {},
  ): MerchantApplication =>
    ({
      id: applicationId,
      applicationStatus: ApplicationStatus.SUBMITTED,
      riskStatus: RiskStatus.PENDING,
      ...overrides,
    }) as MerchantApplication;

  beforeEach(() => {
    jest.clearAllMocks();

    applicationRepository = {
      findOne: jest.fn(),
      save: jest.fn(),
    };

    riskReviewRepository = {
      findOne: jest.fn(),
      create: jest.fn((data) => data),
      save: jest.fn((data) => Promise.resolve(data)),
    };

    kybProvider = {
      check: jest.fn(),
    };

    service = new RiskReviewService(
      applicationRepository as unknown as Repository<MerchantApplication>,
      riskReviewRepository as unknown as Repository<RiskReview>,
      kybProvider as unknown as KybProvider,
      mockAuditTrailService as unknown as AuditService,
    );
  });

  describe('process', () => {
    it('should throw an error when the application does not exist', async () => {
      applicationRepository.findOne.mockResolvedValue(null);

      await expect(service.process(applicationId)).rejects.toThrow(
        `Application ${applicationId} not found`,
      );

      expect(applicationRepository.findOne).toHaveBeenCalledWith({
        where: { id: applicationId },
      });

      expect(riskReviewRepository.findOne).not.toHaveBeenCalled();
      expect(kybProvider.check).not.toHaveBeenCalled();
    });

    it('should not process an application that already has a risk review', async () => {
      applicationRepository.findOne.mockResolvedValue(createApplication());

      riskReviewRepository.findOne.mockResolvedValue({
        id: 'existing-review-id',
        applicationId,
        decision: RiskStatus.APPROVED,
      });

      await service.process(applicationId);

      expect(riskReviewRepository.findOne).toHaveBeenCalledWith({
        where: { applicationId },
      });

      expect(kybProvider.check).not.toHaveBeenCalled();
      expect(riskReviewRepository.create).not.toHaveBeenCalled();
      expect(riskReviewRepository.save).not.toHaveBeenCalled();
      expect(applicationRepository.save).not.toHaveBeenCalled();
    });

    it('should skip applications that are not SUBMITTED', async () => {
      applicationRepository.findOne.mockResolvedValue(
        createApplication({
          applicationStatus: ApplicationStatus.DRAFT,
        }),
      );

      riskReviewRepository.findOne.mockResolvedValue(null);

      await service.process(applicationId);

      expect(kybProvider.check).not.toHaveBeenCalled();
      expect(riskReviewRepository.create).not.toHaveBeenCalled();
      expect(riskReviewRepository.save).not.toHaveBeenCalled();
      expect(applicationRepository.save).not.toHaveBeenCalled();
    });

    it.each([
      {
        kybDecision: KybDecision.APPROVED,
        expectedRiskStatus: RiskStatus.APPROVED,
        expectedApplicationStatus: ApplicationStatus.COMPLETED,
      },
      {
        kybDecision: KybDecision.REJECTED,
        expectedRiskStatus: RiskStatus.REJECTED,
        expectedApplicationStatus: ApplicationStatus.COMPLETED,
      },
      {
        kybDecision: KybDecision.NEEDS_INFO,
        expectedRiskStatus: RiskStatus.NEEDS_INFO,
        expectedApplicationStatus: ApplicationStatus.NEEDS_INFO,
      },
    ])(
      'should persist $kybDecision risk results and update the application',
      async ({
        kybDecision,
        expectedRiskStatus,
        expectedApplicationStatus,
      }) => {
        const application = createApplication();

        applicationRepository.findOne.mockResolvedValue(application);
        riskReviewRepository.findOne.mockResolvedValue(null);

        kybProvider.check.mockResolvedValue({
          decision: kybDecision,
          providerReference: 'KYB-TEST-123',
          reason: 'Automated KYB assessment result',
        });

        await service.process(applicationId);

        expect(kybProvider.check).toHaveBeenCalledWith(applicationId);

        expect(riskReviewRepository.create).toHaveBeenCalledWith({
          applicationId,
          provider: 'SIMULATED_KYB',
          providerReference: 'KYB-TEST-123',
          decision: expectedRiskStatus,
          reason: 'Automated KYB assessment result',
        });

        expect(riskReviewRepository.save).toHaveBeenCalledWith({
          applicationId,
          provider: 'SIMULATED_KYB',
          providerReference: 'KYB-TEST-123',
          decision: expectedRiskStatus,
          reason: 'Automated KYB assessment result',
        });

        expect(application.riskStatus).toBe(expectedRiskStatus);
        expect(application.applicationStatus).toBe(expectedApplicationStatus);

        expect(applicationRepository.save).toHaveBeenCalledWith(application);
      },
    );

    it('should save a null reason when the provider does not return one', async () => {
      const application = createApplication();

      applicationRepository.findOne.mockResolvedValue(application);
      riskReviewRepository.findOne.mockResolvedValue(null);

      kybProvider.check.mockResolvedValue({
        decision: KybDecision.APPROVED,
        providerReference: 'KYB-TEST-456',
      });

      await service.process(applicationId);

      expect(riskReviewRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          applicationId,
          reason: null,
          decision: RiskStatus.APPROVED,
        }),
      );
    });

    it('should propagate provider errors without persisting a risk review', async () => {
      applicationRepository.findOne.mockResolvedValue(createApplication());
      riskReviewRepository.findOne.mockResolvedValue(null);

      kybProvider.check.mockRejectedValue(
        new Error('KYB provider unavailable'),
      );

      await expect(service.process(applicationId)).rejects.toThrow(
        'KYB provider unavailable',
      );

      expect(riskReviewRepository.create).not.toHaveBeenCalled();
      expect(riskReviewRepository.save).not.toHaveBeenCalled();
      expect(applicationRepository.save).not.toHaveBeenCalled();
    });

    it('should propagate a risk review persistence error', async () => {
      applicationRepository.findOne.mockResolvedValue(createApplication());
      riskReviewRepository.findOne.mockResolvedValue(null);

      kybProvider.check.mockResolvedValue({
        decision: KybDecision.APPROVED,
        providerReference: 'KYB-TEST-789',
        reason: 'Verification passed',
      });

      riskReviewRepository.save.mockRejectedValue(
        new Error('Database write failed'),
      );

      await expect(service.process(applicationId)).rejects.toThrow(
        'Database write failed',
      );

      expect(applicationRepository.save).not.toHaveBeenCalled();
    });

    it('should propagate an application update error after saving the risk review', async () => {
      const application = createApplication();

      applicationRepository.findOne.mockResolvedValue(application);
      riskReviewRepository.findOne.mockResolvedValue(null);

      kybProvider.check.mockResolvedValue({
        decision: KybDecision.APPROVED,
        providerReference: 'KYB-TEST-999',
        reason: 'Verification passed',
      });

      applicationRepository.save.mockRejectedValue(
        new Error('Application update failed'),
      );

      await expect(service.process(applicationId)).rejects.toThrow(
        'Application update failed',
      );

      expect(riskReviewRepository.save).toHaveBeenCalled();
      expect(applicationRepository.save).toHaveBeenCalledWith(application);
    });
  });
});
