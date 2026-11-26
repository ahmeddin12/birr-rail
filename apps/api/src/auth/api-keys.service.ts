import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { generateApiKey, hashApiKey, isWellFormedApiKey } from './api-key.js';

export interface IssuedApiKey {
  id: string;
  /** The full key. Return it to the merchant once; it cannot be recovered later. */
  key: string;
  prefix: string;
}

@Injectable()
export class ApiKeysService {
  constructor(private readonly prisma: PrismaService) {}

  async issue(merchantId: string): Promise<IssuedApiKey> {
    const { key, prefix, hash } = generateApiKey();
    const { id } = await this.prisma.apiKey.create({
      data: { merchantId, prefix, keyHash: hash },
      select: { id: true },
    });
    return { id, key, prefix };
  }

  /** Returns the owning merchant's id for an active key, or null for unknown and revoked keys alike. */
  async authenticate(key: string): Promise<string | null> {
    if (!isWellFormedApiKey(key)) {
      return null;
    }
    const row = await this.prisma.apiKey.findUnique({
      where: { keyHash: hashApiKey(key) },
      select: { merchantId: true, revokedAt: true },
    });
    return row && row.revokedAt === null ? row.merchantId : null;
  }

  /** Revokes one of the merchant's own active keys. False if the merchant has no such key. */
  async revoke(merchantId: string, keyId: string): Promise<boolean> {
    const { count } = await this.prisma.apiKey.updateMany({
      where: { id: keyId, merchantId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return count === 1;
  }
}
