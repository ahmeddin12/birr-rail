import type { INestApplication, NestApplicationOptions } from '@nestjs/common';
import { Logger } from 'nestjs-pino';

/** Shared by main.ts and the e2e tests so tests boot the app exactly like production does. */
export const APP_OPTIONS: NestApplicationOptions = {
  // Webhook signatures must be verified against the exact bytes received, not re-serialized JSON.
  rawBody: true,
  // Hold startup logs until pino is attached, so every line is structured JSON.
  bufferLogs: true,
};

export function configureApp(app: INestApplication): void {
  app.useLogger(app.get(Logger));
}
