import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { promises as fs } from 'fs';
import * as path from 'path';
import { StorageAdapter } from './storage-adapter.interface';

@Injectable()
export class LocalStorageAdapter implements StorageAdapter {
  constructor(private readonly config: ConfigService) {}

  private baseDir(): string {
    return this.config.get<string>('UPLOADS_DIR') || './data/uploads';
  }

  async save(id: string, filename: string, buffer: Buffer): Promise<string> {
    const dir = this.baseDir();
    await fs.mkdir(dir, { recursive: true });
    // Prefix with the generated id so two uploads with the same original
    // filename never collide on disk.
    const safeName = filename.replace(/[^a-zA-Z0-9_.-]/g, '_');
    const storagePath = path.join(dir, `${id}_${safeName}`);
    await fs.writeFile(storagePath, buffer);
    return storagePath;
  }

  async read(storagePath: string): Promise<Buffer> {
    return fs.readFile(storagePath);
  }
}
