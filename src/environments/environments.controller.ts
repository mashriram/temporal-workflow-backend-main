import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
} from '@nestjs/common';
import { EnvironmentsService } from './environments.service';
import { CreateEnvironmentDto } from './dto/create-environment.dto';
import { UpsertVariableDto } from './dto/upsert-variable.dto';

@Controller('environments')
export class EnvironmentsController {
  constructor(private readonly environmentsService: EnvironmentsService) {}

  @Post()
  create(@Body() dto: CreateEnvironmentDto) {
    return this.environmentsService.create(dto);
  }

  @Get()
  findAll() {
    return this.environmentsService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.environmentsService.findOneRedacted(id);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.environmentsService.remove(id);
  }

  @Post(':id/variables')
  upsertVariable(@Param('id') id: string, @Body() dto: UpsertVariableDto) {
    return this.environmentsService.upsertVariable(id, dto);
  }

  @Patch(':id/variables/:variableId')
  updateVariable(
    @Param('id') id: string,
    @Param('variableId') variableId: string,
    @Body() dto: UpsertVariableDto,
  ) {
    return this.environmentsService.upsertVariable(id, {
      ...dto,
      id: variableId,
    });
  }

  @Delete(':id/variables/:variableId')
  removeVariable(
    @Param('id') id: string,
    @Param('variableId') variableId: string,
  ) {
    return this.environmentsService.removeVariable(id, variableId);
  }

  // Called by the engine's resolveEnvVar Activity at workflow-run time.
  // Internal, not meant for the UI (the UI never sees resolved secret
  // values — see findOneRedacted above).
  @Post(':id/resolve')
  async resolve(@Param('id') id: string, @Body() body: { key: string }) {
    const value = await this.environmentsService.resolveVariable(
      id,
      body.key,
    );
    return { key: body.key, value };
  }
}
