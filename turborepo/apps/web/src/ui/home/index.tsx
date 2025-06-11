"use client";

import { Button, Icon } from "@t3-chat-clone/ui";
import Link from "next/link";
import { motion } from "motion/react";

export function LandingPage() {
  return (
    <>
      <section className="font-cal-sans mx-auto flex justify-center space-y-6 pt-6 pb-8 md:pt-10 md:pb-12 lg:py-32">
        <div className="container flex max-w-[64rem] flex-col items-center gap-4 text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="bg-muted rounded-2xl px-4 py-1.5 text-sm font-medium">
            Your workspace is ready
          </motion.div>
          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="font-cal-sans text-3xl sm:text-5xl md:text-6xl lg:text-7xl">
            Welcome to your&nbsp;
            <span className="bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent">
              Turbo
            </span>
            &nbsp; powered workspace
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="text-muted-foreground max-w-[42rem] leading-normal sm:text-xl sm:leading-8">
            A high-performance monorepo with pnpm workspaces, powered by
            Turborepo. Pre-configured with ESLint, Prettier, TypeScript, and
            Jest.
          </motion.p>
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.3 }}
            className="space-x-4">
            <Button asChild>
              <Link href="#" scroll={false}>
                Get Started <Icon.ArrowRight className="ml-2 size-4" />
              </Link>
            </Button>
            <Button variant="outline" asChild>
              <Link
                href="https://github.com/DopamineDriven/d0paminedriven"
                target="_blank"
                rel="noreferrer">
                GitHub
              </Link>
            </Button>
          </motion.div>
        </div>
      </section>

      <section className="container space-y-6 py-8 md:py-12 lg:py-24">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          viewport={{ once: true }}
          className="mx-auto flex max-w-[58rem] flex-col items-center space-y-4 text-center">
          <h2 className="font-cal-sans text-3xl leading-[1.1] sm:text-3xl md:text-5xl">
            Everything you need to build at scale
          </h2>
          <p className="text-muted-foreground max-w-[85%] leading-normal sm:text-lg sm:leading-7">
            Turbogen provides a solid foundation for your projects with a focus
            on developer experience and performance.
          </p>
        </motion.div>
        <div className="mx-auto grid justify-center gap-4 sm:grid-cols-2 md:max-w-[64rem] md:grid-cols-3">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            viewport={{ once: true }}
            className="bg-background relative overflow-hidden rounded-lg border p-6">
            <div className="bg-muted flex h-12 w-12 items-center justify-center rounded-full">
              <Icon.Zap className="size-6 text-purple-600" />
            </div>
            <div className="mt-4 space-y-2">
              <h3 className="font-bold">High Performance</h3>
              <p className="text-muted-foreground text-sm">
                Turborepo's intelligent caching ensures your builds are
                lightning fast.
              </p>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            viewport={{ once: true }}
            className="bg-background relative overflow-hidden rounded-lg border p-6">
            <div className="bg-muted flex h-12 w-12 items-center justify-center rounded-full">
              <Icon.Layers className="size-6 text-purple-600" />
            </div>
            <div className="mt-4 space-y-2">
              <h3 className="font-bold">Monorepo Structure</h3>
              <p className="text-muted-foreground text-sm">
                Organized workspace with apps and packages for maximum code
                reuse.
              </p>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.3 }}
            viewport={{ once: true }}
            className="bg-background relative overflow-hidden rounded-lg border p-6">
            <div className="bg-muted flex h-12 w-12 items-center justify-center rounded-full">
              <Icon.Code className="size-6 text-purple-600" />
            </div>
            <div className="mt-4 space-y-2">
              <h3 className="font-bold">Tooling Included</h3>
              <p className="text-muted-foreground text-sm">
                Pre-configured ESLint, Prettier, TypeScript, and Jest for
                consistent code quality.
              </p>
            </div>
          </motion.div>
        </div>
      </section>

      <section className="container py-8 md:py-12 lg:py-24">
        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          transition={{ duration: 0.8 }}
          viewport={{ once: true }}
          className="mx-auto max-w-[58rem] space-y-6 text-center">
          <h2 className="font-heading text-3xl leading-[1.1] sm:text-3xl md:text-5xl">
            Ready to start building?
          </h2>
          <p className="text-muted-foreground leading-normal sm:text-lg sm:leading-7">
            Your workspace is already set up. Here's how to get started:
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          viewport={{ once: true }}
          className="bg-muted/50 mx-auto mt-12 max-w-[58rem] rounded-lg border p-6 md:p-8">
          <div className="flex items-center">
            <Icon.Terminal className="mr-2 size-5" />
            <h3 className="font-bold">Start developing</h3>
          </div>
          <div className="mt-4 space-y-4">
            <div className="rounded-md bg-black p-4">
              <pre className="text-sm text-white">
                <code>{`# Install dependencies
pnpm install

# Start development server
pnpm run:web`}</code>
              </pre>
            </div>
            <p className="text-muted-foreground text-sm">
              This will start the development server for your web application.
              You can now start building your project!
            </p>
          </div>
        </motion.div>
      </section>

      <section className="container py-8 md:py-12 lg:py-24">
        <div className="bg-background mx-auto max-w-[58rem] rounded-lg border p-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            viewport={{ once: true }}
            className="flex flex-col items-center justify-center space-y-4 text-center">
            <div className="bg-muted rounded-full p-3">
              <Icon.Package className="size-6 text-purple-600" />
            </div>
            <h3 className="font-heading text-2xl leading-[1.1]">
              Explore your workspace
            </h3>
            <p className="text-muted-foreground">
              Your monorepo is organized with the following structure:
            </p>
            <div className="bg-muted w-full max-w-md rounded-md p-4 text-left">
              <pre className="text-sm">
                <code>
                  {`├── apps/
│   └── web/
├── packages/
│   └── ui/
└── tooling/
    ├── eslint/
    ├── jest-presets/
    ├── prettier/
    └── typescript/`}
                </code>
              </pre>
            </div>
            <Button asChild>
              <Link href="#" scroll={false}>
                Learn more about the structure&nbsp;
                <Icon.ArrowRight className="ml-2 size-4" />
              </Link>
            </Button>
          </motion.div>
        </div>
      </section>
    </>
  );
}
