import type { NestApplicationOptions } from '@nestjs/common';

/** Shared by main.ts and the e2e tests so tests boot the app exactly like production does. */
export const APP_OPTIONS: NestApplicationOptions = {
  // Webhook signatures must be verified against the exact bytes received, not re-serialized JSON.
  rawBody: true,
};
