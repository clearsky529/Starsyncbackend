import { Injectable } from '@nestjs/common';
import * as jwt from 'jsonwebtoken';
import { DecodeOptions } from 'jsonwebtoken';
import { ConfigService } from '@nestjs/config';
import { TokenBody } from '@app/interfaces/auth.interface';

@Injectable()
export class JwtService {
  constructor(private configService: ConfigService) {}

  generateToken(user_id: string, username: string, expiresIn: string = '1h') {
    const issuer = 'StarSync';
    const audience = 'https://starsync.com';
    const secretKey = this.configService.get('AUTH_SECRET_KEY');

    const signOptions = {
      issuer,
      audience,
      expiresIn,
    };

    return jwt.sign({ user_id, username }, secretKey, signOptions);
  }

  decode(token: string, options: DecodeOptions = {}) {
    return jwt.decode(token, options) as jwt.JwtPayload;
  }

  verify(token: string): TokenBody | null {
    const secretKey = this.configService.get('AUTH_SECRET_KEY');
    try {
      const tokenBody: any = jwt.verify(token, secretKey);

      return {
        user_id: tokenBody.user_id,
        username: tokenBody.username,
      };
    } catch {
      return null;
    }
  }
}
