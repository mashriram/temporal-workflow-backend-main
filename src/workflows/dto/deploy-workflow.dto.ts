import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsObject,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class WorkflowStepParamsDto {
  // We use a loose structure here because params change based on node type
  // You can add specific fields if they are common, or leave it as a record
  [key: string]: any;
}

export class WorkflowStepDto {
  @IsString()
  @IsNotEmpty()
  id: string;

  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsNotEmpty()
  type: string; // e.g. 'trigger_start', 'query_db_postgres'

  @IsObject()
  @IsOptional()
  params: WorkflowStepParamsDto;

  @IsString()
  @IsOptional()
  next?: string | null;

  @IsObject()
  @IsOptional()
  branches?: Record<string, string>; // e.g. { "true": "step_2", "false": "step_3" }
}

export class DeployWorkflowDto {
  @IsString()
  @IsNotEmpty()
  id: string;

  @IsString()
  @IsNotEmpty()
  workflowId: string;

  @IsString()
  @IsNotEmpty()
  startAt: string;

  @IsString()
  @IsOptional()
  environmentId?: string | null;

  @IsObject()
  @ValidateNested({ each: true })
  @Type(() => WorkflowStepDto)
  // Since keys are dynamic IDs (e.g. "tool_postgres_123"), we treat this as a Record
  // Note: class-transformer handles Map/Record conversion best when strictly typed
  steps: Record<string, WorkflowStepDto>;
}
