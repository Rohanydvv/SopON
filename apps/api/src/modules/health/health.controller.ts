import { Controller, Get, HttpStatus, Res } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse as SwaggerApiResponse } from '@nestjs/swagger';
import { FastifyReply } from 'fastify';
import { HealthService } from './health.service';

@ApiTags('Health & Monitoring')
@Controller('v1')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get('health')
  @ApiOperation({ summary: 'Liveness probe' })
  @SwaggerApiResponse({ status: 200, description: 'API process is alive' })
  getLiveness() {
    return this.healthService.getLiveness();
  }

  @Get('ready')
  @ApiOperation({ summary: 'Readiness probe' })
  @SwaggerApiResponse({ status: 200, description: 'API dependencies are ready' })
  @SwaggerApiResponse({ status: 503, description: 'One or more dependencies are down' })
  async getReadiness(@Res() reply: FastifyReply) {
    const result = await this.healthService.getReadiness();
    const statusCode = result.ready ? HttpStatus.OK : HttpStatus.SERVICE_UNAVAILABLE;
    reply.status(statusCode).send(result);
  }
}
