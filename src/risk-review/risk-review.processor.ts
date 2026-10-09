import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { RiskReviewService } from './risk-review.service';

@Processor('risk-review')
export class RiskReviewProcessor extends WorkerHost {
  private readonly logger = new Logger(RiskReviewProcessor.name);

  constructor(private readonly riskReviewService: RiskReviewService) {
    super();
  }

  async process(job: Job): Promise<void> {
    switch (job.name) {
      case 'process-risk-review':
        await this.riskReviewService.process(job.data.applicationId);
        return;

      default:
        throw new Error(`Unknown job: ${job.name}`);
    }
  }

  @OnWorkerEvent('failed')
  async onFailed(job: Job | undefined, error: Error): Promise<void> {
    this.logger.error(
      `Risk review job failed. Job ID: ${job?.id ?? 'unknown'}, ` +
        `Application ID: ${job?.data?.applicationId ?? 'unknown'}, ` +
        `Error: ${error.message}`,
      error.stack,
    );
  }
}
