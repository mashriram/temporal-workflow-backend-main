import { AppNode, WorkflowEdge } from '../workflow.types';

export class CreateWorkflowDto {
  name: string;
  nodes: AppNode[];
  edges: WorkflowEdge[];
  tags?: string[];
}
