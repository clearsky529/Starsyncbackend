import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';

import { User as UserEntity } from '@app/entities/user.entity';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { JwtService } from '@app/services/jwt.service';
import { PasswordHash } from '@app/services/phpass.service';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @InjectRepository(UserEntity) private userRepo: Repository<UserEntity>,
    private jwtService: JwtService,
    private phpass: PasswordHash,
  ) {}

  async login(data: LoginDto) {
    const { username, password } = data;

    const userId = await this.checkPassword(username.toLowerCase(), password);

    if (!userId) {
      throw new UnauthorizedException('Wrong password');
    }

    const user = await this.userRepo.findOneBy({ id: userId });

    if (!user) {
      throw new UnauthorizedException('Wrong username');
    }

    const token = this.generateToken(userId, username);
    return {
      token,
      userId,
      userName: user.username,
      firstName: user.first_name,
      lastName: user.last_name,
    };
  }

  async register(data: RegisterDto) {
    const { username, password, email, first_name, last_name } = data;

    let user = await this.userRepo.findOneBy({ username });

    if (user) {
      throw new UnauthorizedException('Username exist');
    }

    user = await this.userRepo.findOneBy({ email });

    if (user) {
      throw new UnauthorizedException('Email exist');
    }

    const newUser = new UserEntity();
    newUser.username = username.toLowerCase();
    newUser.email = email;
    newUser.password = this.phpass.hashPassword(password);
    newUser.first_name = first_name;
    newUser.last_name = last_name;

    await this.userRepo.save(newUser);

    return {
      username,
      email,
      first_name,
      last_name,
    };
  }

  async checkPassword(username: string, password: string) {
    const user = await this.userRepo.findOneBy({
      username,
    });

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    if (!this.phpass.checkPassword(password, user.password)) {
      throw new UnauthorizedException('Wrong password');
    }

    return user.id;
  }

  generateToken(user_id: string, username: string) {
    const token = this.jwtService.generateToken(user_id, username);
    return token;
  }
}
