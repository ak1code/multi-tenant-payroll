import { IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { DisbursementStatus } from '../../common/constants';

export class SearchPayrollDto {
  @ApiPropertyOptional({ example: 'John' })
  @IsOptional()
  @IsString()
  employeeName?: string;

  @ApiPropertyOptional({ enum: DisbursementStatus })
  @IsOptional()
  @IsEnum(DisbursementStatus)
  status?: DisbursementStatus;

  @ApiPropertyOptional({ example: '2024-1', description: 'Exact pay period (year-month)' })
  @IsOptional()
  @IsString()
  payPeriod?: string;

  @ApiPropertyOptional({ example: '2024-1', description: 'Pay period range start (inclusive)' })
  @IsOptional()
  @IsString()
  payPeriodFrom?: string;

  @ApiPropertyOptional({ example: '2024-6', description: 'Pay period range end (inclusive)' })
  @IsOptional()
  @IsString()
  payPeriodTo?: string;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;
}
