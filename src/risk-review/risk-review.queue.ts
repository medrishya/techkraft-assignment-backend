import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';

@Injectable()
export class RiskReviewQueue {
  constructor(
    @InjectQueue('risk-review')
    private readonly queue: Queue,
  ) {}

  async enqueue(applicationId: string): Promise<void> {
    await this.queue.add(
      'process-risk-review',
      {
        applicationId,
      },
      {
        jobId: `risk-review-${applicationId}`,
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 5000,
        },
        removeOnComplete: 1000,
        removeOnFail: 5000,
      },
    );
  }
}
