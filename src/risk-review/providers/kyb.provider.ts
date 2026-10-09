import { Injectable } from '@nestjs/common';

export enum KybDecision {
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
  NEEDS_INFO = 'NEEDS_INFO',
}

export interface KybResult {
  decision: KybDecision;
  providerReference: string;
  reason?: string;
}

@Injectable()
export class KybProvider {
  async check(applicationId: string): Promise<KybResult> {
    // Simulate third-party latency.
    await new Promise((resolve) => setTimeout(resolve, 5000));

    // Simulated response.
    return {
      decision: KybDecision.APPROVED,
      providerReference: `KYB-${applicationId}`,
    };
  }
}
