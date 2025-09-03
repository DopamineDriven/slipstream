-- Only when userKeyId IS NULL (i.e., server key)
CREATE UNIQUE INDEX "ap_unique_server"
ON "AttachmentProvider" ("attachmentId","provider")
WHERE "userKeyId" IS NULL;
