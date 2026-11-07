-- Tymczasowe dane do podglądu układu maila w wątku (DEV). Sprzątanie: test/watek-mail-fake-cleanup.sql
WITH u AS (SELECT id FROM users WHERE email='claude-test@ignite.test')
INSERT INTO comments (id,"orderId","wbsNodeId","userId",text,type,"createdAt","updatedAt")
SELECT 'fake-c-out','b2f98d11-2d35-47db-ac3a-96803637973f','ce37ea79-dfdd-42b0-8a72-8d84532454ba',u.id,
 E'✉️ Mail do: aromanowicz@europrim.com.pl\nTemat: DURR — BIURKA\n\nczy zabieramy z PL czy kupujemy w DE', 'MAIL_OUT', now()-interval '1 hour', now() FROM u
UNION ALL
SELECT 'fake-c-in','b2f98d11-2d35-47db-ac3a-96803637973f','ce37ea79-dfdd-42b0-8a72-8d84532454ba',u.id,
 E'📨 Odpowiedź mailem od: Andrzej <aromanowicz@europrim.com.pl>\nTemat: Re: DURR — BIURKA\n\nKupujemy w DE, zamówienie w poniedziałek.\n\nPozdrawiam\nAndrzej', 'MAIL_IN', now()-interval '10 minutes', now() FROM u;
INSERT INTO watek_mails (id,key,"messageId","processNodeId","wbsNodeId","sentById","fromEmail","toEmails","ccEmails",subject,body,"commentId")
SELECT 'fake-m','IGW-TESTXX','fake-m@test','b2f98d11-2d35-47db-ac3a-96803637973f','ce37ea79-dfdd-42b0-8a72-8d84532454ba',id,'claude@gigatel.app','["aromanowicz@europrim.com.pl"]','["andrzej@gigatel.app"]','DURR — BIURKA Ref number [IGW-TESTXX]','czy zabieramy z PL czy kupujemy w DE','fake-c-out' FROM users WHERE email='claude-test@ignite.test';
INSERT INTO watek_mail_replies (id,"watekMailId","processNodeId","wbsNodeId","messageId","matchedBy","fromEmail","fromName",subject,text,"commentId","receivedAt")
VALUES ('fake-r','fake-m','b2f98d11-2d35-47db-ac3a-96803637973f','ce37ea79-dfdd-42b0-8a72-8d84532454ba','fake-r@test','header','aromanowicz@europrim.com.pl','Andrzej','Re: DURR — BIURKA Ref number [IGW-TESTXX]',E'Kupujemy w DE, zamówienie w poniedziałek.\n\nPozdrawiam\nAndrzej\n\nW dniu 7.11.2026 napisał:\n> czy zabieramy z PL','fake-c-in',now()-interval '10 minutes');
