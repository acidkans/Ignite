-- Maile z wątków Realizacji (gałąź / pozycja) i odpowiedzi na nie
ALTER TABLE "user_mailboxes" ADD COLUMN "watekImapLastUid" INTEGER;
ALTER TABLE "user_mailboxes" ADD COLUMN "watekImapUidValidity" TEXT;

CREATE TABLE "watek_mails" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "processNodeId" TEXT NOT NULL,
    "wbsNodeId" TEXT NOT NULL,
    "mailboxId" TEXT,
    "sentById" TEXT,
    "fromEmail" TEXT NOT NULL,
    "toEmails" TEXT NOT NULL,
    "ccEmails" TEXT,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "commentId" TEXT,
    "inReplyTo" TEXT,
    "sentCopyError" TEXT,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "watek_mails_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "watek_mails_key_key" ON "watek_mails"("key");
CREATE UNIQUE INDEX "watek_mails_messageId_key" ON "watek_mails"("messageId");
CREATE INDEX "watek_mails_processNodeId_idx" ON "watek_mails"("processNodeId");
CREATE INDEX "watek_mails_mailboxId_idx" ON "watek_mails"("mailboxId");
ALTER TABLE "watek_mails" ADD CONSTRAINT "watek_mails_processNodeId_fkey" FOREIGN KEY ("processNodeId") REFERENCES "process_nodes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "watek_mails" ADD CONSTRAINT "watek_mails_mailboxId_fkey" FOREIGN KEY ("mailboxId") REFERENCES "user_mailboxes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "watek_mail_replies" (
    "id" TEXT NOT NULL,
    "watekMailId" TEXT NOT NULL,
    "processNodeId" TEXT NOT NULL,
    "wbsNodeId" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "matchedBy" TEXT NOT NULL,
    "fromEmail" TEXT NOT NULL,
    "fromName" TEXT,
    "subject" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "commentId" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "watek_mail_replies_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "watek_mail_replies_messageId_key" ON "watek_mail_replies"("messageId");
CREATE INDEX "watek_mail_replies_processNodeId_idx" ON "watek_mail_replies"("processNodeId");
CREATE INDEX "watek_mail_replies_watekMailId_idx" ON "watek_mail_replies"("watekMailId");
ALTER TABLE "watek_mail_replies" ADD CONSTRAINT "watek_mail_replies_watekMailId_fkey" FOREIGN KEY ("watekMailId") REFERENCES "watek_mails"("id") ON DELETE CASCADE ON UPDATE CASCADE;
