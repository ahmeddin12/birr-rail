import { existsSync } from 'node:fs';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { APP_OPTIONS } from './app.setup.js';
import { ENV, type Env } from './config/env.js';

// Local convenience only. Variables already set in the environment win over the file.
if (existsSync('.env')) process.loadEnvFile('.env');

const app = await NestFactory.create(AppModule, APP_OPTIONS);
app.enableShutdownHooks();
await app.listen(app.get<Env>(ENV).BIRRRAIL_PORT);
