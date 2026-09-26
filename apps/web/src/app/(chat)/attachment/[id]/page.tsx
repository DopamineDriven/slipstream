import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prismaClient } from "@/lib/prisma";
import { ormHandler } from "@/orm";

const { prismaConversationService } = ormHandler(prismaClient);

export async function generateMetadata({
  params
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const image =
    await prismaConversationService.inlineImageGenSpecsByAttachmentId(id);
  if (!image?.img || !image.attr) return {};
  return {
    title: `${image.attr.facilitatingModel} (facilitor) · ${image.attr.generatingModel} (creator) · ${image.img.width}×${image.img.height}`,
    description: image.img.caption,
    openGraph: {
      images: [
        { url: image.img.src, width: image.img.width, height: image.img.height }
      ]
    }
  };
}

/** Hard loads and shared links land here; soft navigations are intercepted
 *  by `@modal/(.)attachment/[id]` and shown as a lightbox over the conversation. */
export default async function AttachmentPage({
  params
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const image =
    await prismaConversationService.inlineImageGenSpecsByAttachmentId(id);
  if (!image) notFound();

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-6 py-10">
      <Link
        href={`/chat/${image.conversationId}`}
        className="text-muted-foreground hover:text-foreground w-fit text-sm transition-colors">
        &larr; Back to conversation
      </Link>
      <figure className="flex flex-col gap-3">
        <div
          className="bg-muted relative overflow-hidden rounded-2xl"
          style={{
            aspectRatio: `${image.img.width} / ${image.img.height}`,
            width: `min(100%, ${image.img.width}px)`
          }}>
          <Image
            src={image.img.src}
            alt={image.img.alt}
            fill
            sizes="(min-width: 64rem) 64rem, 100vw"
            className="object-cover"
            priority
          />
        </div>
        <figcaption className="flex flex-col gap-1">
          <span className="text-muted-foreground font-mono text-xs">
            {image.img.width} × {image.img.height} · {image.img.format}
          </span>
          <span className="text-muted-foreground max-w-3xl text-sm leading-relaxed text-pretty">
            {image.img.caption}
          </span>
        </figcaption>
      </figure>
    </main>
  );
}
