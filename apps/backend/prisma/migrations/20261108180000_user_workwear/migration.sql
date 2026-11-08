-- CreateTable
CREATE TABLE "user_workwear" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "item" TEXT NOT NULL,
    "sizeScale" TEXT NOT NULL DEFAULT 'LETTER',
    "size" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_workwear_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_workwear_userId_item_key" ON "user_workwear"("userId", "item");

-- AddForeignKey
ALTER TABLE "user_workwear" ADD CONSTRAINT "user_workwear_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
