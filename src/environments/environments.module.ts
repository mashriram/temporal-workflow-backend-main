import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Environment } from './entities/environment.entity';
import { EnvironmentVariable } from './entities/environment-variable.entity';
import { EnvironmentsService } from './environments.service';
import { EnvironmentsController } from './environments.controller';
import { CommonModule } from '../common/common.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Environment, EnvironmentVariable]),
    CommonModule,
  ],
  controllers: [EnvironmentsController],
  providers: [EnvironmentsService],
  exports: [EnvironmentsService],
})
export class EnvironmentsModule {}
