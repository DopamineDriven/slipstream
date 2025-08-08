"use client";

import type { ComponentPropsWithRef, ReactNode } from "react";
import { useRef } from "react";
import { cn } from "@/lib/utils";
import { CopyButton } from "@/ui/atoms/copy-button";

export interface CodeBlockProps
  extends Omit<ComponentPropsWithRef<"pre">, "children"> {
  children: ReactNode;
}

export function CodeBlock({ children, className, ...rest }: CodeBlockProps) {
  const codeRef = useRef<HTMLPreElement | null>(null);

  const getCode = () => {
    if (!codeRef.current) return "";
    const codeElement = codeRef.current.querySelector("code");
    return codeElement?.innerText ?? "";
  };

  return (
    <div className="relative m-0 w-full p-0">
      <pre
        ref={codeRef}
        className={cn(
          className,
          `overflow-x-auto overscroll-x-contain p-0 pt-8 pr-12 [-webkit-overflow-scrolling:touch] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden`,
          `[mask-image:linear-gradient(to_right,transparent,black_14px,black_calc(100%_-_52px),transparent)] [mask-size:100%_100%] [mask-repeat:no-repeat] sm:[mask-image:none]`
        )}
        {...rest}>
        {children}
      </pre>
      <div className="absolute top-1.5 right-1.5 z-10 cursor-pointer sm:top-3 sm:right-3">
        <CopyButton getCodeAction={getCode} />
      </div>
    </div>
  );
}
