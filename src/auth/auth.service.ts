import {
  ConflictException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { User } from './entities/user.entity';
import { AuthCredentialsDto } from './dto/auth-credentials.dto';

const BCRYPT_ROUNDS = 10;

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    private readonly jwtService: JwtService,
  ) {}

  async register(dto: AuthCredentialsDto) {
    const existing = await this.userRepo.findOne({
      where: { username: dto.username },
    });
    if (existing) {
      throw new ConflictException(`Username '${dto.username}' is taken`);
    }

    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);
    const user = this.userRepo.create({ username: dto.username, passwordHash });
    const saved = await this.userRepo.save(user);

    return this.issueToken(saved);
  }

  async login(dto: AuthCredentialsDto) {
    const user = await this.userRepo.findOne({
      where: { username: dto.username },
    });
    if (!user || !(await bcrypt.compare(dto.password, user.passwordHash))) {
      throw new UnauthorizedException('Invalid username or password');
    }
    return this.issueToken(user);
  }

  private issueToken(user: User) {
    const accessToken = this.jwtService.sign({
      sub: user.id,
      username: user.username,
    });
    return {
      accessToken,
      user: { id: user.id, username: user.username },
    };
  }
}
