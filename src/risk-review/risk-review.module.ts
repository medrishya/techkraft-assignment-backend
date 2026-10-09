import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';

import { RiskReviewQueue } from './risk-review.queue';
import { RiskReviewProcessor } from './risk-review.processor';
import { RiskReviewService } from './risk-review.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MerchantApplication } from '../applications/entities/merchant-application.entity';
import { RiskReview } from './entities/risk-review.entity';
import { KybProvider } from './providers/kyb.provider';
import { AuditService } from '../audit/audit.service';
import { AuditLog } from '../audit/entities/audit-log.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([MerchantApplication, RiskReview, AuditLog]),
    BullModule.registerQueue({
      name: 'risk-review',
    }),
  ],
  providers: [
    RiskReviewQueue,
    RiskReviewProcessor,
    KybProvider,
    RiskReviewService,
    AuditService,
  ],
  exports: [RiskReviewQueue, RiskReviewService],
})
export class RiskReviewModule {}
