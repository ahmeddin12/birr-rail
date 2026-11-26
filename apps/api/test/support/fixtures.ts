import type { INestApplication } from '@nestjs/common';
import { ApiKeysService } from '../../src/auth/api-keys.service.js';
import type { Payment } from '../../src/generated/prisma/client.js';
import type { PaymentStatus } from '../../src/generated/prisma/enums.js';
import { MerchantsService } from '../../src/merchants/merchants.service.js';
import { PrismaService } from '../../src/prisma/prisma.service.js';

export interface TestMerchant {
  id: string;
  key: string;
  keyId: string;
}

export async function createMerchantWithKey(
  app: INestApplication,
  name: string,
): Promise<TestMerchant> {
  const merchant = await app.get(MerchantsService).create(name);
  const issued = await app.get(ApiKeysService).issue(merchant.id);
  return { id: merchant.id, key: issued.key, keyId: issued.id };
}

/**
 * Inserts a payment directly in the given status. Test setup only: real payments are created
 * through the API (Phase 2) and change status only through PaymentsService.transition().
 */
export function insertPayment(
  app: INestApplication,
  merchantId: string,
  status: PaymentStatus = 'created',
): Promise<Payment> {
  return app.get(PrismaService).payment.create({
    data: { merchantId, amountMinor: 45_050n, status, provider: 'mock' },
  });
}
