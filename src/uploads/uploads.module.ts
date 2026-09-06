import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UploadedFile } from './entities/uploaded-file.entity';
import { UploadsService } from './uploads.service';
import { UploadsController } from './uploads.controller';
import { LocalStorageAdapter } from './local-storage.adapter';

@Module({
  imports: [TypeOrmModule.forFeature([UploadedFile])],
  controllers: [UploadsController],
  providers: [UploadsService, LocalStorageAdapter],
  exports: [UploadsService],
})
export class UploadsModule {}
