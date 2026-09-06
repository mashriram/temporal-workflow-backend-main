import { Body, Controller, Post } from '@nestjs/common';
import { DependencyInferenceService } from './dependency-inference.service';
import type { PostmanCollection } from './postman-parser';

@Controller('workflows')
export class DependencyInferenceController {
  constructor(private readonly service: DependencyInferenceService) {}

  @Post('import-postman')
  importPostman(@Body() collection: PostmanCollection) {
    return this.service.importPostman(collection);
  }

  @Post('infer-dependencies')
  inferDependencies(
    @Body()
    body: {
      nodes: Array<{ id: string; data?: { config?: Record<string, any> } }>;
      edges: Array<{ source: string; target: string }>;
    },
  ) {
    return this.service.autoWire(body.nodes, body.edges);
  }
}
