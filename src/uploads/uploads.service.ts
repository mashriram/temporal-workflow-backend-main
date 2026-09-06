import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { UploadedFile } from './entities/uploaded-file.entity';
import { LocalStorageAdapter } from './local-storage.adapter';

@Injectable()
export class UploadsService {
  constructor(
    @InjectRepository(UploadedFile)
    private readonly repo: Repository<UploadedFile>,
    private readonly storage: LocalStorageAdapter,
  ) {}

  async save(
    file: { originalname: string; buffer: Buffer },
    meta: { runId?: string; nodeId?: string; uploadedBy?: string },
  ) {
    const id = uuidv4();
    const storagePath = await this.storage.save(id, file.originalname, file.buffer);

    const entity = this.repo.create({
      id,
      filename: file.originalname,
      storagePath,
      runId: meta.runId ?? null,
      nodeId: meta.nodeId ?? null,
      uploadedBy: meta.uploadedBy ?? null,
    });
    await this.repo.save(entity);
    return { id: entity.id, filename: entity.filename };
  }

  async read(id: string): Promise<{ buffer: Buffer; filename: string }> {
    const record = await this.repo.findOne({ where: { id } });
    if (!record) throw new NotFoundException(`Upload ${id} not found`);
    const buffer = await this.storage.read(record.storagePath);
    return { buffer, filename: record.filename };
  }
}
