"use client";

import type { ComponentPropsWithRef } from "react";
import * as AvatarPrimitive from "@radix-ui/react-avatar";
import { cn } from "@/lib/utils";

type AvatarProps<T extends "Root" | "Image" | "Fallback"> =
  ComponentPropsWithRef<(typeof AvatarPrimitive)[T]>;

function Avatar({ className, ref, ...props }: AvatarProps<"Root">) {
  return (
    <AvatarPrimitive.Root
      ref={ref}
      className={cn(
        "relative flex size-10 shrink-0 overflow-hidden rounded-sm",
        className
      )}
      {...props}
    />
  );
}
Avatar.displayName = AvatarPrimitive.Root.displayName;

function AvatarImage({ className, ref,src, ...props }: AvatarProps<"Image">) {
  return (
    <AvatarPrimitive.Image
      src={src}
      ref={ref}
      className={cn("aspect-square h-full w-full", className)}
      {...props}
    />
  );
}
AvatarImage.displayName = AvatarPrimitive.Image.displayName;

function AvatarFallback({ className, ref, ...props }: AvatarProps<"Fallback">) {
  return (
    <AvatarPrimitive.Fallback
      ref={ref}
      className={cn(
        "bg-muted flex h-full w-full items-center justify-center rounded-sm",
        className
      )}
      {...props}
    />
  );
}
AvatarFallback.displayName = AvatarPrimitive.Fallback.displayName;

export { Avatar, AvatarImage, AvatarFallback, type AvatarProps };
