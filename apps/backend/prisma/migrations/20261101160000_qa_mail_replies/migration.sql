-- Odpowiedzi klientów na maile z pytaniami Q&A (odbiór IMAP)
CREATE TABLE "qa_mail_replies" (
    "id" TEXT NOT NULL,
    "qaMailId" TEXT NOT NULL,
    "processNodeId" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "matchedBy" TEXT NOT NULL,
    "fromEmail" TEXT NOT NULL,
    "fromName" TEXT,
    "subject" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL,
    "proposals" TEXT,
    "aiError" TEXT,
    "status" TEXT NOT NULL DEFAULT 'NEW',
    "handledById" TEXT,
    "handledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "qa_mail_replies_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "qa_mail_replies_messageId_key" ON "qa_mail_replies"("messageId");
CREATE INDEX "qa_mail_replies_processNodeId_status_idx" ON "qa_mail_replies"("processNodeId", "status");
CREATE INDEX "qa_mail_replies_qaMailId_idx" ON "qa_mail_replies"("qaMailId");

ALTER TABLE "qa_mail_replies" ADD CONSTRAINT "qa_mail_replies_qaMailId_fkey" FOREIGN KEY ("qaMailId") REFERENCES "qa_mails"("id") ON DELETE CASCADE ON UPDATE CASCADE;
