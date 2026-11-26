import type { Server } from 'node:http';
import type { INestApplication, Type } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppModule } from '../../src/app.module.js';
import { APP_OPTIONS, configureApp } from '../../src/app.setup.js';
import { ENV, parseEnv } from '../../src/config/env.js';

export interface BootOptions {
  envOverrides?: Record<string, string>;
  /** Test-only controllers, for exercising cross-cutting behaviour without adding real routes. */
  controllers?: Type[];
}

/** Boots the real AppModule exactly like main.ts does, against the guarded test database. */
export async function bootApp(options: BootOptions = {}): Promise<INestApplication<Server>> {
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
    controllers: options.controllers ?? [],
  })
    .overrideProvider(ENV)
    .useValue(parseEnv({ ...process.env, ...options.envOverrides }))
    .compile();
  const app = moduleRef.createNestApplication<INestApplication<Server>>(APP_OPTIONS);
  configureApp(app);
  await app.init();
  return app;
}
