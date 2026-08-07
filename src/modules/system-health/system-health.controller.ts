import { Controller, Get, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { SystemHealthService } from './system-health.service';
import { Public } from '../../common/decorators/public.decorator';

@ApiTags('System Health')
@Public()
@Controller('health')
export class SystemHealthController {
  constructor(private readonly service: SystemHealthService) {}

  @Get()
  health() {
    return this.service.readiness();
  }

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
