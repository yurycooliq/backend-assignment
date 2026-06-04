import { Controller, Get } from '@nestjs/common';
import { ApiResponse, ApiTags } from '@nestjs/swagger';

@ApiTags('health')
@Controller('health')
export class HealthController {
  @Get()
  @ApiResponse({ status: 200, description: 'Service health' })
  getHealth(): { status: 'ok' } {
    return { status: 'ok' };
  }
}
