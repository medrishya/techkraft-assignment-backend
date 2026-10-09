import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsWhere, Repository } from 'typeorm';

import { MerchantApplication } from './entities/merchant-application.entity';
import { CreateApplicationDto } from './dto/create-application.dto';
import { UpdateApplicationDto } from './dto/update-application.dto';
import { AssignReviewerDto } from './dto/assign-reviewer.dto';
import { RiskDecisionDto } from './dto/risk-decision.dto';
import { ListApplicationsDto } from './dto/list-applications.dto';

import { User } from '../users/entities/user.entity';
import { UserRole } from '../users/enums/user-role.enum';

import { ApplicationStatus } from './enums/application-status.enum';
import { RiskStatus } from './enums/risk-status.enum';
import { RiskReviewQueue } from '../risk-review/risk-review.queue';
import { AuditService } from '../audit/audit.service';

@Injectable()
export class ApplicationsService {
  constructor(
    @InjectRepository(MerchantApplication)
    private readonly applicationRepository: Repository<MerchantApplication>,

    @InjectRepository(User)
    private readonly userRepository: Repository<User>,

    private readonly riskReviewQueue: RiskReviewQueue,
    private readonly auditService: AuditService,
  ) {}

  // =========================================================
  // CREATE
  // =========================================================

  async create(
    dto: CreateApplicationDto,
    user: User,
  ): Promise<MerchantApplication> {
    this.assertCanCreate(user);

    const application = this.applicationRepository.create({
      ...dto,

      processingCurrency: dto.processingCurrency ?? 'USD',

      createdById: user.id,

      applicationStatus: ApplicationStatus.DRAFT,

      riskStatus: RiskStatus.PENDING,
    });

    return this.applicationRepository.save(application);
  }

  // =========================================================
  // LIST
  // =========================================================

  async findAll(query: ListApplicationsDto, user: User) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    const skip = (page - 1) * limit;

    const where: FindOptionsWhere<MerchantApplication> = {};

    /*
     * Object-level authorization is applied directly
     * to the list query.
     *
     * SALES:
     * only applications created by this user.
     */
    if (user.role === UserRole.SALES) {
      where.createdById = user.id;
    }

    /*
     * REVIEWER:
     * only applications assigned to this reviewer.
     */
    if (user.role === UserRole.REVIEWER) {
      where.assignedReviewerId = user.id;
    }

    /*
     * ADMIN:
     * no ownership restriction.
     */

    /*
     * Optional status filtering.
     */
    if (query.status) {
      where.applicationStatus = query.status;
    }

    const [data, total] = await this.applicationRepository.findAndCount({
      where,
      relations: {
        createdBy: true,
        assignedReviewer: true,
      },
      order: {
        createdAt: 'DESC',
      },
      skip,
      take: limit,
    });

