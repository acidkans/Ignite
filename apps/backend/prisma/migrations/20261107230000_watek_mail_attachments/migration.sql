-- Załączniki maili wątków (wysłane i odebrane)
ALTER TABLE "watek_mails" ADD COLUMN "attachments" TEXT;
ALTER TABLE "watek_mail_replies" ADD COLUMN "attachments" TEXT;
