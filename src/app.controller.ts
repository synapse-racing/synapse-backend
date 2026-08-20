import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AppService } from './app.service';

@ApiTags('system')
@Controller('health')
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  @ApiOperation({ summary: 'Check whether the API process is available' })
  @ApiOkResponse({
    schema: {
      example: {
        status: 'ok',
        service: 'synapse-backend',
        environment: 'development',
      },
    },
  })
  getHealth() {
    return this.appService.getHealth();
  }

  @Get('live')
  @ApiOperation({ summary: 'Check process liveness' })
  getLiveness() {
    return this.appService.getHealth();
  }

  @Get('ready')
  @ApiOperation({ summary: 'Check API and database readiness' })
  getReadiness() {
    return this.appService.getReadiness();
  }
}
