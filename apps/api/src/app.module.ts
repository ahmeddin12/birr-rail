import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { LoggerModule } from 'nestjs-pino';
import { ConfigModule } from './config/config.module.js';
import { ENV, type Env } from './config/env.js';
import { ApiExceptionFilter } from './errors/api-exception.filter.js';
import { HealthModule } from './health/health.module.js';
import { buildPinoHttpOptions } from './logging/logger.options.js';
import { PrismaModule } from './prisma/prisma.module.js';

@Module({
  imports: [
    ConfigModule,
    LoggerModule.forRootAsync({
      inject: [ENV],
      useFactory: (env: Env) => ({ pinoHttp: buildPinoHttpOptions(env) }),
    }),
    PrismaModule,
    HealthModule,
  ],
  providers: [{ provide: APP_FILTER, useClass: ApiExceptionFilter }],
})
export class AppModule {}
