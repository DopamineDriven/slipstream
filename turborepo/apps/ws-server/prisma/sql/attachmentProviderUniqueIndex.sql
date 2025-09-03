-- Only when userKeyId IS NOT NULL
CREATE UNIQUE INDEX "ap_unique_user"
ON "AttachmentProvider" ("attachmentId","provider","userKeyId")
WHERE "userKeyId" IS NOT NULL;
