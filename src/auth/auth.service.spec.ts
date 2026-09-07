import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { JwtService } from '@nestjs/jwt';
import { ConflictException, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service';
import { User } from './entities/user.entity';

describe('AuthService', () => {
  let service: AuthService;
  let userRepo: { findOne: jest.Mock; create: jest.Mock; save: jest.Mock };
  let jwtService: { sign: jest.Mock };

  beforeEach(async () => {
    userRepo = { findOne: jest.fn(), create: jest.fn(), save: jest.fn() };
    jwtService = { sign: jest.fn().mockReturnValue('signed.jwt.token') };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: getRepositoryToken(User), useValue: userRepo },
        { provide: JwtService, useValue: jwtService },
      ],
    }).compile();

    service = module.get(AuthService);
  });

  describe('register', () => {
    it('hashes the password before storing — never persists the plaintext', async () => {
      userRepo.findOne.mockResolvedValue(null);
      userRepo.create.mockImplementation((x) => x);
      userRepo.save.mockImplementation((u) =>
        Promise.resolve({ id: 'u1', ...u }),
      );

      await service.register({
        username: 'alice',
        password: 'correct-horse-battery',
      });

      const createdWith = userRepo.create.mock.calls[0][0];
      expect(createdWith.passwordHash).not.toBe('correct-horse-battery');
      expect(
        await bcrypt.compare('correct-horse-battery', createdWith.passwordHash),
      ).toBe(true);
    });

    it('rejects a duplicate username with 409 Conflict', async () => {
      userRepo.findOne.mockResolvedValue({ id: 'existing', username: 'alice' });

      await expect(
        service.register({ username: 'alice', password: 'whatever123' }),
      ).rejects.toThrow(ConflictException);
    });

    it('returns an access token and the public user shape (never the hash)', async () => {
      userRepo.findOne.mockResolvedValue(null);
      userRepo.create.mockImplementation((x) => x);
      userRepo.save.mockImplementation((u) =>
        Promise.resolve({ id: 'u1', ...u }),
      );

      const result = await service.register({
        username: 'alice',
        password: 'correct-horse-battery',
      });

      expect(result.accessToken).toBe('signed.jwt.token');
      expect(result.user).toEqual({ id: 'u1', username: 'alice' });
      expect((result as any).user.passwordHash).toBeUndefined();
      expect(jwtService.sign).toHaveBeenCalledWith({
        sub: 'u1',
        username: 'alice',
      });
    });
  });

  describe('login', () => {
    it('accepts correct credentials', async () => {
      const passwordHash = await bcrypt.hash('correct-horse-battery', 4);
      userRepo.findOne.mockResolvedValue({
        id: 'u1',
        username: 'alice',
        passwordHash,
      });

      const result = await service.login({
        username: 'alice',
        password: 'correct-horse-battery',
      });

      expect(result.accessToken).toBe('signed.jwt.token');
      expect(result.user).toEqual({ id: 'u1', username: 'alice' });
    });

    it('rejects a wrong password', async () => {
      const passwordHash = await bcrypt.hash('correct-horse-battery', 4);
      userRepo.findOne.mockResolvedValue({
        id: 'u1',
        username: 'alice',
        passwordHash,
      });

      await expect(
        service.login({ username: 'alice', password: 'wrong-password' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('rejects a nonexistent username with the SAME error as a wrong password (no user enumeration)', async () => {
      userRepo.findOne.mockResolvedValue(null);

      await expect(
        service.login({ username: 'ghost', password: 'anything123' }),
      ).rejects.toThrow(UnauthorizedException);
    });
  });
});
