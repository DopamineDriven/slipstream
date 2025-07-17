"use client";

import type { ComponentPropsWithRef } from "react";
import { cn } from "@/lib/utils";

const Card = ({ className, ref, ...props }: ComponentPropsWithRef<"div">) => (
  <div
    data-slot="card"
    ref={ref}
    className={cn(
      "bg-card text-card-foreground flex flex-col gap-6 rounded-xl border py-2 shadow-sm",
      className
    )}
    {...props}
  />
);

Card.displayName = "Card";

const CardHeader = ({
  className,
  ref,
  ...props
}: ComponentPropsWithRef<"div">) => (
  <div
    data-slot="card-header"
    ref={ref}
    className={cn(
      "@container/card-header grid auto-rows-min grid-rows-[auto_auto] items-start gap-1.5 px-6 has-data-[slot=card-action]:grid-cols-[1fr_auto] [.border-b]:pb-6",
      className
    )}
    {...props}
  />
);

CardHeader.displayName = "CardHeader";

const CardTitle = ({
  className,
  ref,
  ...props
}: ComponentPropsWithRef<"h3">) => (
  <h3
    data-slot="card-title"
    ref={ref}
    className={cn("leading-none font-semibold", className)}
    {...props}
  />
);

CardTitle.displayName = "CardTitle";

const CardDescription = ({
  className,
  ref,
  ...props
}: ComponentPropsWithRef<"p">) => (
  <p
    data-slot="card-description"
    ref={ref}
    className={cn("text-muted-foreground text-sm", className)}
    {...props}
  />
);

CardDescription.displayName = "CardDescription";

const CardContent = ({
  className,
  ref,
  ...props
}: ComponentPropsWithRef<"div">) => (
  <div
    data-slot="card-content"
    ref={ref}
    className={cn("px-4", className)}
    {...props}
  />
);

CardContent.displayName = "CardContent";

const CardFooter = ({
  className,
  ref,
  ...props
}: ComponentPropsWithRef<"div">) => (
  <div
    data-slot="card-footer"
    ref={ref}
    className={cn("flex items-center px-6 [.border-t]:pt-6", className)}
    {...props}
  />
);

CardFooter.displayName = "CardFooter";

function CardAction({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-action"
      className={cn(
        "col-start-2 row-span-2 row-start-1 self-start justify-self-end",
        className
      )}
      {...props}
    />
  );
}
CardAction.displayName = "CardAction";

export {
  Card,
  CardAction,
  CardHeader,
  CardFooter,
  CardTitle,
  CardDescription,
  CardContent
};
