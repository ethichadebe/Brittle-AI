-- CreateTable
CREATE TABLE "substitute_decisions" (
    "accountId" TEXT NOT NULL,
    "fromStore" TEXT NOT NULL,
    "fromProductId" TEXT NOT NULL,
    "toStore" TEXT NOT NULL,
    "toProductId" TEXT NOT NULL,
    "toProductName" TEXT NOT NULL,
    "choice" TEXT NOT NULL,
    "decidedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "substitute_decisions_pkey" PRIMARY KEY ("accountId","fromStore","fromProductId","toStore","toProductId")
);

-- AddForeignKey
ALTER TABLE "substitute_decisions" ADD CONSTRAINT "substitute_decisions_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
