-- CreateIndex
CREATE INDEX "AttachmentProvider_provider_keyFingerprint_expiresAt_idx" ON "public"."AttachmentProvider"("provider", "keyFingerprint", "expiresAt");

-- CreateIndex
CREATE INDEX "AttachmentProvider_provider_providerRef_idx" ON "public"."AttachmentProvider"("provider", "providerRef");
