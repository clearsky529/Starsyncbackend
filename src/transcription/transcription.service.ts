/**
 * Transcription Service
 * Real-time transcription via OpenAI Whisper API for collaborative notes/chat logs.
 * Set OPENAI_API_KEY in .env to enable. Falls back to placeholder if missing.
 */

import { Injectable } from '@nestjs/common';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import OpenAI from 'openai';

export interface TranscriptionSegment {
  start: number;
  end: number;
  text: string;
}

export interface TranscriptionResult {
  transcript: string;
  segments?: TranscriptionSegment[];
}

@Injectable()
export class TranscriptionService {
  private openai: OpenAI | null = null;

  constructor() {
    const key = process.env.OPENAI_API_KEY;
    if (key && key.length > 10) {
      this.openai = new OpenAI({ apiKey: key });
    }
  }

  /**
   * Transcribe audio to text using Whisper API.
   * @param audioBase64 Base64-encoded audio (WAV, MP3, M4A, etc.)
   * @returns Transcript and optional segments with timestamps
   */
  async transcribe(audioBase64: string): Promise<TranscriptionResult> {
    if (!audioBase64 || audioBase64.length < 100) {
      return { transcript: '', segments: [] };
    }

    if (!this.openai) {
      return {
        transcript: '[Whisper-T: Set OPENAI_API_KEY in .env to enable real transcription.]',
        segments: [],
      };
    }

    let tmpPath: string | null = null;
    try {
      const buf = Buffer.from(audioBase64, 'base64');
      tmpPath = path.join(os.tmpdir(), `starsync-transcribe-${Date.now()}.tmp`);
      fs.writeFileSync(tmpPath, buf);

      const transcription = await this.openai.audio.transcriptions.create({
        file: fs.createReadStream(tmpPath),
        model: 'whisper-1',
        response_format: 'verbose_json',
        timestamp_granularities: ['segment'],
      });

      const typed = transcription as {
        text?: string;
        segments?: Array< { start?: number; end?: number; text?: string } >;
      };
      const transcript = typed.text ?? '';
      const segments: TranscriptionSegment[] = (typed.segments ?? []).map((s) => ({
        start: typeof s.start === 'number' ? s.start : 0,
        end: typeof s.end === 'number' ? s.end : 0,
        text: typeof s.text === 'string' ? s.text : '',
      }));

      return { transcript, segments };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return {
        transcript: `[Whisper-T error: ${msg}]`,
        segments: [],
      };
    } finally {
      if (tmpPath && fs.existsSync(tmpPath)) {
        try {
          fs.unlinkSync(tmpPath);
        } catch {
          /* ignore */
        }
      }
    }
  }
}
