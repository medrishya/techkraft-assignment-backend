import { jest } from '@jest/globals';
import { INestApplication } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';

import { createTestApp } from './setup';

import { RiskReviewService } from '../../src/risk-review/risk-review.service';
import { RiskReview } from '../../src/risk-review/entities/risk-review.entity';
import {
  KybDecision,
  KybProvider,
} from '../../src/risk-review/providers/kyb.provider';

import { MerchantApplication } from '../../src/applications/entities/merchant-application.entity';
import { ApplicationStatus } from '../../src/applications/enums/application-status.enum';
import { RiskStatus } from '../../src/applications/enums/risk-status.enum';

import { User } from '../../src/users/entities/user.entity';
import { UserRole } from '../../src/users/enums/user-role.enum';

describe('RiskReviewService integration', () => {
  let app: INestApplication;
  let dataSource: DataSource;

  let service: RiskReviewService;
  let applicationRepository: Repository<MerchantApplication>;
  let riskReviewRepository: Repository<RiskReview>;
  let userRepository: Repository<User>;
  let kybProvider: KybProvider;

  beforeAll(async () => {
    const testApp = await createTestApp();

    app = testApp.app;
    dataSource = testApp.dataSource;

    service = app.get(RiskReviewService);

    applicationRepository = app.get(getRepositoryToken(MerchantApplication));

    riskReviewRepository = app.get(getRepositoryToken(RiskReview));

    userRepository = app.get(getRepositoryToken(User));

    kybProvider = app.get(KybProvider);
  });

  beforeEach(async () => {
    await dataSource.query(`
      TRUNCATE TABLE risk_reviews, merchant_applications, users
      RESTART IDENTITY CASCADE
    `);

    jest.restoreAllMocks();
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  async function createTestUser(): Promise<User> {
    const user = userRepository.create({
      email: 'sales@example.com',
      passwordHash: 'TestPassword123!',
      role: UserRole.SALES,
    } as Partial<User>);

    return userRepository.save(user);
  }

  async function createSubmittedApplication(): Promise<MerchantApplication> {
    const user = await createTestUser();

    const application = applicationRepository.create({
      businessName: 'Integration Test Store',
      legalBusinessName: 'Integration Test Store Pvt. Ltd.',
      businessType: 'E_COMMERCE',
      ownerName: 'Test Owner',
      ownerEmail: 'owner@example.com',
      ownerPhone: '+9779812345678',
      processingVolume: 50000,
      processingCurrency: 'USD',
      applicationStatus: ApplicationStatus.SUBMITTED,
      riskStatus: RiskStatus.PENDING,
      createdById: user.id,
    });

    return applicationRepository.save(application);
  }

  describe('process()', () => {
    it('persists an approved KYB result and completes the application', async () => {
      const application = await createSubmittedApplication();

      jest.spyOn(kybProvider, 'check').mockResolvedValue({
        decision: KybDecision.APPROVED,
        providerReference: 'KYB-INTEGRATION-001',
        reason: 'Business verification passed',
      });

      await service.process(application.id);

      const savedReview = await riskReviewRepository.findOneBy({
        applicationId: application.id,
      });

      const savedApplication = await applicationRepository.findOneByOrFail({
        id: application.id,
      });

      expect(savedReview).toMatchObject({
        applicationId: application.id,
        provider: 'SIMULATED_KYB',
        providerReference: 'KYB-INTEGRATION-001',
        decision: RiskStatus.APPROVED,
        reason: 'Business verification passed',
      });

      expect(savedReview?.id).toBeDefined();
      expect(savedReview?.createdAt).toBeInstanceOf(Date);

      expect(savedApplication.applicationStatus).toBe(
        ApplicationStatus.COMPLETED,
      );
      expect(savedApplication.riskStatus).toBe(RiskStatus.APPROVED);
    });

    it('persists a rejected KYB result and completes the application', async () => {
      const application = await createSubmittedApplication();

      jest.spyOn(kybProvider, 'check').mockResolvedValue({
        decision: KybDecision.REJECTED,
        providerReference: 'KYB-INTEGRATION-002',
        reason: 'Business verification failed',
      });

      await service.process(application.id);

      const savedReview = await riskReviewRepository.findOneBy({
        applicationId: application.id,
      });

      const savedApplication = await applicationRepository.findOneByOrFail({
        id: application.id,
      });

      expect(savedReview?.decision).toBe(RiskStatus.REJECTED);
      expect(savedReview?.reason).toBe('Business verification failed');

      expect(savedApplication.riskStatus).toBe(RiskStatus.REJECTED);
      expect(savedApplication.applicationStatus).toBe(
        ApplicationStatus.COMPLETED,
      );
    });

    it('moves the application to NEEDS_INFO when the provider requests more information', async () => {
      const application = await createSubmittedApplication();

      jest.spyOn(kybProvider, 'check').mockResolvedValue({
        decision: KybDecision.NEEDS_INFO,
        providerReference: 'KYB-INTEGRATION-003',
        reason: 'Business registration document required',
      });

      await service.process(application.id);

      const savedReview = await riskReviewRepository.findOneBy({
        applicationId: application.id,
      });

      const savedApplication = await applicationRepository.findOneByOrFail({
        id: application.id,
      });

      expect(savedReview?.decision).toBe(RiskStatus.NEEDS_INFO);
      expect(savedApplication.riskStatus).toBe(RiskStatus.NEEDS_INFO);
      expect(savedApplication.applicationStatus).toBe(
        ApplicationStatus.NEEDS_INFO,
      );
    });

    it('does not create another review when a review already exists', async () => {
      const application = await createSubmittedApplication();

      await riskReviewRepository.save(
        riskReviewRepository.create({
          applicationId: application.id,
          provider: 'SIMULATED_KYB',
          providerReference: 'KYB-EXISTING-001',
          decision: RiskStatus.APPROVED,
          reason: 'Previously reviewed',
        }),
      );

      const providerSpy = jest.spyOn(kybProvider, 'check');

      await service.process(application.id);

      expect(providerSpy).not.toHaveBeenCalled();

      const reviews = await riskReviewRepository.findBy({
        applicationId: application.id,
      });

      expect(reviews).toHaveLength(1);

      const savedApplication = await applicationRepository.findOneByOrFail({
        id: application.id,
      });

      expect(savedApplication.applicationStatus).toBe(
        ApplicationStatus.SUBMITTED,
      );
      expect(savedApplication.riskStatus).toBe(RiskStatus.PENDING);
    });

    it('skips an application that is not SUBMITTED', async () => {
      const application = await createSubmittedApplication();

      await applicationRepository.update(application.id, {
        applicationStatus: ApplicationStatus.DRAFT,
      });

      const providerSpy = jest.spyOn(kybProvider, 'check');

      await service.process(application.id);

      expect(providerSpy).not.toHaveBeenCalled();

      const reviews = await riskReviewRepository.findBy({
        applicationId: application.id,
      });

      expect(reviews).toHaveLength(0);
    });

    it('throws when the application does not exist', async () => {
      const missingId = 'd9428888-122b-11e1-b85c-61cd3cbb3210';

      await expect(service.process(missingId)).rejects.toThrow(
        `Application ${missingId} not found`,
      );

      expect(
        await riskReviewRepository.countBy({ applicationId: missingId }),
      ).toBe(0);
    });

    it('does not persist a review when the KYB provider fails', async () => {
      const application = await createSubmittedApplication();

      jest
        .spyOn(kybProvider, 'check')
        .mockRejectedValue(new Error('KYB provider unavailable'));

      await expect(service.process(application.id)).rejects.toThrow(
        'KYB provider unavailable',
      );

      expect(
        await riskReviewRepository.countBy({
          applicationId: application.id,
        }),
      ).toBe(0);

      const savedApplication = await applicationRepository.findOneByOrFail({
        id: application.id,
      });

      expect(savedApplication.applicationStatus).toBe(
        ApplicationStatus.SUBMITTED,
      );
      expect(savedApplication.riskStatus).toBe(RiskStatus.PENDING);
    });

    it('stores a null reason when the provider does not return one', async () => {
      const application = await createSubmittedApplication();

      jest.spyOn(kybProvider, 'check').mockResolvedValue({
        decision: KybDecision.APPROVED,
        providerReference: 'KYB-INTEGRATION-004',
      });

      await service.process(application.id);

      const savedReview = await riskReviewRepository.findOneBy({
        applicationId: application.id,
      });

      expect(savedReview?.reason).toBeNull();
      expect(savedReview?.decision).toBe(RiskStatus.APPROVED);
    });
  });
});
