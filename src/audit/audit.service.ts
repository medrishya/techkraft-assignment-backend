import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditLog } from './entities/audit-log.entity';

export interface CreateAuditLogInput {
  actorUserId?: string | null;
  actorType?: 'USER' | 'SYSTEM';
  action: string;
  entityType: string;
  entityId: string;
  metadata?: Record<string, unknown>;
  ipAddress?: string | null;
  userAgent?: string | null;
}

@Injectable()
export class AuditService {
  constructor(
    @InjectRepository(AuditLog)
    private readonly auditRepository: Repository<AuditLog>,
  ) {}

  async record(input: CreateAuditLogInput): Promise<void> {
    const auditLog = this.auditRepository.create({
      actorUserId: input.actorUserId ?? null,
      actorType: input.actorType ?? 'USER',
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      metadata: this.sanitizeMetadata(input.metadata ?? {}),
      ipAddress: input.ipAddress ?? null,
      userAgent: input.userAgent ?? null,
    });

    await this.auditRepository.save(auditLog);
  }

  private sanitizeMetadata(
    metadata: Record<string, unknown>,
  ): Record<string, unknown> {
    const blockedKey =
      /password|token|secret|authorization|cookie|api[-_]?key|credential/i;

    const sanitize = (value: unknown): unknown => {
      if (Array.isArray(value)) {
        return value.map(sanitize);
      }

      if (value && typeof value === 'object') {
        const result: Record<string, unknown> = {};

        for (const [key, childValue] of Object.entries(value)) {
          if (blockedKey.test(key)) {
            result[key] = '[REDACTED]';
          } else {
            result[key] = sanitize(childValue);
          }
        }

        return result;
      }

      return value;
    };

    return sanitize(metadata) as Record<string, unknown>;
  }
}
