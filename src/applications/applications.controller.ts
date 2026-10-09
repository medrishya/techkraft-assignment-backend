import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';

import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiBody,
  ApiConflictResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';

import { ApplicationsService } from './applications.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

import { CreateApplicationDto } from './dto/create-application.dto';
import { UpdateApplicationDto } from './dto/update-application.dto';
import { AssignReviewerDto } from './dto/assign-reviewer.dto';
import { RiskDecisionDto } from './dto/risk-decision.dto';
import { ListApplicationsDto } from './dto/list-applications.dto';

import type { AuthenticatedRequest } from '../auth/authenticated-request.interface';
import { ApplicationStatus } from './enums/application-status.enum';
import { RiskStatus } from './enums/risk-status.enum';

@ApiTags('Applications')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('applications')
export class ApplicationsController {
  constructor(private readonly applicationsService: ApplicationsService) {}

  // =========================================================
  // CREATE
  // =========================================================

  @Post()
  @ApiOperation({
    summary: 'Create merchant application',
    description:
      'Creates a merchant application for the authenticated user. ' +
      'The application is initially created in DRAFT status.',
  })
  @ApiBody({
    type: CreateApplicationDto,
    examples: {
      ecommerce: {
        summary: 'E-commerce business',
        value: {
          businessName: 'Himalayan Store',
          legalBusinessName: 'Himalayan Store Private Limited',
          businessType: 'E_COMMERCE',
          ownerName: 'Ram Sharma',
          ownerEmail: 'ram@example.com',
          ownerPhone: '+9779812345678',
          processingVolume: 50000,
          processingCurrency: 'USD',
        },
      },
      saas: {
        summary: 'SaaS business',
        value: {
          businessName: 'Cloud Nepal',
          legalBusinessName: 'Cloud Nepal Pvt. Ltd.',
          businessType: 'SAAS',
          ownerName: 'Sita Karki',
          ownerEmail: 'sita@example.com',
          ownerPhone: '+9779801234567',
          processingVolume: 25000,
          processingCurrency: 'USD',
        },
      },
    },
  })
  @ApiOkResponse({
    description: 'Application created successfully.',
  })
  @ApiBadRequestResponse({
    description: 'Request validation failed.',
  })
  @ApiUnauthorizedResponse({
    description: 'Missing or invalid JWT.',
  })
  create(
    @Body() dto: CreateApplicationDto,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.applicationsService.create(dto, req.user);
  }

  // =========================================================
  // LIST
  // =========================================================

  @Get()
  @ApiOperation({
    summary: 'List merchant applications',
    description:
      'Returns applications according to the authenticated user permissions ' +
      'with optional status filtering and pagination.',
  })
  @ApiQuery({
    name: 'status',
    required: false,
    enum: ApplicationStatus,
    example: ApplicationStatus.SUBMITTED,
    description: 'Filter applications by application lifecycle status.',
  })
  @ApiQuery({
    name: 'page',
    required: false,
    type: Number,
    example: 1,
    description: 'Page number, starting at 1.',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    example: 20,
    description: 'Number of applications per page.',
  })
  @ApiOkResponse({
    description: 'Returns the application list and pagination metadata.',
    schema: {
      example: {
        data: [
          {
            id: 'd9428888-122b-11e1-b85c-61cd3cbb3210',
            businessName: 'Himalayan Store',
            legalBusinessName: 'Himalayan Store Private Limited',
            businessType: 'E_COMMERCE',
            ownerName: 'Ram Sharma',
            ownerEmail: 'ram@example.com',
            ownerPhone: '+9779812345678',
            processingVolume: 50000,
            processingCurrency: 'USD',
            applicationStatus: 'SUBMITTED',
            riskStatus: 'PENDING',
          },
        ],
        meta: {
          page: 1,
          limit: 20,
          total: 1,
          totalPages: 1,
        },
      },
    },
  })
  @ApiUnauthorizedResponse({
    description: 'Missing or invalid JWT.',
  })
  findAll(
    @Query() query: ListApplicationsDto,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.applicationsService.findAll(query, req.user);
  }

