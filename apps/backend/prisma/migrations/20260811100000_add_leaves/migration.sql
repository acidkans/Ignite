-- CreateTable
CREATE TABLE "leave_types" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT '#3b82f6',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "leave_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leaves" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "leaveTypeId" TEXT NOT NULL,
    "dateFrom" TIMESTAMP(3) NOT NULL,
    "dateTo" TIMESTAMP(3) NOT NULL,
    "daysCount" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "leaves_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "leave_types_code_key" ON "leave_types"("code");

-- CreateIndex
CREATE UNIQUE INDEX "leave_types_name_key" ON "leave_types"("name");

-- CreateIndex
CREATE INDEX "leaves_userId_idx" ON "leaves"("userId");

-- CreateIndex
CREATE INDEX "leaves_leaveTypeId_idx" ON "leaves"("leaveTypeId");

-- CreateIndex
CREATE INDEX "leaves_dateFrom_idx" ON "leaves"("dateFrom");

-- AddForeignKey
ALTER TABLE "leaves" ADD CONSTRAINT "leaves_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leaves" ADD CONSTRAINT "leaves_leaveTypeId_fkey" FOREIGN KEY ("leaveTypeId") REFERENCES "leave_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Seed: słownik rodzajów urlopu
INSERT INTO "leave_types" ("id", "code", "name", "color", "sortOrder", "isActive", "createdAt", "updatedAt") VALUES
  (gen_random_uuid(), 'WYPOCZYNKOWY',  'Wypoczynkowy',                  '#3b82f6', 10, true, NOW(), NOW()),
  (gen_random_uuid(), 'L4',            'L4',                            '#ef4444', 20, true, NOW(), NOW()),
  (gen_random_uuid(), 'BEZPLATNY',     'Bezpłatny',                     '#a855f7', 30, true, NOW(), NOW()),
  (gen_random_uuid(), 'OPIEKA',        'Opieka',                        '#14b8a6', 40, true, NOW(), NOW()),
  (gen_random_uuid(), 'NA_ZADANIE',    'Na żądanie',                    '#f59e0b', 50, true, NOW(), NOW()),
  (gen_random_uuid(), 'ZA_SWIETO_SOB', 'Do wyboru za święto w sobotę',  '#84cc16', 60, true, NOW(), NOW())
ON CONFLICT ("code") DO NOTHING;
