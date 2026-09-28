"use client";

import {LightboxRoute} from "@/ui/chat/inline-image-gen/lightbox-route"
import {useEffect, Suspense} from 'react';
import {usePathname, useParams} from "next/navigation";
import {usePathnameContext} from "@/context/pathname-context";
export function ShallowLightbox() {
  const {id}
 = useParams<{id: string}>();
const {pathname} = usePathnameContext();
  
}


/**
 * "use client";
export function AttachmentLightbox() {
  const { id } = useParams<{ id: string }>();
  const pathname = usePathname();
  const row = useCommittedAttachment(id);   // selector over ChatStore.committed
  useEffect(() => { if (!row) window.location.replace(pathname) }, [row, pathname]);
  if (!row?.image) return null;
  return <LightboxRoute image={{ src: row.cdnUrl, width: row.image.width, height: row.image.height,
    alt: row.inlineImageGenOutput?.revisedPrompt ?? row.filename,
    caption: row.inlineImageGenOutput?.revisedPrompt, format: row.inlineImageGenOutput?.ext }} />;
}
 */
