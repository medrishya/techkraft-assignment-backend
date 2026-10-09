import { IsEnum, IsOptional, IsString } from 'class-validator';
import { RiskStatus } from '../enums/risk-status.enum';

export class RiskDecisionDto {
  @IsEnum(RiskStatus)
  decision: RiskStatus;

  @IsOptional()
  @IsString()
  reason?: string;
}
