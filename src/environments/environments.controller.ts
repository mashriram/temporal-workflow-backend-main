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
import { Public } from '../auth/decorators/public.decorator';
import { CurrentUser, type CurrentUserPayload } from '../auth/decorators/current-user.decorator';

@Controller('environments')
export class EnvironmentsController {
  constructor(private readonly environmentsService: EnvironmentsService) {}

  @Post()
  create(@Body() dto: CreateEnvironmentDto, @CurrentUser() user: CurrentUserPayload) {
    return this.environmentsService.create(dto, user.id);
  }

  @Get()
  findAll(@CurrentUser() user: CurrentUserPayload) {
    return this.environmentsService.findAll(user.id);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.environmentsService.findOneRedacted(id, user.id);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.environmentsService.remove(id, user.id);
  }

  @Post(':id/variables')
  upsertVariable(
    @Param('id') id: string,
    @Body() dto: UpsertVariableDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.environmentsService.upsertVariable(id, dto, user.id);
  }

  @Patch(':id/variables/:variableId')
  updateVariable(
    @Param('id') id: string,
    @Param('variableId') variableId: string,
    @Body() dto: UpsertVariableDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.environmentsService.upsertVariable(
      id,
      { ...dto, id: variableId },
      user.id,
    );
  }

  @Delete(':id/variables/:variableId')
  removeVariable(
    @Param('id') id: string,
    @Param('variableId') variableId: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.environmentsService.removeVariable(id, variableId, user.id);
  }

  // Called by the engine's resolveEnvVar Activity at workflow-run time —
  // carries no user token, so exempt from the global JwtAuthGuard.
  // Internal, not meant for the UI (the UI never sees resolved secret
  // values — see findOneRedacted above).
  @Public()
  @Post(':id/resolve')
  async resolve(@Param('id') id: string, @Body() body: { key: string }) {
    const value = await this.environmentsService.resolveVariable(
      id,
      body.key,
    );
    return { key: body.key, value };
  }
}
