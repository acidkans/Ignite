-- Podpis HTML skrzynki firmowej (obrazki inline jako data:URI)
ALTER TABLE "user_mailboxes" ADD COLUMN "signatureHtml" TEXT;
