import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

export interface MerchantSummary {
  id: string;
  name: string;
}

@Injectable()
export class MerchantsService {
  constructor(private readonly prisma: PrismaService) {}

  create(name: string): Promise<MerchantSummary> {
    return this.prisma.merchant.create({ data: { name }, select: { id: true, name: true } });
  }
}