  // =========================================================
  // RETRIEVE
  // =========================================================

  @Get(':id')
  @ApiOperation({
    summary: 'Get merchant application',
    description:
      'Returns a single application if the authenticated user has access to it.',
  })
  @ApiParam({
    name: 'id',
    description: 'Application UUID.',
    example: 'd9428888-122b-11e1-b85c-61cd3cbb3210',
  })
  @ApiOkResponse({
    description: 'Application retrieved successfully.',
    schema: {
      example: {
        id: 'd9428888-122b-11e1-b85c-61cd3cbb3210',
        businessName: 'Himalayan Store',
        legalBusinessName: 'Himalayan Store Private Limited',
        businessType: 'E_COMMERCE',
        ownerName: 'Ram Sharma',
        ownerEmail: 'ram@example.com',
        ownerPhone: '+9779812345678',
        processingVolume: 50000,
        processingCurrency: 'USD',
        applicationStatus: 'SUBMITTED',
        riskStatus: 'PENDING',
        createdById: 'a9428888-122b-11e1-b85c-61cd3cbb3210',
        assignedReviewerId: null,
      },
    },
  })
  @ApiBadRequestResponse({
    description: 'The application ID is not a valid UUID.',
  })
  @ApiNotFoundResponse({
    description: 'Application not found or not accessible.',
  })
  @ApiUnauthorizedResponse({
    description: 'Missing or invalid JWT.',
  })
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.applicationsService.findOne(id, req.user);
  }

  // =========================================================
  // UPDATE
  // =========================================================

  @Patch(':id')
  @ApiOperation({
    summary: 'Update merchant application',
    description:
      'SALES users can update only their own applications while the application is editable.',
  })
  @ApiParam({
    name: 'id',
    description: 'Application UUID.',
    example: 'd9428888-122b-11e1-b85c-61cd3cbb3210',
  })
  @ApiBody({
    type: UpdateApplicationDto,
    examples: {
      updateBusinessDetails: {
        summary: 'Update business details',
        value: {
          businessName: 'Himalayan Online Store',
          processingVolume: 75000,
          processingCurrency: 'USD',
        },
      },
      updateOwnerDetails: {
        summary: 'Update owner contact details',
        value: {
          ownerName: 'Ram Bahadur Sharma',
          ownerEmail: 'ram.sharma@example.com',
          ownerPhone: '+9779811111111',
        },
      },
    },
  })
  @ApiOkResponse({
    description: 'Application updated successfully.',
  })
  @ApiBadRequestResponse({
    description: 'Invalid UUID or request validation failed.',
  })
  @ApiForbiddenResponse({
    description: 'User is not allowed to update this application.',
  })
  @ApiNotFoundResponse({
    description: 'Application not found.',
  })
  @ApiConflictResponse({
    description: 'Application is not editable in its current state.',
  })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateApplicationDto,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.applicationsService.update(id, dto, req.user);
  }

  // =========================================================
  // SUBMIT
  // =========================================================

  @Post(':id/submit')
  @ApiOperation({
    summary: 'Submit merchant application',
    description:
      'Submits a DRAFT or NEEDS_INFO application for review. ' +
      'If asynchronous risk review is configured, this also enqueues the risk-review job.',
  })
  @ApiParam({
    name: 'id',
    description: 'Application UUID.',
    example: 'd9428888-122b-11e1-b85c-61cd3cbb3210',
  })
  @ApiOkResponse({
    description: 'Application submitted successfully.',
    schema: {
      example: {
        id: 'd9428888-122b-11e1-b85c-61cd3cbb3210',
        businessName: 'Himalayan Store',
        applicationStatus: 'SUBMITTED',
        riskStatus: 'PENDING',
      },
    },
  })
  @ApiBadRequestResponse({
    description: 'Invalid UUID or application cannot be submitted.',
  })
  @ApiForbiddenResponse({
    description: 'User is not allowed to submit this application.',
  })
  @ApiNotFoundResponse({
    description: 'Application not found.',
  })
  submit(
    @Param('id', ParseUUIDPipe) id: string,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.applicationsService.submit(id, req.user);
  }

  // =========================================================
  // ASSIGN REVIEWER
  // =========================================================

  @Patch(':id/assign-reviewer')
  @ApiOperation({
    summary: 'Assign reviewer to application',
    description: 'ADMIN only. The application must be in SUBMITTED status.',
  })
  @ApiParam({
    name: 'id',
    description: 'Application UUID.',
    example: 'd9428888-122b-11e1-b85c-61cd3cbb3210',
  })
  @ApiBody({
    type: AssignReviewerDto,
    examples: {
      assignReviewer: {
        summary: 'Assign a reviewer',
        value: {
          reviewerId: 'b9428888-122b-11e1-b85c-61cd3cbb3210',
        },
      },
    },
  })
  @ApiOkResponse({
    description: 'Reviewer assigned successfully.',
    schema: {
      example: {
        id: 'd9428888-122b-11e1-b85c-61cd3cbb3210',
        businessName: 'Himalayan Store',
        applicationStatus: 'UNDER_REVIEW',
        riskStatus: 'PENDING',
        assignedReviewerId: 'b9428888-122b-11e1-b85c-61cd3cbb3210',
      },
    },
  })
  @ApiBadRequestResponse({
    description: 'Invalid UUID or reviewer ID.',
  })
  @ApiForbiddenResponse({
    description: 'Only an ADMIN can assign a reviewer.',
  })
  @ApiNotFoundResponse({
    description: 'Application or reviewer not found.',
  })
  @ApiConflictResponse({
    description: 'Application is not in SUBMITTED status.',
  })
  assignReviewer(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AssignReviewerDto,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.applicationsService.assignReviewer(id, dto, req.user);
  }

  // =========================================================
  // RISK DECISION
  // =========================================================

  @Post(':id/risk-decision')
  @ApiOperation({
    summary: 'Approve, reject, or request additional information',
    description:
      'Only the assigned REVIEWER or ADMIN can make a risk decision.',
  })
  @ApiParam({
    name: 'id',
    description: 'Application UUID.',
    example: 'd9428888-122b-11e1-b85c-61cd3cbb3210',
  })
  @ApiBody({
    type: RiskDecisionDto,
    examples: {
      approve: {
        summary: 'Approve application',
        value: {
          decision: RiskStatus.APPROVED,
          reason: 'Business verification passed.',
        },
      },
      reject: {
        summary: 'Reject application',
        value: {
          decision: RiskStatus.REJECTED,
          reason: 'Unable to verify the registered business.',
        },
      },
      needsInfo: {
        summary: 'Request additional information',
        value: {
          decision: RiskStatus.NEEDS_INFO,
          reason: 'Please provide the business registration certificate.',
        },
      },
    },
  })
  @ApiOkResponse({
    description: 'Risk decision recorded successfully.',
    schema: {
      example: {
        id: 'd9428888-122b-11e1-b85c-61cd3cbb3210',
        businessName: 'Himalayan Store',
        applicationStatus: 'COMPLETED',
        riskStatus: 'APPROVED',
      },
    },
  })
  @ApiBadRequestResponse({
    description: 'Invalid UUID, decision, or request body.',
  })
  @ApiForbiddenResponse({
    description: 'User is not permitted to make this risk decision.',
  })
  @ApiNotFoundResponse({
    description: 'Application not found.',
  })
  @ApiConflictResponse({
    description:
      'Risk decision is not valid for the current application state.',
  })
  recordRiskDecision(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RiskDecisionDto,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.applicationsService.recordRiskDecision(id, dto, req.user);
  }
}
