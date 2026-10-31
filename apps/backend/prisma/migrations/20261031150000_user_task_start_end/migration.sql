-- Zadanie ma Od–Do (data + godzina) zamiast terminu + czasu trwania: plannedStart = początek
-- (wydarzenie Outlook, przypomnienie), plannedEnd = koniec / termin (MS To Do, przeterminowanie),
-- durationMinutes = minuty od początku do końca (ustawione = zadanie ma godzinę i wydarzenie w Outlooku).
-- Dotąd przy zadaniu z godziną plannedEnd niósł POCZĄTEK wydarzenia, a durationMinutes jego długość.

-- Zmigrowane Subtaski (etap 3): Od = pierwszy dzień 8:00, Do = ostatni dzień 8:00 → koniec o 9:00
-- (60 min jak przy migracji); zadanie kilkudniowe trwa od pierwszego do ostatniego dnia.
UPDATE "user_tasks"
SET "plannedEnd" = "plannedEnd" + INTERVAL '60 minutes',
    "durationMinutes" = (EXTRACT(EPOCH FROM ("plannedEnd" + INTERVAL '60 minutes' - COALESCE("plannedStart", "plannedEnd"))) / 60)::int,
    "plannedStart" = COALESCE("plannedStart", "plannedEnd")
WHERE "legacySubtaskId" IS NOT NULL AND "durationMinutes" IS NOT NULL AND "plannedEnd" IS NOT NULL;

-- Pozostałe zadania z godziną: dotychczasowy plannedEnd był początkiem.
UPDATE "user_tasks"
SET "plannedStart" = "plannedEnd",
    "plannedEnd" = "plannedEnd" + make_interval(mins => "durationMinutes")
WHERE "legacySubtaskId" IS NULL AND "durationMinutes" IS NOT NULL AND "plannedEnd" IS NOT NULL;
