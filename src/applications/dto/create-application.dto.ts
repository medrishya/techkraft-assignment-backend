import { Type } from 'class-transformer';
import {
  IsEmail,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  MinLength,
} from 'class-validator';

export class CreateApplicationDto {
  @IsString()
  @MinLength(2)
  businessName: string;

  @IsString()
  @MinLength(2)
  legalBusinessName: string;

  @IsString()
  @MinLength(2)
  businessType: string;

  @IsString()
  @MinLength(2)
  ownerName: string;

  @IsEmail()
  ownerEmail: string;

  @IsString()
  @MinLength(7)
  ownerPhone: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  processingVolume?: number;

  @IsOptional()
  @IsString()
  processingCurrency?: string;
}
