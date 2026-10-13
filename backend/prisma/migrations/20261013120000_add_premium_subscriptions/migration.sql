-- CreateTable
CREATE TABLE "subscriptions" (
    "accountId" TEXT NOT NULL,
    "plan" TEXT NOT NULL,
    "accessUntil" TIMESTAMP(3),
    "trialStartedAt" TIMESTAMP(3),
    "trialEndsAt" TIMESTAMP(3),
    "trialRefusedAt" TIMESTAMP(3),
    "customerCode" TEXT,
    "subscriptionCode" TEXT,
    "emailToken" TEXT,
    "cancelled" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("accountId")
);

-- CreateTable
CREATE TABLE "premium_checkouts" (
    "reference" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "plan" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "handledAt" TIMESTAMP(3),
    "outcome" TEXT,

    CONSTRAINT "premium_checkouts_pkey" PRIMARY KEY ("reference")
);

-- CreateTable
CREATE TABLE "premium_charges" (
    "reference" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "premium_charges_pkey" PRIMARY KEY ("reference")
);

-- CreateTable
CREATE TABLE "trial_cards" (
    "signature" TEXT NOT NULL,
    "accountId" TEXT,
    "usedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "trial_cards_pkey" PRIMARY KEY ("signature")
);

-- CreateIndex
CREATE UNIQUE INDEX "subscriptions_subscriptionCode_key" ON "subscriptions"("subscriptionCode");

-- CreateIndex
CREATE INDEX "premium_checkouts_accountId_idx" ON "premium_checkouts"("accountId");

-- CreateIndex
CREATE INDEX "premium_charges_accountId_idx" ON "premium_charges"("accountId");

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "premium_checkouts" ADD CONSTRAINT "premium_checkouts_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "premium_charges" ADD CONSTRAINT "premium_charges_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trial_cards" ADD CONSTRAINT "trial_cards_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
