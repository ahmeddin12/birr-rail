import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { APP_OPTIONS, configureApp } from './app.setup.js';
import { ENV, type Env } from './config/env.js';
import { loadLocalEnv } from './config/load-local-env.js';

loadLocalEnv();

const app = await NestFactory.create(AppModule, APP_OPTIONS);
configureApp(app);
app.enableShutdownHooks();
await app.listen(app.get<Env>(ENV).BIRRRAIL_PORT);
