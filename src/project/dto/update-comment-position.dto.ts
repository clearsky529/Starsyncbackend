import { IsOptional, IsNumber } from 'class-validator';

export class UpdateCommentPositionDto {
  @IsOptional()
  @IsNumber()
  track?: number; // Optional track index where pattern is placed

  @IsOptional()
  @IsNumber()
  startBar?: number; // Optional start position in bars
}

