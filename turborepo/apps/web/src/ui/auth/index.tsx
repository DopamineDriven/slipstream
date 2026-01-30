"use client";

import Image from "next/image";
import { shimmer } from "@/lib/shimmer";
import { Logo } from "@/ui/logo";
import {
  signinAnonymous,
  signinGithub,
  signinGoogle
} from "@/utils/auth-sign-in";
import { AnonymousIcon, Button, Github, GoogleIcon } from "@slipstream/ui";

export function AuthUI({
  target = "sign_in"
}: {
  target: "sign_in" | "sign_up";
}) {
  return (
    <div className="text-foreground grid min-h-dvh grid-cols-1 bg-transparent lg:grid-cols-2">
      <div className="via-background/95 flex flex-1 items-center justify-center bg-linear-to-b from-gray-900 to-gray-900 px-6 py-12 sm:px-10 lg:px-20">
        <div className="w-full max-w-md">
          <div className="select-none">
            <Logo className="text-foreground stroke-foreground size-12" />
            <h1 className="mt-8 text-2xl font-bold tracking-tight">
              {target === "sign_in" ? "Sign In" : "Sign Up"}
            </h1>
            <p className="text-muted-foreground mt-2 text-sm">
              Choose a provider to continue
            </p>
          </div>
          <div className="mt-8 grid grid-cols-1 gap-3">
            <Button
              variant="ghost"
              type="button"
              size="lg"
              onClick={signinGithub}
              className="dark:bg-background/50 text-foreground transition-color border-foreground/50 relative inline-flex w-full cursor-pointer items-center justify-center gap-3 rounded-md border px-4 py-2 text-sm font-semibold transition-colors duration-150 dark:hover:bg-transparent">
              <Github className="absolute inset-y-auto left-28 my-auto size-12" />
              <span className="absolute inset-y-auto left-36 my-auto">
                Continue with GitHub
              </span>
            </Button>
          </div>
          <div className="mt-8 grid grid-cols-1 gap-3">
            <Button
              variant="ghost"
              type="button"
              size="lg"
              onClick={signinGoogle}
              className="dark:bg-background/50 text-foreground transition-color border-foreground/50 relative inline-flex w-full cursor-pointer items-center justify-center gap-3 rounded-md border px-10 py-2 text-sm font-semibold transition-colors duration-150 dark:hover:bg-transparent">
              <GoogleIcon className="absolute inset-y-auto left-28 my-auto size-12 rounded-full" />
              <span className="absolute inset-y-auto left-36 my-auto">
                Continue with Google
              </span>
            </Button>
          </div>
          {/**removed grid from classname until anonymous method is fully fixed*/}
          <div className="mt-8 hidden grid-cols-1 gap-3">
            <Button
              variant="ghost"
              type="button"
              size="lg"
              onClick={signinAnonymous}
              className="dark:bg-background/50 text-foreground transition-color border-foreground/50 relative inline-flex w-full cursor-pointer items-center justify-center gap-3 rounded-md border px-10 py-2 text-sm font-semibold transition-colors duration-150 dark:hover:bg-transparent">
              <AnonymousIcon className="absolute inset-y-auto left-28 my-auto size-12 rounded-full" />
              <span className="absolute inset-y-auto left-36 my-auto">
                Continue Anonymously
              </span>
            </Button>
          </div>
        </div>
      </div>
      <div className="via-background/95 relative z-10 flex-1 bg-linear-to-b from-gray-900 to-gray-900 inset-shadow-gray-100 lg:block">
        <Image
          width={2160}
          height={1260}
          alt="aicoalesce"
          placeholder="blur"
          blurDataURL={shimmer([2160, 1260])}
          src={
            "https://assets.aicoalesce.com/upload/nrr6h4r4480f6kviycyo1zhf/1759131668389-aicoalesce-og-final-1758955992844.png"
          }
          className="absolute inset-0 my-auto w-full rounded-sm object-cover"
        />
      </div>
    </div>
  );
}
