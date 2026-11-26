-- CreateEnum
CREATE TYPE "payment_status" AS ENUM ('created', 'pending', 'succeeded', 'failed', 'expired', 'refunded');

-- CreateTable
CREATE TABLE "payments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "merchant_id" UUID NOT NULL,
    "amount_minor" BIGINT NOT NULL,
    "status" "payment_status" NOT NULL DEFAULT 'created',
    "provider" TEXT NOT NULL,
    "provider_ref" TEXT,
    "merchant_reference" TEXT,
    "checkout_url" TEXT,
    "return_url" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "version" INTEGER NOT NULL DEFAULT 0,
    "expires_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "payment_id" UUID NOT NULL,
    "from_status" "payment_status" NOT NULL,
    "to_status" "payment_status" NOT NULL,
    "reason" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "payments_merchant_id_idx" ON "payments"("merchant_id");

-- CreateIndex
CREATE UNIQUE INDEX "payments_provider_provider_ref_key" ON "payments"("provider", "provider_ref");

-- CreateIndex
CREATE UNIQUE INDEX "payment_events_payment_id_version_key" ON "payment_events"("payment_id", "version");

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_events" ADD CONSTRAINT "payment_events_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Hand-written: Prisma's schema language cannot express CHECK constraints.
-- The database itself refuses zero or negative amounts, whatever the application does.
ALTER TABLE "payments" ADD CONSTRAINT "payments_amount_minor_positive" CHECK ("amount_minor" > 0);

-- A payment event always records a real change of status.
ALTER TABLE "payment_events" ADD CONSTRAINT "payment_events_status_changes" CHECK ("from_status" <> "to_status");
