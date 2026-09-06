import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  // 👇 Import specific exceptions
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { WorkflowsService } from './workflows.service';
import { DeployWorkflowDto } from './dto/deploy-workflow.dto';
import { CreateWorkflowDto } from './dto/create-workflow.dto';
import { CurrentUser, type CurrentUserPayload } from '../auth/decorators/current-user.decorator';

@Controller('workflows')
export class WorkflowsController {
  constructor(private readonly workflowsService: WorkflowsService) {}

  /**
   * 1. CREATE
   */
  @Post()
  async create(
    @Body() createWorkflowDto: CreateWorkflowDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.workflowsService.createWorkflow(createWorkflowDto, user.id);
  }

  /**
   * 2. LIST
   */
  @Get()
  async findAll(@CurrentUser() user: CurrentUserPayload) {
    return this.workflowsService.findAll(user.id);
  }

  // Home page rollup — static route, must be declared before the ':id'
  // route below or Nest would match "summary" as an :id.
  @Get('summary')
  async summary(@CurrentUser() user: CurrentUserPayload) {
    return this.workflowsService.summary(user.id);
  }

  @Post('import')
  async import(
    @Body() body: { name: string; tags?: string[]; nodes: any[]; edges: any[] },
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.workflowsService.importWorkflow(body, user.id);
  }

  /**
   * 3. GET ONE
   */
  @Get(':id')
  async findOne(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    const workflow = await this.workflowsService.findOne(id, user.id);
    if (!workflow) {
      // ✅ Use semantic exception
      throw new NotFoundException(`Workflow ${id} not found`);
    }
    return workflow;
  }

  @Get(':id/versions')
  async versions(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.workflowsService.listVersions(id, user.id);
  }

  @Post(':id/versions/:versionId/restore')
  async restoreVersion(
    @Param('id') id: string,
    @Param('versionId') versionId: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.workflowsService.restoreVersion(id, versionId, user.id);
  }

  @Get(':id/export')
  async exportWorkflow(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.workflowsService.exportWorkflow(id, user.id);
  }

  /**
   * 4. UPDATE DRAFT
   */
  @Patch(':id')
  async updateDraft(
    @Param('id') id: string,
    @Body() body: { nodes: any[]; edges: any[]; tags?: string[] },
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return await this.workflowsService.updateDraft(
      id,
      body.nodes,
      body.edges,
      user.id,
      body.tags,
    );
  }

  /**
   * 5. DEPLOY
   */
  @Post('deploy')
  async deploy(
    @Body() deployWorkflowDto: DeployWorkflowDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    try {
      return await this.workflowsService.deployWorkflow(
        deployWorkflowDto,
        user.id,
      );
    } catch (e) {
      // Service might throw "No Start Node found" (ValidationError).
      // We catch generic Errors and rethrow as BadRequest so client gets 400, not 500.
      if (e instanceof NotFoundException || e instanceof ForbiddenException) {
        throw e;
      }
      throw new BadRequestException('Validation Error');
    }
  }

  /**
   * 6. STATUS
   */
  @Get(':id/status')
  async getStatus(
    @Param('id') id: string,
    @Query('runId') runId: string | undefined,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    try {
      return await this.workflowsService.getWorkflowStatus(id, runId, user.id);
    } catch (e) {
      console.log(e);
      throw new NotFoundException('Execution not found');
    }
  }
}
