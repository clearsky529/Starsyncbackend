import { Body, Controller, Post } from '@nestjs/common';
import { TranscriptionService } from './transcription.service';

class TranscribeDto {
  audioBase64?: string;
}

@Controller('transcription')
export class TranscriptionController {
  constructor(private readonly transcriptionService: TranscriptionService) {}

  @Post('transcribe')
  async transcribe(@Body() dto: TranscribeDto) {
    const audio = dto?.audioBase64 ?? '';
    return this.transcriptionService.transcribe(audio);
  }
}
