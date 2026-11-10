import { Controller, Get, Logger, ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

interface ReadyResponse {
  status: 'ready';
  checks: { database: 'up' };
}

@Controller()
export class HealthController {
  private readonly logger = new Logger(HealthController.name);

  constructor(private readonly prisma: PrismaService) {}

  /** Liveness: the process is up. Deliberately touches no dependency, so a DB blip never triggers restarts. */
  @Get('health')
  health(): { status: 'ok' } {
    return { status: 'ok' };
  }

  /** Readiness: the dependencies needed to serve traffic are reachable. */
  @Get('ready')
  async ready(): Promise<ReadyResponse> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      this.logger.error(`Readiness check failed: database unreachable (${reason})`);
      throw new ServiceUnavailableException({ status: 'not_ready', checks: { database: 'down' } });
    }
    return { status: 'ready', checks: { database: 'up' } };
  }
}
