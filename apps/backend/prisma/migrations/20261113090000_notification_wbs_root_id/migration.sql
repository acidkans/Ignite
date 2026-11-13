-- Klucz węzła WBS (sourceWbsNodeId ?? id) powiadomienia z czatu/maila gałęzi — cel kliknięcia w Realizacji.
ALTER TABLE "notifications" ADD COLUMN "wbsRootId" TEXT;
