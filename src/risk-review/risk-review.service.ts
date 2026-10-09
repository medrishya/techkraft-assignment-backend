import { ConflictException, Injectable } from '@nestjs/common';

import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { MerchantApplication } from '../applications/entities/merchant-application.entity';
import { RiskReview } from './entities/risk-review.entity';
import { ApplicationStatus } from '../applications/enums/application-status.enum';
import { KybDecision, KybProvider } from './providers/kyb.provider';
import { RiskStatus } from '../applications/enums/risk-status.enum';
import { AuditService } from '../audit/audit.service';

@Injectable()
export class RiskReviewService {
  constructor(
    @InjectRepository(MerchantApplication)
    private readonly applicationRepository: Repository<MerchantApplication>,

    @InjectRepository(RiskReview)
    private readonly riskReviewRepository: Repository<RiskReview>,

    private readonly kybProvider: KybProvider,

    private readonly auditService: AuditService,
  ) {}

  async process(applicationId: string): Promise<void> {
    const application = await this.applicationRepository.findOne({
      where: { id: applicationId },
    });

    if (!application) {
      throw new Error(`Application ${applicationId} not found`);
    }

    // Idempotency check.
    const existingReview = await this.riskReviewRepository.findOne({
      where: {
        applicationId,
      },
    });

    if (existingReview) {
      return;
    }

    // Don't process applications that are no longer eligible.
    if (application.applicationStatus !== ApplicationStatus.SUBMITTED) {
      return;
    }

    const result = await this.kybProvider.check(applicationId);

    const riskReview = this.riskReviewRepository.create({
      applicationId,
      provider: 'SIMULATED_KYB',
      providerReference: result.providerReference,
      decision: this.mapDecision(result.decision),
      reason: result.reason ?? null,
    });

    await this.riskReviewRepository.save(riskReview);

    application.riskStatus = this.mapDecision(result.decision);

    application.applicationStatus = this.mapApplicationStatus(result.decision);

    await this.applicationRepository.save(application);

    await this.auditService.record({
      actorType: 'SYSTEM',
      actorUserId: null,
      action: 'KYB_REVIEW_COMPLETED',
      entityType: 'MERCHANT_APPLICATION',
      entityId: applicationId,
      metadata: {
        provider: 'SIMULATED_KYB',
        decision: riskReview.decision,
        applicationStatus: application.applicationStatus,
      },
    });
  }

  private mapDecision(decision: KybDecision): RiskStatus {
    switch (decision) {
      case KybDecision.APPROVED:
        return RiskStatus.APPROVED;

      case KybDecision.REJECTED:
        return RiskStatus.REJECTED;

      case KybDecision.NEEDS_INFO:
        return RiskStatus.NEEDS_INFO;
    }
  }

  private mapApplicationStatus(decision: KybDecision): ApplicationStatus {
    switch (decision) {
      case KybDecision.APPROVED:
      case KybDecision.REJECTED:
        return ApplicationStatus.COMPLETED;

      case KybDecision.NEEDS_INFO:
        return ApplicationStatus.NEEDS_INFO;
    }
  }
}
