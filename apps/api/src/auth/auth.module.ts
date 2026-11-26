import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ApiKeyGuard } from './api-key.guard.js';
import { ApiKeysService } from './api-keys.service.js';

@Module({
  providers: [ApiKeysService, { provide: APP_GUARD, useClass: ApiKeyGuard }],
  exports: [ApiKeysService],
})
export class AuthModule {}
