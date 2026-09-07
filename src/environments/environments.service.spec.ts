import { NotFoundException } from '@nestjs/common';
import { EnvironmentsService } from './environments.service';
import { SecretCipherService } from '../common/crypto/secret-cipher.service';

function makeRepo() {
  return {
    create: jest.fn((x) => x),
    save: jest.fn((x) => Promise.resolve({ id: 'saved-id', ...x })),
    find: jest.fn(),
    findOne: jest.fn(),
    remove: jest.fn(),
  };
}

describe('EnvironmentsService', () => {
  let service: EnvironmentsService;
  let environmentRepo: ReturnType<typeof makeRepo>;
  let variableRepo: ReturnType<typeof makeRepo>;
  let cipher: SecretCipherService;

  beforeEach(() => {
    environmentRepo = makeRepo();
    variableRepo = makeRepo();
    cipher = new SecretCipherService({
      get: () => 'test-encryption-key-not-for-prod',
    } as any);

    service = new EnvironmentsService(
      environmentRepo as any,
      variableRepo as any,
      cipher,
    );
  });

  describe('ownership scoping', () => {
    it("create() stamps the new environment with the creating user's id", async () => {
      const result = await service.create({ name: 'dev' }, 'user-a');
      expect(result.ownerId).toBe('user-a');
    });

    it('findAll() scopes to the given ownerId', async () => {
      environmentRepo.find.mockResolvedValue([]);
      await service.findAll('user-a');
      expect(environmentRepo.find).toHaveBeenCalledWith(
        expect.objectContaining({ where: { ownerId: 'user-a' } }),
      );
    });

    it("findOne() 404s (not 403) when a DIFFERENT user's environment id is guessed — avoids leaking existence", async () => {
      environmentRepo.findOne.mockResolvedValue({
        id: 'e1',
        ownerId: 'user-a',
        variables: [],
      });

      await expect(service.findOne('e1', 'user-b')).rejects.toThrow(
        NotFoundException,
      );
    });

    it("findOne() with no ownerId argument (the engine's internal resolve path) skips the ownership check", async () => {
      environmentRepo.findOne.mockResolvedValue({
        id: 'e1',
        ownerId: 'user-a',
        variables: [],
      });

      const result = await service.findOne('e1');
      expect(result.id).toBe('e1');
    });
  });

  describe('secret redaction', () => {
    it("never returns a secret's plaintext value from findOneRedacted()", async () => {
      environmentRepo.findOne.mockResolvedValue({
        id: 'e1',
        ownerId: 'user-a',
        variables: [
          {
            id: 'v1',
            environmentId: 'e1',
            key: 'API_KEY',
            kind: 'secret',
            value: cipher.encrypt('super-secret-value'),
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ],
      });

      const result = await service.findOneRedacted('e1', 'user-a');

      expect(result.variables[0].value).toBeNull();
      expect(result.variables[0].hasValue).toBe(true);
      expect(JSON.stringify(result)).not.toContain('super-secret-value');
    });

    it("never returns an auto_refresh_token's cached token value", async () => {
      environmentRepo.findOne.mockResolvedValue({
        id: 'e1',
        ownerId: 'user-a',
        variables: [
          {
            id: 'v1',
            environmentId: 'e1',
            key: 'OAUTH_TOKEN',
            kind: 'auto_refresh_token',
            value: null,
            refreshConfig: {
              url: 'https://x',
              method: 'POST',
              tokenPath: 'access_token',
              ttlSeconds: 3600,
            },
            cachedValue: 'live-bearer-token-value',
            cachedExpiresAtMs: String(Date.now() + 100000),
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ],
      });

      const result = await service.findOneRedacted('e1', 'user-a');

      expect(result.variables[0].value).toBeNull();
      expect(result.variables[0].hasCachedToken).toBe(true);
      expect(JSON.stringify(result)).not.toContain('live-bearer-token-value');
    });
  });

  describe('resolveVariable', () => {
    it('decrypts a secret variable to its real value at resolve time', async () => {
      variableRepo.findOne.mockResolvedValue({
        kind: 'secret',
        value: cipher.encrypt('the-real-secret'),
      });

      const value = await service.resolveVariable('e1', 'API_KEY');
      expect(value).toBe('the-real-secret');
    });

    it("returns a static variable's value unchanged", async () => {
      variableRepo.findOne.mockResolvedValue({
        kind: 'static',
        value: 'plain-value',
      });

      const value = await service.resolveVariable('e1', 'BASE_URL');
      expect(value).toBe('plain-value');
    });

    it('returns null for a variable that does not exist', async () => {
      variableRepo.findOne.mockResolvedValue(null);
      const value = await service.resolveVariable('e1', 'MISSING');
      expect(value).toBeNull();
    });
  });
});
