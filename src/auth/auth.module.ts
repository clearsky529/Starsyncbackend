import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User as UserEntity } from '@app/entities/user.entity';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtService } from '@app/services/jwt.service';
import { PasswordHash } from '@app/services/phpass.service';

@Module({
  imports: [TypeOrmModule.forFeature([UserEntity])],
  providers: [AuthService, JwtService, PasswordHash],
  controllers: [AuthController],
})
export class AuthModule {}
