"use client";

import Link from "next/link";

export function Footer() {
  return (
    <footer className="max-w-9xl self-center border-t py-6 md:py-0 w-full">
      <div className="container flex flex-col items-center justify-between gap-4 md:h-24 md:flex-row">
        <p className="text-muted-foreground text-center text-sm leading-loose md:text-left">
          Scaffolded by &nbsp;
          <span className="font-extrabold">@d0paminedriven/turbogen</span>. The
          source code is available on&nbsp;
          <Link
            href="https://github.com/DopamineDriven/d0paminedriven"
            target="_blank"
            rel="noreferrer"
            className="font-medium underline underline-offset-4">
            GitHub
          </Link>
          .
        </p>
      </div>
    </footer>
  );
}