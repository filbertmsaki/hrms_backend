import { Controller, Get, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { SystemHealthService } from './system-health.service';

@ApiTags('System Health')
@Controller('health')
export class SystemHealthController {
  constructor(private readonly service: SystemHealthService) {}

  @Get('live')
  @HttpCode(HttpStatus.OK)
  liveness() {
    return {
      status: 'ok',
      service: 'hrms-backend',
      timestamp: new Date().toISOString(),
    };
  }

  @Get('ready')
  readiness() {
    return this.service.readiness();
  }
}
