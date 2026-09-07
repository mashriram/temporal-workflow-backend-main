// --------------------------------------------------------
// 1. Enums & Unions
// --------------------------------------------------------

export type NodeType =
  | 'trigger_start'
  | 'logic_loop'
  | 'logic_wait'
  | 'logic_router'
  | 'query_db_postgres'
  | 'send_email_sendgrid'
  | 'send_sms_twilio';

export type NodeStatus =
  'idle' | 'pending' | 'running' | 'completed' | 'failed';

export type RouterOperator = '==' | '!=' | '>' | '<' | 'contains';

// --------------------------------------------------------
// 2. Configuration Interfaces (Specific per Node)
// --------------------------------------------------------

export interface BaseConfig {
  [key: string]: any;
}

export interface TriggerConfig extends BaseConfig {
  triggerType: 'Webhook' | 'Schedule';
  cron?: string;
}

export interface PostgresConfig extends BaseConfig {
  query: string;
}

export interface LoopConfig extends BaseConfig {
  variable: string; // e.g. "get_students_db.rows"
  batchSize?: string | number;
  executionType?: 'Sequential' | 'Parallel';
}

export interface WaitConfig extends BaseConfig {
  duration: string; // e.g. "20s", "2d"
}

export interface RouteRule {
  id: string;
  operator: RouterOperator;
  value: string;
}

export interface RouterConfig extends BaseConfig {
  variable: string;
  routes: RouteRule[];
}

export interface EmailConfig extends BaseConfig {
  to: string;
  subject: string;
  body: string;
}

export interface SmsConfig extends BaseConfig {
  to: string;
  body: string;
}

// --------------------------------------------------------
// 3. Node Data Definition
// --------------------------------------------------------

// This is the shape of the 'data' property inside React Flow
export interface WorkflowNodeData<TConfig = BaseConfig> {
  label: string;
  type: NodeType;
  status: NodeStatus;
  config: TConfig;
  errorMessage?: string;
  output?: any;
}

// --------------------------------------------------------
// 4. The React Flow Node Definitions
// --------------------------------------------------------

export interface WorkflowNode<TConfig = BaseConfig> {
  id: string;
  type: NodeType;
  position: { x: number; y: number };
  data: WorkflowNodeData<TConfig>;
  dragging?: boolean;
  selected?: boolean;
  measured?: { width: number; height: number };
}

// Specific Node Types (for stricter type checking if needed)
export type StartNode = WorkflowNode<TriggerConfig>;
export type PostgresNode = WorkflowNode<PostgresConfig>;
export type LoopNode = WorkflowNode<LoopConfig>;
export type WaitNode = WorkflowNode<WaitConfig>;
export type RouterNode = WorkflowNode<RouterConfig>;
export type EmailNode = WorkflowNode<EmailConfig>;
export type SmsNode = WorkflowNode<SmsConfig>;

// Union of all possible nodes
export type AppNode =
  | StartNode
  | PostgresNode
  | LoopNode
  | WaitNode
  | RouterNode
  | EmailNode
  | SmsNode;

// --------------------------------------------------------
// 5. Payload for Backend (Deployment)
// --------------------------------------------------------

export interface WorkflowEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string | null;
  animated?: boolean;
  style?: any;
}
