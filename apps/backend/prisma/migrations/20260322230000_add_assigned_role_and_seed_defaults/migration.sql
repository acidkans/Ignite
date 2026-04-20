-- Add assignedRole column
ALTER TABLE "default_project_items" ADD COLUMN "assignedRole" TEXT;

-- Seed default Organizacyjne items
INSERT INTO "default_project_items" ("id", "category", "name", "description", "assignedRole", "sortOrder", "createdAt", "updatedAt")
VALUES
  (gen_random_uuid(), 'organizacyjne', 'Wycena materiałów',   NULL, 'LOGISTYK', 0, NOW(), NOW()),
  (gen_random_uuid(), 'organizacyjne', 'Zamówienie materiałów', NULL, 'LOGISTYK', 1, NOW(), NOW());
