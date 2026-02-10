import { IsString, IsNotEmpty, IsOptional, IsNumber } from 'class-validator';

export class CreateCommentDto {
  @IsString()
  @IsNotEmpty()
  patternName: string;

  @IsString()
  @IsNotEmpty()
  commentText: string;

  @IsOptional()
  @IsNumber()
  track?: number; // Optional track index where pattern is placed

  @IsOptional()
  @IsNumber()
  startBar?: number; // Optional start position in bars
}

