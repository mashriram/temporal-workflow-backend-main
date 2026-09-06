import {
  Controller,
  Post,
  Get,
  Param,
  Body,
  UploadedFile,
  UseInterceptors,
  Res,
  NotFoundException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import type { Response } from 'express';
import { UploadsService } from './uploads.service';

@Controller('uploads')
export class UploadsController {
  constructor(private readonly uploadsService: UploadsService) {}

  @Post()
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 25 * 1024 * 1024 }, // 25MB — verification proofs, not video files
    }),
  )
  async upload(
    @UploadedFile() file: Express.Multer.File,
    @Body() body: { runId?: string; nodeId?: string; uploadedBy?: string },
  ) {
    if (!file) throw new NotFoundException('No file provided');
    return this.uploadsService.save(
      { originalname: file.originalname, buffer: file.buffer },
      body,
    );
  }

  @Get(':id')
  async download(@Param('id') id: string, @Res() res: Response) {
    const { buffer, filename } = await this.uploadsService.read(id);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);
  }
}
