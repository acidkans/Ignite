-- Poczta firmowa: domeny (Airtel, Europrim…), skrzynki użytkowników w tych domenach
-- i domena nadawcy w „Informacjach o zamówieniu”.
CREATE TABLE "mail_domains" (
    "id" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "label" TEXT,
    "smtpHost" TEXT,
    "smtpPort" INTEGER DEFAULT 587,
    "smtpSecure" BOOLEAN NOT NULL DEFAULT false,
    "imapHost" TEXT,
    "imapPort" INTEGER DEFAULT 993,
    "imapSecure" BOOLEAN NOT NULL DEFAULT true,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "mail_domains_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "mail_domains_domain_key" ON "mail_domains"("domain");

CREATE TABLE "user_mailboxes" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "domainId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "displayName" TEXT,
    "username" TEXT,
    "password" TEXT,
    "sentFolder" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "imapLastUid" INTEGER,
    "imapUidValidity" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "user_mailboxes_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "user_mailboxes_userId_domainId_key" ON "user_mailboxes"("userId", "domainId");
CREATE INDEX "user_mailboxes_domainId_idx" ON "user_mailboxes"("domainId");
ALTER TABLE "user_mailboxes" ADD CONSTRAINT "user_mailboxes_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "user_mailboxes" ADD CONSTRAINT "user_mailboxes_domainId_fkey" FOREIGN KEY ("domainId") REFERENCES "mail_domains"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "order_requirements" ADD COLUMN "mailDomainId" TEXT;
ALTER TABLE "order_requirements" ADD CONSTRAINT "order_requirements_mailDomainId_fkey" FOREIGN KEY ("mailDomainId") REFERENCES "mail_domains"("id") ON DELETE SET NULL ON UPDATE CASCADE;
