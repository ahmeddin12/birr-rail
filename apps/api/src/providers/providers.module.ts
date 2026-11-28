import { Module } from '@nestjs/common';
import { PaymentProviders } from './payment-providers.js';

@Module({ providers: [PaymentProviders], exports: [PaymentProviders] })
export class ProvidersModule {}
