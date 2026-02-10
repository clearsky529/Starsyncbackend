import {
  Injectable,
  NestMiddleware,
  UnauthorizedException,
} from '@nestjs/common';
import { NextFunction } from 'express';
import { JwtService } from '@app/services/jwt.service';

@Injectable()
export class AuthMiddleware implements NestMiddleware {
  constructor(private jwtService: JwtService) {}

  use(req: Request, res: Response, next: NextFunction) {
    const token = (req as any).headers['authorization']?.replace(
      /^Bearer /i,
      '',
    );

    if (!token) {
      throw new UnauthorizedException();
    }

    const user = this.jwtService.verify(token);
    if (!user) {
      throw new UnauthorizedException();
    }

    (req as any).user = user;

    next();
  }
}
