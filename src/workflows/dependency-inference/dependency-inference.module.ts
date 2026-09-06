import { Module } from '@nestjs/common';
import { DependencyInferenceService } from './dependency-inference.service';
import { DependencyInferenceController } from './dependency-inference.controller';

@Module({
  controllers: [DependencyInferenceController],
  providers: [DependencyInferenceService],
})
export class DependencyInferenceModule {}
