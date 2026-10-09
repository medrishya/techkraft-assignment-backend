import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

import { User } from '../../users/entities/user.entity';
import { ApplicationStatus } from '../enums/application-status.enum';
import { RiskStatus } from '../enums/risk-status.enum';

@Entity('merchant_applications')
export class MerchantApplication {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'business_name', type: 'varchar' })
  businessName: string;

  @Column({ name: 'legal_business_name', type: 'varchar' })
  legalBusinessName: string;

  @Column({ name: 'business_type', type: 'varchar' })
  businessType: string;

  @Column({ name: 'owner_name', type: 'varchar' })
  ownerName: string;

  @Column({ name: 'owner_email', type: 'varchar' })
  ownerEmail: string;

  @Column({ name: 'owner_phone', type: 'varchar' })
  ownerPhone: string;

  @Column({
    name: 'processing_volume',
    type: 'numeric',
    nullable: true,
  })
  processingVolume: number | null;

  @Column({
    name: 'processing_currency',
    type: 'varchar',
    default: 'USD',
  })
  processingCurrency: string;

  @Column({
    name: 'application_status',
    type: 'enum',
    enum: ApplicationStatus,
    default: ApplicationStatus.DRAFT,
  })
  applicationStatus: ApplicationStatus;

  @Column({
    name: 'risk_status',
    type: 'enum',
    enum: RiskStatus,
    default: RiskStatus.PENDING,
  })
  riskStatus: RiskStatus;

  /**
   * User who created the application.
   *
   * This is critical for SALES object-level authorization.
   */
  @Column({ name: 'created_by_id', type: 'uuid' })
  createdById: string;

  @ManyToOne(() => User, {
    nullable: false,
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'created_by_id' })
  createdBy: User;

  /**
   * Reviewer assigned to this application.
   */
  @Column({
    name: 'assigned_reviewer_id',
    type: 'uuid',
    nullable: true,
  })
  assignedReviewerId: string | null;

  @ManyToOne(() => User, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'assigned_reviewer_id' })
  assignedReviewer: User | null;

  @CreateDateColumn({
    name: 'created_at',
    type: 'timestamp',
  })
  createdAt: Date;

  @UpdateDateColumn({
    name: 'updated_at',
    type: 'timestamp',
  })
  updatedAt: Date;
}
