import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { RiskStatus } from '../../applications/enums/risk-status.enum';

@Index(['applicationId'], { unique: true })
@Entity('risk_reviews')
export class RiskReview {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'application_id', type: 'uuid' })
  applicationId: string;

  @Column({ type: 'varchar' })
  provider: string;

  @Column({ name: 'provider_reference', type: 'varchar' })
  providerReference: string;

  @Column({
    type: 'enum',
    enum: RiskStatus,
  })
  decision: RiskStatus;

  @Column({ type: 'varchar', nullable: true })
  reason: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
