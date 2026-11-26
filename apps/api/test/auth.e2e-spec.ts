import type { Server } from 'node:http';
import { Controller, Get, type INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ApiKeysService } from '../src/auth/api-keys.service.js';
import { CurrentMerchant } from '../src/auth/authenticated-request.js';
import { hashApiKey } from '../src/auth/api-key.js';
import { MerchantsService } from '../src/merchants/merchants.service.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { bootApp } from './support/app.js';

/** Not a real route: echoes which merchant the guard resolved, so tests can assert on it. */
@Controller('__test__/whoami')
class WhoAmIController {
  @Get()
  whoami(@CurrentMerchant() merchantId: string) {
    return { merchant_id: merchantId };
  }
}

describe('API key authentication', () => {
  let app: INestApplication<Server>;
  let merchantA: { id: string; key: string; keyId: string };
  let merchantB: { id: string; key: string };

  const whoami = (authorization?: string) => {
    const call = request(app.getHttpServer()).get('/__test__/whoami');
    return authorization === undefined ? call : call.set('Authorization', authorization);
  };

  async function createMerchantWithKey(name: string) {
    const merchant = await app.get(MerchantsService).create(name);
    const issued = await app.get(ApiKeysService).issue(merchant.id);
    return { id: merchant.id, key: issued.key, keyId: issued.id };
  }

  beforeAll(async () => {
    app = await bootApp({ controllers: [WhoAmIController] });
    merchantA = await createMerchantWithKey('Abebe Books');
    merchantB = await createMerchantWithKey('Tigist Coffee');
  });

  afterAll(async () => {
    await app.close();
  });

  it('accepts a valid key and resolves its merchant', async () => {
    await whoami(`Bearer ${merchantA.key}`).expect(200, { merchant_id: merchantA.id });
  });

  it("resolves each merchant's key to that merchant only", async () => {
    await whoami(`Bearer ${merchantB.key}`).expect(200, { merchant_id: merchantB.id });
  });

  it('rejects a request without an Authorization header as missing_api_key', async () => {
    const response = await whoami().expect(401);
    expect(response.headers['www-authenticate']).toBe('Bearer');
    expect(response.body).toMatchObject({
      error: { type: 'authentication_error', code: 'missing_api_key' },
    });
  });

  it.each([
    ['a non-Bearer scheme', () => `Basic ${merchantA.key}`],
    ['a malformed key', () => 'Bearer not-a-real-key'],
    ['a well-formed but unknown key', () => `Bearer brk_test_${'A'.repeat(43)}`],
    ['a live-mode key', () => `Bearer ${merchantA.key.replace('brk_test_', 'brk_live_')}`],
  ])('rejects %s as invalid_api_key', async (_label, header) => {
    const response = await whoami(header()).expect(401);
    expect(response.body).toMatchObject({
      error: { type: 'authentication_error', code: 'invalid_api_key' },
    });
  });

  it('rejects a key once it is revoked, while the merchant’s other keys keep working', async () => {
    const merchant = await createMerchantWithKey('Kebede Electronics');
    const spare = await app.get(ApiKeysService).issue(merchant.id);
    await whoami(`Bearer ${merchant.key}`).expect(200);

    expect(await app.get(ApiKeysService).revoke(merchant.id, merchant.keyId)).toBe(true);

    const response = await whoami(`Bearer ${merchant.key}`).expect(401);
    expect(response.body).toMatchObject({ error: { code: 'invalid_api_key' } });
    await whoami(`Bearer ${spare.key}`).expect(200, { merchant_id: merchant.id });
  });

  it("does not let a merchant revoke another merchant's key", async () => {
    expect(await app.get(ApiKeysService).revoke(merchantB.id, merchantA.keyId)).toBe(false);
    await whoami(`Bearer ${merchantA.key}`).expect(200);
  });

  it('stores only the hash and a short display prefix, never the key itself', async () => {
    const row = await app.get(PrismaService).apiKey.findUniqueOrThrow({
      where: { id: merchantA.keyId },
    });
    expect(row.keyHash).toBe(hashApiKey(merchantA.key));
    expect(merchantA.key.startsWith(row.prefix)).toBe(true);
    expect(row.prefix.length).toBeLessThan(merchantA.key.length);
    expect(JSON.stringify(row)).not.toContain(merchantA.key);
  });

  it('leaves @Public routes open', async () => {
    await request(app.getHttpServer()).get('/health').expect(200);
  });
});
