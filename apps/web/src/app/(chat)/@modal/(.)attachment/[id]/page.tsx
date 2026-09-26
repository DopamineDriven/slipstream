import { notFound } from "next/navigation";
import { prismaClient } from "@/lib/prisma";
import { ormHandler } from "@/orm";
import { LightboxRoute } from "@/ui/chat/inline-image-gen/lightbox-route";

const { prismaConversationService } = ormHandler(prismaClient);
export default async function InterceptedAttachmentPage({
  params
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const image =
    await prismaConversationService.inlineImageGenSpecsByAttachmentId(id);

  if (!image?.img) notFound();
  return <LightboxRoute image={image.img} />;
}
