import { Inject, Injectable } from '@nestjs/common';
import { ENV, type Env } from '../config/env.js';
import { ApiError, toErrorBody } from '../errors/api-error.js';
import type { Prisma } from '../generated/prisma/client.js';
import type { IdempotencyStatus } from '../generated/prisma/enums.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { hashRequest } from './request-hash.js';

export interface IdempotencyScope {
  merchantId: string;
  key: string;
  method: string;
  path: string;
  /** The validated request body. Its canonical form is part of the request fingerprint. */
  body: unknown;
  requestId: string;
}

export interface StoredResponse {
  status: number;
  body: unknown;
}

export interface IdempotentResult extends StoredResponse {
  /** True when this is a stored response from an earlier request with the same key. */
  replayed: boolean;
}

interface ExistingKey {
  id: string;
  request_hash: string;
  status: IdempotencyStatus;
  response_status: number | null;
  response_body: unknown;
  lease_active: boolean;
}

const keyInUse = () =>
  new ApiError(
    409,
    'idempotency_error',
    'idempotency_key_in_use',
    'A request with this Idempotency-Key is still being processed. Retry shortly.',
    null,
    { 'Retry-After': '1' },
  );

@Injectable()
export class IdempotencyService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  /**
   * Runs `handler` at most once per (merchant, key). Every later request with the same key and
   * body gets the stored response; a different body gets a 422; a concurrent one gets a 409.
   */
  async execute(
    scope: IdempotencyScope,
    handler: () => Promise<StoredResponse>,
  ): Promise<IdempotentResult> {
    const requestHash = hashRequest(scope.method, scope.path, scope.body);
    const claimedId = await this.claim(scope, requestHash);
    if (claimedId === null) {
      return { ...(await this.resolveExisting(scope, requestHash)), replayed: true };
    }

    let response: StoredResponse;
    try {
      response = await handler();
    } catch (error) {
      // Side effects may already have happened, so the request must not run again. Ending the
      // lease now means the next retry records the outcome as unknown instead of waiting.
      await this.prisma.$executeRaw`
        UPDATE idempotency_keys SET locked_until = now()
        WHERE id = ${claimedId}::uuid AND status = 'in_progress'`;
      throw error;
    }

    await this.prisma.idempotencyKey.update({
      where: { id: claimedId },
      data: {
        status: 'completed',
        responseStatus: response.status,
        responseBody: response.body as Prisma.InputJsonValue,
        completedAt: new Date(),
      },
    });
    return { ...response, replayed: false };
  }

  /**
   * The unique constraint on (merchant_id, key) picks exactly one winner, even under heavy
   * concurrency. No check-then-insert: that has a gap two requests can slip through together.
   * Returns the new row's id, or null if the key already existed.
   */
  private async claim(scope: IdempotencyScope, requestHash: string): Promise<string | null> {
    const rows = await this.prisma.$queryRaw<{ id: string }[]>`
      INSERT INTO idempotency_keys
        (merchant_id, key, request_method, request_path, request_hash, locked_until)
      VALUES (
        ${scope.merchantId}::uuid, ${scope.key}, ${scope.method}, ${scope.path}, ${requestHash},
        now() + ${this.env.BIRRRAIL_IDEMPOTENCY_LEASE_SECONDS}::int * interval '1 second'
      )
      ON CONFLICT (merchant_id, key) DO NOTHING
      RETURNING id`;
    return rows[0]?.id ?? null;
  }

  private async resolveExisting(
    scope: IdempotencyScope,
    requestHash: string,
  ): Promise<StoredResponse> {
    // lease_active is computed by Postgres so every app instance uses the same clock.
    const [existing] = await this.prisma.$queryRaw<ExistingKey[]>`
      SELECT id, request_hash, status, response_status, response_body,
             locked_until > now() AS lease_active
      FROM idempotency_keys
      WHERE merchant_id = ${scope.merchantId}::uuid AND key = ${scope.key}`;

    if (existing === undefined) {
      throw keyInUse(); // Deleted between our insert and this read; a retry will claim it.
    }
    if (existing.request_hash !== requestHash) {
      throw new ApiError(
        422,
        'idempotency_error',
        'idempotency_key_reused',
        'This Idempotency-Key was already used with a different request.',
      );
    }
    if (existing.status === 'completed' && existing.response_status !== null) {
      return { status: existing.response_status, body: existing.response_body };
    }
    if (existing.lease_active) {
      throw keyInUse();
    }

    // The lease ran out while in progress: that request crashed or failed unexpectedly, and
    // whatever it did is unknown. Record one final answer; every later retry replays it.
    const interrupted: StoredResponse = {
      status: 500,
      body: toErrorBody(
        new ApiError(
          500,
          'api_error',
          'idempotent_request_interrupted',
          'An earlier request with this Idempotency-Key stopped before it finished, so its outcome is unknown. Do not assume it failed.',
        ),
        scope.requestId,
      ),
    };
    const marked = await this.prisma.$executeRaw`
      UPDATE idempotency_keys
      SET status = 'completed', response_status = ${interrupted.status},
          response_body = ${JSON.stringify(interrupted.body)}::jsonb, completed_at = now()
      WHERE id = ${existing.id}::uuid AND status = 'in_progress' AND locked_until <= now()`;
    // 0 rows: another request recorded the answer first, so read theirs instead.
    return marked === 1 ? interrupted : this.resolveExisting(scope, requestHash);
  }
}
