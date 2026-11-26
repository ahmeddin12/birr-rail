// Dev helper: creates a merchant and prints its first API key.
// Usage (after `pnpm build`): pnpm merchant:create "Abebe Books"
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module.js';
import { ApiKeysService } from '../auth/api-keys.service.js';
import { loadLocalEnv } from '../config/load-local-env.js';
import { MerchantsService } from '../merchants/merchants.service.js';

loadLocalEnv();

const name = process.argv[2]?.trim();
if (!name) {
  process.stderr.write('Usage: pnpm merchant:create "<merchant name>"\n');
  process.exit(1);
}

const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
try {
  const merchant = await app.get(MerchantsService).create(name);
  const apiKey = await app.get(ApiKeysService).issue(merchant.id);
  process.stdout.write(
    [
      `Merchant: ${merchant.name} (${merchant.id})`,
      `API key:  ${apiKey.key}`,
      'Store the key now. It is shown once and cannot be recovered.',
      '',
    ].join('\n'),
  );
} finally {
  await app.close();
}
