-- Maile z pytaniami do klienta (Q&A) wysyłane ze skrzynek firmowych
CREATE TABLE "qa_mails" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "processNodeId" TEXT NOT NULL,
    "mailboxId" TEXT,
    "sentById" TEXT,
    "fromEmail" TEXT NOT NULL,
    "toEmails" TEXT NOT NULL,
    "ccEmails" TEXT,
    "subject" TEXT NOT NULL,
    "items" TEXT NOT NULL,
    "sentCopyError" TEXT,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "qa_mails_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "qa_mails_key_key" ON "qa_mails"("key");
CREATE UNIQUE INDEX "qa_mails_messageId_key" ON "qa_mails"("messageId");
CREATE INDEX "qa_mails_processNodeId_idx" ON "qa_mails"("processNodeId");
CREATE INDEX "qa_mails_mailboxId_idx" ON "qa_mails"("mailboxId");

ALTER TABLE "qa_mails" ADD CONSTRAINT "qa_mails_processNodeId_fkey" FOREIGN KEY ("processNodeId") REFERENCES "process_nodes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "qa_mails" ADD CONSTRAINT "qa_mails_mailboxId_fkey" FOREIGN KEY ("mailboxId") REFERENCES "user_mailboxes"("id") ON DELETE SET NULL ON UPDATE CASCADE;