    return {
      data,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  // =========================================================
  // RETRIEVE
  // =========================================================

  async findOne(id: string, user: User): Promise<MerchantApplication> {
    const application = await this.applicationRepository.findOne({
      where: { id },
      relations: {
        createdBy: true,
        assignedReviewer: true,
      },
    });

    if (!application) {
      throw new NotFoundException('Application not found');
    }

    this.assertCanView(application, user);

    return application;
  }

  // =========================================================
  // UPDATE
  // =========================================================

  async update(
    id: string,
    dto: UpdateApplicationDto,
    user: User,
  ): Promise<MerchantApplication> {
    const application = await this.applicationRepository.findOne({
      where: { id },
    });

    if (!application) {
      throw new NotFoundException('Application not found');
    }

    this.assertCanEdit(application, user);

    Object.assign(application, dto);

    return this.applicationRepository.save(application);
  }

  // =========================================================
  // SUBMIT
  // =========================================================

  async submit(id: string, user: User): Promise<MerchantApplication> {
    const application = await this.applicationRepository.findOne({
      where: { id },
    });

    if (!application) {
      throw new NotFoundException('Application not found');
    }

    this.assertCanEdit(application, user);

    const canSubmit =
      application.applicationStatus === ApplicationStatus.DRAFT ||
      application.applicationStatus === ApplicationStatus.NEEDS_INFO;

    if (!canSubmit) {
      throw new BadRequestException(
        `Application cannot be submitted from status ${application.applicationStatus}`,
      );
    }

    application.applicationStatus = ApplicationStatus.SUBMITTED;

    application.riskStatus = RiskStatus.PENDING;

    const saved = await this.applicationRepository.save(application);
    await this.auditService.record({
      actorUserId: user.id,
      action: 'APPLICATION_CREATED',
      entityType: 'MERCHANT_APPLICATION',
      entityId: saved.id,
      metadata: {
        applicationStatus: saved.applicationStatus,
      },
    });
    await this.riskReviewQueue.enqueue(saved.id);
    return saved;
  }

  // =========================================================
  // ASSIGN REVIEWER
  // =========================================================

  async assignReviewer(
    id: string,
    dto: AssignReviewerDto,
    user: User,
  ): Promise<MerchantApplication> {
    /*
     * Only ADMIN can assign reviewers.
     */
    if (user.role !== UserRole.ADMIN) {
      throw new ForbiddenException('Only ADMIN can assign reviewers');
    }

    const application = await this.applicationRepository.findOne({
      where: { id },
    });

    if (!application) {
      throw new NotFoundException('Application not found');
    }

    /*
     * Reviewer assignment is only valid after
     * the application has been submitted.
     */
    if (application.applicationStatus !== ApplicationStatus.SUBMITTED) {
      throw new BadRequestException(
        `Application cannot be assigned from status ${application.applicationStatus}`,
      );
    }

    const reviewer = await this.userRepository.findOne({
      where: {
        id: dto.reviewerId,
      },
    });

    if (!reviewer) {
      throw new NotFoundException('Reviewer not found');
    }

    if (reviewer.role !== UserRole.REVIEWER) {
      throw new BadRequestException('User must have REVIEWER role');
    }

    if (!reviewer.isActive) {
      throw new BadRequestException('Reviewer is inactive');
    }

    application.assignedReviewerId = reviewer.id;

    application.applicationStatus = ApplicationStatus.UNDER_REVIEW;

    const saved = await this.applicationRepository.save(application);
    await this.auditService.record({
      actorUserId: user?.id, // ID of the authenticated user making the assignment
      action: 'REVIEWER_ASSIGNED',
      entityType: 'MERCHANT_APPLICATION',
      entityId: application.id,
      metadata: {
        previousReviewerId: application.assignedReviewerId ?? null,
        newReviewerId: reviewer.id,
      },
    });
    return saved;
  }

  // =========================================================
  // RISK DECISION
  // =========================================================

  async recordRiskDecision(
    id: string,
    dto: RiskDecisionDto,
    user: User,
  ): Promise<MerchantApplication> {
    const application = await this.applicationRepository.findOne({
      where: { id },
    });

    if (!application) {
      throw new NotFoundException('Application not found');
    }

    /*
     * A risk decision can only be made while the
     * application is UNDER_REVIEW.
     */
    if (application.applicationStatus !== ApplicationStatus.UNDER_REVIEW) {
      throw new BadRequestException(
        `Risk decision cannot be made from status ${application.applicationStatus}`,
      );
    }

    /*
     * ADMIN has full operational access.
     */
    if (user.role === UserRole.ADMIN) {
      // allowed
    }

    /*
     * REVIEWER must be the reviewer assigned
     * to THIS application.
     */
    else if (user.role === UserRole.REVIEWER) {
      if (application.assignedReviewerId !== user.id) {
        throw new ForbiddenException('You are not the assigned reviewer');
      }
    }

    /*
     * SALES cannot make risk decisions.
     */
    else {
      throw new ForbiddenException('SALES users cannot make risk decisions');
    }

    /*
     * PENDING is not a decision.
     */
    if (dto.decision === RiskStatus.PENDING) {
      throw new BadRequestException(
        'PENDING cannot be used as a risk decision',
      );
    }

    /*
     * APPROVED
     */
    if (dto.decision === RiskStatus.APPROVED) {
      application.riskStatus = RiskStatus.APPROVED;

      application.applicationStatus = ApplicationStatus.COMPLETED;

      return this.applicationRepository.save(application);
    }

    /*
     * REJECTED
     */
    if (dto.decision === RiskStatus.REJECTED) {
      application.riskStatus = RiskStatus.REJECTED;

      application.applicationStatus = ApplicationStatus.COMPLETED;

      return this.applicationRepository.save(application);
    }

    /*
     * NEEDS_INFO
     *
     * Reviewer requests additional information
     * from the merchant.
     */
    if (dto.decision === RiskStatus.NEEDS_INFO) {
      application.riskStatus = RiskStatus.NEEDS_INFO;

      application.applicationStatus = ApplicationStatus.NEEDS_INFO;

      return this.applicationRepository.save(application);
    }

    throw new BadRequestException('Invalid risk decision');
  }

  // =========================================================
  // CREATE AUTHORIZATION
  // =========================================================

  private assertCanCreate(user: User): void {
    if (user.role !== UserRole.ADMIN && user.role !== UserRole.SALES) {
      throw new ForbiddenException(
        'Only ADMIN or SALES can create applications',
      );
    }
  }

  // =========================================================
  // VIEW AUTHORIZATION
  // =========================================================

  private assertCanView(application: MerchantApplication, user: User): void {
    /*
     * ADMIN can view everything.
     */
    if (user.role === UserRole.ADMIN) {
      return;
    }

    /*
     * REVIEWER can only view applications assigned
     * to them.
     */
    if (user.role === UserRole.REVIEWER) {
      if (application.assignedReviewerId !== user.id) {
        throw new ForbiddenException(
          'You are not assigned to this application',
        );
      }

      return;
    }

    /*
     * SALES can only view applications they created.
     */
    if (user.role === UserRole.SALES) {
      if (application.createdById !== user.id) {
        throw new ForbiddenException(
          'You can only access applications you created',
        );
      }

      return;
    }

    throw new ForbiddenException();
  }

  // =========================================================
  // EDIT AUTHORIZATION
  // =========================================================

  private assertCanEdit(application: MerchantApplication, user: User): void {
    /*
     * ADMIN can edit applications.
     */
    if (user.role === UserRole.ADMIN) {
      return;
    }

    /*
     * SALES:
     *
     * 1. Must own the application.
     * 2. Application must still be editable.
     */
    if (user.role === UserRole.SALES) {
      /*
       * Object-level authorization.
       */
      if (application.createdById !== user.id) {
        throw new ForbiddenException(
          'You can only edit applications you created',
        );
      }

      /*
       * SALES can edit only:
       *
       * DRAFT
       * NEEDS_INFO
       */
      const isEditable =
        application.applicationStatus === ApplicationStatus.DRAFT ||
        application.applicationStatus === ApplicationStatus.NEEDS_INFO;

      if (!isEditable) {
        throw new BadRequestException(
          `Application cannot be edited while status is ${application.applicationStatus}`,
        );
      }

      return;
    }

    /*
     * REVIEWER cannot edit merchant application
     * information.
     */
    throw new ForbiddenException(
      'You do not have permission to edit applications',
    );
  }
}
