-- CreateTable
CREATE TABLE "pending_signups" (
    "tokenHash" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pending_signups_pkey" PRIMARY KEY ("tokenHash")
);

-- CreateTable
CREATE TABLE "password_resets" (
    "tokenHash" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "password_resets_pkey" PRIMARY KEY ("tokenHash")
);

-- CreateIndex
CREATE INDEX "pending_signups_email_idx" ON "pending_signups"("email");

-- CreateIndex
CREATE INDEX "password_resets_accountId_idx" ON "password_resets"("accountId");

-- AddForeignKey
ALTER TABLE "password_resets" ADD CONSTRAINT "password_resets_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
