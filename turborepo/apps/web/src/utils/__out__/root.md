**File:** `eslint.config.mjs`

For more details, [visit the raw version of this file](https://raw.githubusercontent.com/DopamineDriven/t3-chat-clone/refs/heads/main/turborepo/apps/web/eslint.config.mjs).

```mjs

import baseConfig from "@t3-chat-clone/eslint-config/base";
import nextjsConfig from "@t3-chat-clone/eslint-config/next";
import reactConfig from "@t3-chat-clone/eslint-config/react";

/** @type {import('typescript-eslint').Config} */
export default [
  ...baseConfig,
  ...reactConfig,
  ...nextjsConfig,
  {
    ignores: [".next/**", "!.next/types/**/*"],
    rules: {
      "@typescript-eslint/consistent-type-assertions": "off",
      "@typescript-eslint/require-await": "off",
      "import/consistent-type-specifier-style": "off",
      "@typescript-eslint/no-floating-promises": "off"
    }
  }
];


```


**Related Resources:**
  - Raw file URL: https://raw.githubusercontent.com/DopamineDriven/t3-chat-clone/refs/heads/main/turborepo/apps/web/eslint.config.mjs


---


**File:** `global.d.ts`

For more details, [visit the raw version of this file](https://raw.githubusercontent.com/DopamineDriven/t3-chat-clone/refs/heads/main/turborepo/apps/web/global.d.ts).

```ts

/// <reference types="node" />

declare global {
  namespace NodeJS {
    interface ProcessEnv {
      readonly VERCEL_ENV: "development" | "production" | "preview";
    }
  }
}

export {};


```


**Related Resources:**
  - Raw file URL: https://raw.githubusercontent.com/DopamineDriven/t3-chat-clone/refs/heads/main/turborepo/apps/web/global.d.ts


---


**File:** `next-env.d.ts`

For more details, [visit the raw version of this file](https://raw.githubusercontent.com/DopamineDriven/t3-chat-clone/refs/heads/main/turborepo/apps/web/next-env.d.ts).

```ts

/// <reference types="next" />
/// <reference types="next/image-types/global" />

// NOTE: This file should not be edited
// see https://nextjs.org/docs/app/api-reference/config/typescript for more information.


```


**Related Resources:**
  - Raw file URL: https://raw.githubusercontent.com/DopamineDriven/t3-chat-clone/refs/heads/main/turborepo/apps/web/next-env.d.ts


---


**File:** `next.config.ts`

For more details, [visit the raw version of this file](https://raw.githubusercontent.com/DopamineDriven/t3-chat-clone/refs/heads/main/turborepo/apps/web/next.config.ts).

```ts

import type { NextConfig } from "next";

export default {
  reactStrictMode: true,
  eslint: { ignoreDuringBuilds: false },
  typescript: { ignoreBuildErrors: false, tsconfigPath: "./tsconfig.json" },
  images: {
    loader: "default",
    formats: ["image/avif", "image/webp"],
    remotePatterns: [
      {
        hostname: "localhost",
        port: "3030",
        protocol: "http"
      },
      { hostname: "images.unsplash.com", protocol: "https" },
      { hostname: "tailwindui.com", protocol: "https" }
    ]
  },
  productionBrowserSourceMaps: true
} satisfies NextConfig;

```


**Related Resources:**
  - Raw file URL: https://raw.githubusercontent.com/DopamineDriven/t3-chat-clone/refs/heads/main/turborepo/apps/web/next.config.ts


---


**File:** `package.json`

For more details, [visit the raw version of this file](https://raw.githubusercontent.com/DopamineDriven/t3-chat-clone/refs/heads/main/turborepo/apps/web/package.json).

```json

{
  "name": "@t3-chat-clone/web",
  "private": true,
  "version": "1.0.0",
  "type": "module",
  "license": "MIT",
  "prettier": "@t3-chat-clone/prettier-config",
  "scripts": {
    "dev": "next dev -p 3030 --turbo",
    "build": "next build",
    "format": "prettier --write \"**/*.{ts,tsx,cts,mts,js,jsx,mjs,cjs,json,yaml,yml,css,html,md,mdx,graphql,gql}\" --ignore-unknown --cache",
    "start": "next start",
    "lint": "eslint",
    "postinstall": "prisma generate",
    "migrate:dev": "dotenv -- pnpm migrate:dev:workup",
    "migrate:dev:workup": "DATABASE_URL=$DATABASE_URL_UNPOOLED prisma migrate dev",
    "migrate:deploy": "dotenv -- pnpm migrate:deploy:workup",
    "migrate:deploy:workup": "DATABASE_URL=$DATABASE_URL_UNPOOLED prisma migrate deploy",
    "prisma:studio": "prisma studio --browser none --port 7777",
    "db:push": "dotenv -- pnpm db:push:workup",
    "db:push:workup": "DATABASE_URL=$DATABASE_URL_UNPOOLED prisma db push"
  },
  "dependencies": {
    "@auth/prisma-adapter": "^2.9.1",
    "@radix-ui/react-slot": "^1.2.3",
    "@t3-chat-clone/ui": "workspace:*",
    "clsx": "^2.1.1",
    "lucide-react": "^0.514.0",
    "motion": "^12.17.0",
    "motion-plus": "^1.2.0",
    "next": "^15.3.3",
    "next-auth": "^5.0.0-beta.28",
    "next-themes": "^0.4.6",
    "@prisma/client": "^6.9.0",
    "react": "^19.1.0",
    "react-dom": "^19.1.0",
    "tailwind-merge": "^3.3.1",
    "tw-animate-css": "^1.3.4"
  },
  "devDependencies": {
    "@playwright/test": "^1.53.0",
    "@t3-chat-clone/eslint-config": "workspace:*",
    "@t3-chat-clone/prettier-config": "workspace:*",
    "@t3-chat-clone/tsconfig": "workspace:*",
    "@tailwindcss/forms": "^0.5.10",
    "@tailwindcss/postcss": "^4.1.10",
    "@types/gtag.js": "^0.0.20",
    "@types/node": "^24.0.1",
    "@types/react": "^19.1.8",
    "@types/react-dom": "^19.1.6",
    "@vercel/analytics": "^1.5.0",
    "@vercel/functions": "^2.1.0",
    "autoprefixer": "^10.4.21",
    "dotenv": "^16.5.0",
    "dotenv-cli": "^8.0.0",
    "dotenv-expand": "^12.0.2",
    "eslint": "^9.28.0",
    "eslint-config-next": "^15.3.3",
    "motion-dom": "^12.17.0",
    "postcss": "^8.5.5",
    "prettier": "^3.5.3",
    "prisma": "^6.9.0",
    "sharp": "^0.34.2",
    "tailwindcss": "^4.1.10",
    "tailwindcss-motion": "^1.1.1",
    "tslib": "^2.8.1",
    "tsx": "^4.20.1",
    "typescript": "^5.8.3",
    "urlpattern-polyfill": "^10.1.0",
    "webpack": "^5.99.9"
  }
}


```


**Related Resources:**
  - Raw file URL: https://raw.githubusercontent.com/DopamineDriven/t3-chat-clone/refs/heads/main/turborepo/apps/web/package.json


---


**File:** `postcss.config.mjs`

For more details, [visit the raw version of this file](https://raw.githubusercontent.com/DopamineDriven/t3-chat-clone/refs/heads/main/turborepo/apps/web/postcss.config.mjs).

```mjs

/** @type {import('postcss-load-config').Config} */
export default {
  plugins: {
    "@tailwindcss/postcss": {}
  }
};

```


**Related Resources:**
  - Raw file URL: https://raw.githubusercontent.com/DopamineDriven/t3-chat-clone/refs/heads/main/turborepo/apps/web/postcss.config.mjs


---


**File:** `tailwind.config.ts`

For more details, [visit the raw version of this file](https://raw.githubusercontent.com/DopamineDriven/t3-chat-clone/refs/heads/main/turborepo/apps/web/tailwind.config.ts).

```ts

import type { Config as TailwindConfig } from "tailwindcss";

export default {
  content: ["src/**/*.{js,ts,jsx,tsx}"],
  future: { hoverOnlyWhenSupported: true },
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px"
      }
    }
  }
} satisfies TailwindConfig;

```


**Related Resources:**
  - Raw file URL: https://raw.githubusercontent.com/DopamineDriven/t3-chat-clone/refs/heads/main/turborepo/apps/web/tailwind.config.ts


---


**File:** `tsconfig.json`

For more details, [visit the raw version of this file](https://raw.githubusercontent.com/DopamineDriven/t3-chat-clone/refs/heads/main/turborepo/apps/web/tsconfig.json).

```json

{
  "extends": "@t3-chat-clone/tsconfig/next.json",
  "compilerOptions": {
    "baseUrl": "./",
    "paths": {
      "@/*": ["./src/*"]
    },
    "plugins": [
      {
        "name": "next"
      }
    ],
    "tsBuildInfoFile": "node_modules/.cache/tsbuildinfo.json"
  },
  "include": [
    ".",
    "next-env.d.ts",
    "next.config.ts",
    "postcss.config.mjs",
    "tailwind.config.ts",
    "src/**/*.tsx",
    "src/**/*.ts",
    ".next/types/**/*.ts"
  ],
  "exclude": ["node_modules", "public/**/*.js"]
}

```


**Related Resources:**
  - Raw file URL: https://raw.githubusercontent.com/DopamineDriven/t3-chat-clone/refs/heads/main/turborepo/apps/web/tsconfig.json


---


**File:** `turbo.json`

For more details, [visit the raw version of this file](https://raw.githubusercontent.com/DopamineDriven/t3-chat-clone/refs/heads/main/turborepo/apps/web/turbo.json).

```json

{
  "$schema": "https://turborepo.org/schema.json",
  "extends": ["//"],
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": [".next/**", "!.next/cache/**", "next-env.d.ts"]
    },
    "dev": {
      "persistent": true
    }
  }
}

```


**Related Resources:**
  - Raw file URL: https://raw.githubusercontent.com/DopamineDriven/t3-chat-clone/refs/heads/main/turborepo/apps/web/turbo.json


---


**File:** `prisma/schema.prisma`

For more details, [visit the raw version of this file](https://raw.githubusercontent.com/DopamineDriven/t3-chat-clone/refs/heads/main/turborepo/apps/web/prisma/schema.prisma).

```prisma

generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model User {
  id            String         @id @default(uuid())
  name          String?
  email         String?        @unique
  emailVerified DateTime?
  image         String? // avatar URL
  profile       Profile?
  accounts      Account[]
  sessions      Session[]
  keys          UserKey[]
  conversations Conversation[]
  settings      Settings?
  createdAt     DateTime       @default(now())
  updatedAt     DateTime       @updatedAt
}

model Profile {
  id       String  @id @default(uuid())
  bio      String?
  location String?
  user     User    @relation(fields: [userId], references: [id])
  userId   String  @unique
}

model Account {
  id                String  @id @default(uuid())
  userId            String
  type              String
  provider          String
  providerAccountId String
  refresh_token     String?
  access_token      String?
  expires_at        Int?
  token_type        String?
  scope             String?
  id_token          String?
  session_state     String?
  user              User    @relation(fields: [userId], references: [id])

  @@unique([provider, providerAccountId])
}

model Session {
  id           String   @id @default(uuid())
  sessionToken String   @unique
  userId       String
  user         User     @relation(fields: [userId], references: [id])
  expires      DateTime
}

model UserKey {
  id        String   @id @default(uuid())
  userId    String
  provider  String // e.g. 'openai', 'anthropic', etc
  apiKey    String // encrypted or hashed if possible
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  user      User     @relation(fields: [userId], references: [id])
}

model Settings {
  id     String  @id @default(uuid())
  userId String  @unique
  user   User    @relation(fields: [userId], references: [id])
  theme  String? // dark/light, etc
  // Add more user preferences as needed
}

model AiAgent {
  id            String         @id @default(uuid())
  provider      String // e.g. 'openai', 'anthropic', etc
  model         String // e.g. 'gpt-4', 'claude-3'
  displayName   String?
  description   String?
  messages      Message[]      @relation("AgentMessages")
  conversations Conversation[] @relation("AgentConversations")
}

model Conversation {
  id          String       @id @default(uuid())
  userId      String
  user        User         @relation(fields: [userId], references: [id])
  title       String?
  createdAt   DateTime     @default(now())
  updatedAt   DateTime     @updatedAt
  messages    Message[]
  aiAgentId   String?
  aiAgent     AiAgent?     @relation("AgentConversations", fields: [aiAgentId], references: [id])
  branchId    String? // For branching conversations
  parentId    String? // For chat branching
  attachments Attachment[]
  isShared    Boolean      @default(false)
  shareToken  String?      @unique
}

model Message {
  id             String       @id @default(uuid())
  conversationId String
  senderId       String? // User or AI Agent (if user, references User)
  senderType     String // "user" | "ai" | "system"
  content        String
  createdAt      DateTime     @default(now())
  updatedAt      DateTime     @updatedAt
  aiAgentId      String?
  attachments    Attachment[]
  conversation   Conversation @relation(fields: [conversationId], references: [id])
  aiAgent        AiAgent?     @relation("AgentMessages", fields: [aiAgentId], references: [id])
}

model Attachment {
  id             String        @id @default(uuid())
  messageId      String
  url            String
  type           String // e.g., "image", "pdf"
  createdAt      DateTime      @default(now())
  conversationId String? // <-- add this
  conversation   Conversation? @relation(fields: [conversationId], references: [id])
  message        Message       @relation(fields: [messageId], references: [id])
}


```


**Related Resources:**
  - Raw file URL: https://raw.githubusercontent.com/DopamineDriven/t3-chat-clone/refs/heads/main/turborepo/apps/web/prisma/schema.prisma


---


**File:** `prisma/migrations/migration_lock.toml`

For more details, [visit the raw version of this file](https://raw.githubusercontent.com/DopamineDriven/t3-chat-clone/refs/heads/main/turborepo/apps/web/prisma/migrations/migration_lock.toml).

```toml

# Please do not edit this file manually
# It should be added in your version-control system (e.g., Git)
provider = "postgresql"


```


**Related Resources:**
  - Raw file URL: https://raw.githubusercontent.com/DopamineDriven/t3-chat-clone/refs/heads/main/turborepo/apps/web/prisma/migrations/migration_lock.toml


---


**File:** `src/app/global-error.tsx`

For more details, [visit the raw version of this file](https://raw.githubusercontent.com/DopamineDriven/t3-chat-clone/refs/heads/main/turborepo/apps/web/src/app/global-error.tsx).

```tsx

"use client";

export default function GlobalError({
  error,
  reset
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    // global-error must include html and body tags
    <html>
      <body>
        <h2>Something went wrong!</h2>
        <button onClick={() => reset()}>Try again</button>
        <details className="[&_details[open]]:p-2 [&_details[open]_summary]:mb-2 [&_details[open]_summary]:border-b [&_details[open]_summary]:border-solid [&_details[open]_summary]:border-[#aaa]">
          <summary className="mx-0 -my-2 p-2 font-sans">Details</summary>
          <pre>{JSON.stringify(error, null, 2)}</pre>
        </details>
      </body>
    </html>
  );
}


```


**Related Resources:**
  - Raw file URL: https://raw.githubusercontent.com/DopamineDriven/t3-chat-clone/refs/heads/main/turborepo/apps/web/src/app/global-error.tsx


---


**File:** `src/app/globals.css`

For more details, [visit the raw version of this file](https://raw.githubusercontent.com/DopamineDriven/t3-chat-clone/refs/heads/main/turborepo/apps/web/src/app/globals.css).

```css

@import "tailwindcss";
@import "tw-animate-css";

@config "../../tailwind.config.ts";
@plugin "tailwindcss-motion";

/*
  https://tailwindcss.com/docs/dark-mode#toggling-dark-mode-manually

  Uncomment the following to use a CSS Selector instead of the `prefers-color-scheme` media-query

  @custom-variant dark (&:where(.dark, .dark *));
*/

/*
  https://tailwindcss.com/docs/dark-mode#using-a-data-attribute

  Using a data-attribute instead of a dark theme selector

*/
@custom-variant dark (&:where([data-theme=dark], [data-theme=dark] *));

@font-face {
  font-family: "CalSans";
  src: url("/fonts/CalSans-SemiBold.woff2") format("woff2");
  font-weight: 600;
  font-style: normal;
  font-display: swap;
}

@font-face {
  font-family: "CalSans";
  src: url("/fonts/CalSans-Regular.woff2") format("woff2");
  font-weight: 400;
  font-style: normal;
  font-display: swap;
}

@theme {
  --font-cal-sans: CalSans, sans-serif;
  --font-inter: var(--font-inter);
  --color-background: oklch(1 0 0);
  --color-foreground: oklch(0.14 0.0044 285.82);
  --color-card: oklch(1 0 0);
  --color-card-foreground: oklch(0.14 0.0044 285.82);
  --color-popover: oklch(1 0 0);
  --color-popover-foreground: oklch(0.14 0.0044 285.82);
  --color-primary: oklch(0.21 0.0059 285.88);
  --color-primary-foreground: oklch(0.98 0 0);
  --color-secondary: oklch(0.97 0.0013 286.38);
  --color-secondary-foreground: oklch(0.21 0.0059 285.88);
  --color-muted: oklch(0.97 0.0013 286.38);
  --color-muted-foreground: oklch(0.55 0.0137 285.94);
  --color-accent: oklch(0.97 0.0013 286.38);
  --color-accent-foreground: oklch(0.21 0.0059 285.88);
  --color-destructive: oklch(0.64 0.2078 25.33);
  --color-destructive-foreground: oklch(0.98 0 0);
  --color-border: oklch(0.92 0.004 286.32);
  --color-input: oklch(0.92 0.004 286.32);
  --color-ring: oklch(0.21 0.0059 285.88);
  --color-chart-1: oklch(0.546 0.2153 262.87);
  --color-chart-2: oklch(0.5409 0.2468 292.95);
  --color-chart-3: oklch(0.6624 0.2895 320.92);
  --color-chart-4: oklch(0.6924 0.1426 165.69);
  --color-chart-5: oklch(0.8372 0.1644 84.53);
  --color-hue-0: oklch(0.9434 0.199 105.96);
  --color-hue-1: oklch(0.6477 0.263 359.98);
  --color-hue-2: oklch(0.6404 0.300 324.36);
  --color-hue-3: oklch(0.5636 0.292 301.63);
  --color-hue-4: oklch(0.5898 0.211 259.36);
  --color-hue-5: oklch(0.8203 0.141 210.49);
  --color-hue-6: oklch(0.8842 0.107 168.47);

  --radius-sm: 0.25rem;

  --container-8xl: 96rem;
  --container-9xl: 120rem;
  --container-10xl: 173.75rem;

  --spacing-8xl: 96rem;
  --spacing-9xl: 120rem;
  --spacing-10xl: 173.75rem;

  --perspective-1000: 1000px;

  --text-sxs: 0.625rem;
  --text-sxs--line-height: calc(0.875 / 0.625);
  --text-xxs: 0.5rem;
  --text-xxs--line-height: calc(0.75 / 0.5);

  --animate-shimmer: shimmer 3s cubic-bezier(0.4, 0.7, 0.6, 1) infinite;
  @keyframes shimmer {
    0% {
      opacity: 0.5;
    } /* Start with a semi-transparent state */
    50% {
      opacity: 1;
    } /* Become fully visible */
    100% {
      opacity: 0.5;
    } /* Return to semi-transparent */
  }

  --animate-twinkle: twinkle 5s infinite;
  @keyframes twinkle {
    0%,
    100% {
      opacity: 1;
    }
    50% {
      opacity: 0.2;
    }
  }
}

@layer theme {
  .dark {
    --color-background: oklch(0.14 0.0044 285.82);
    --color-foreground: oklch(0.98 0 0);
    --color-card: oklch(0.14 0.0044 285.82);
    --color-card-foreground: oklch(0.98 0 0);
    --color-popover: oklch(0.14 0.0044 285.82);
    --color-popover-foreground: oklch(0.98 0 0);
    --color-primary: oklch(0.98 0 0);
    --color-primary-foreground: oklch(0.21 0.0059 285.88);
    --color-secondary: oklch(0.27 0.0055 286.03);
    --color-secondary-foreground: oklch(0.98 0 0);
    --color-muted: oklch(0.27 0.0055 286.03);
    --color-muted-foreground: oklch(0.71 0.0129 286.07);
    --color-accent: oklch(0.27 0.0055 286.03);
    --color-accent-foreground: oklch(0.98 0 0);
    --color-destructive: oklch(0.4 0.1331 25.72);
    --color-destructive-foreground: oklch(0.98 0 0);
    --color-border: oklch(0.27 0.0055 286.03);
    --color-input: oklch(0.27 0.0055 286.03);
    --color-ring: oklch(0.87 0.0055 286.29);
    --color-chart-1: oklch(0.546 0.2153 262.87);
    --color-chart-2: oklch(0.5409 0.2468 292.95);
    --color-chart-3: oklch(0.6624 0.2895 320.92);
    --color-chart-4: oklch(0.6924 0.1426 165.69);
    --color-chart-5: oklch(0.8372 0.1644 84.53);
    --color-hue-0: oklch(0.9434 0.199 105.96);
    --color-hue-1: oklch(0.6477 0.263 359.98);
    --color-hue-2: oklch(0.6404 0.300 324.36);
    --color-hue-3: oklch(0.5636 0.292 301.63);
    --color-hue-4: oklch(0.5898 0.211 259.36);
    --color-hue-5: oklch(0.8203 0.141 210.49);
    --color-hue-6: oklch(0.8842 0.107 168.47);
  }
}


/*
  The default border color has changed to `currentColor` in Tailwind CSS v4,
  so we've added these compatibility styles to make sure everything still
  looks the same as it did with Tailwind CSS v3.

  If we ever want to remove these styles, we need to add an explicit border
  color utility to any element that depends on these defaults.
*/

:root {
  --radius: 0.5rem;
}

@layer base {
  *,
  ::after,
  ::before,
  ::backdrop,
  ::file-selector-button {
    border-color: var(--color-gray-200, currentColor);
  }
  * {
    border-color: var(--color-border);
  }
  body {
    background-color: var(--color-background);
    color: var(--color-foreground);
  }
}

@supports not (backdrop-filter: blur(4px)) {
  .backdrop-blur-sm {
    background-color: color-mix(
      in oklab,
      var(--color-background) 90%,
      transparent
    );
  }
}

@media (prefers-reduced-motion: no-preference) {
  html {
    scroll-behavior: smooth;
  }
}

@layer components {
  .container {
    margin-inline: auto;
    @apply [padding-inline:1rem] sm:[padding-inline:2rem] lg:[padding-inline:3rem];
  }
}

*,
*::before,
*::after {
  box-sizing: border-box;
}

input,
button,
textarea,
select {
  font: inherit;
}

body {
  overflow-x: hidden;
}


```


**Related Resources:**
  - Raw file URL: https://raw.githubusercontent.com/DopamineDriven/t3-chat-clone/refs/heads/main/turborepo/apps/web/src/app/globals.css


---


**File:** `src/app/layout.tsx`

For more details, [visit the raw version of this file](https://raw.githubusercontent.com/DopamineDriven/t3-chat-clone/refs/heads/main/turborepo/apps/web/src/app/layout.tsx).

```tsx

import type { Metadata, Viewport } from "next";
import React from "react";
import { Inter } from "next/font/google";
import { ThemeProvider } from "next-themes";
import { cn } from "@/lib/utils";
import { PageLayout } from "@/ui/page-layout";
import "./globals.css";
import "@t3-chat-clone/ui/globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin", "latin-ext"]
});

export const viewport = {
  colorScheme: "normal",
  userScalable: true,
  themeColor: "#ffffff",
  viewportFit: "auto",
  initialScale: 1,
  maximumScale: 1,
  width: "device-width"
} satisfies Viewport;

export const metadata = {
  /* populate relevant values in src/lib/site-url.ts and uncomment for url injetion */
  // metadataBase: new URL(getSiteUrl(process.env.NODE_ENV)),
  title: {
    default: "@t3-chat-clone/web",
    template: "%s | @t3-chat-clone/web"
  },
  description: "@t3-chat-clone/web scaffolded by @d0paminedriven/turbogen"
} satisfies Metadata;

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html suppressHydrationWarning lang="en">
      <head>
        <script
          async={true}
          id="prevent-flash-of-wrong-theme"
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                try {
                  const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
                  if (prefersDark) {
                    document.documentElement.classList.add('dark');
                  }
                } catch (e) {}
              })();
            `
          }}
        />
      </head>
      <body
        className={cn(
          "bg-background font-cal-sans min-h-screen antialiased",
          inter.variable
        )}>
        <ThemeProvider attribute={"class"} defaultTheme="system" enableSystem>
          <PageLayout>{children}</PageLayout>
        </ThemeProvider>
      </body>
    </html>
  );
}


```


**Related Resources:**
  - Raw file URL: https://raw.githubusercontent.com/DopamineDriven/t3-chat-clone/refs/heads/main/turborepo/apps/web/src/app/layout.tsx


---


**File:** `src/app/page.tsx`

For more details, [visit the raw version of this file](https://raw.githubusercontent.com/DopamineDriven/t3-chat-clone/refs/heads/main/turborepo/apps/web/src/app/page.tsx).

```tsx

import { Suspense } from "react";
import { LandingPage } from "@/ui/home";

export default function HomePage() {
  return (
    <Suspense fallback={"Loading..."}>
      <LandingPage />
    </Suspense>
  );
}

```


**Related Resources:**
  - Raw file URL: https://raw.githubusercontent.com/DopamineDriven/t3-chat-clone/refs/heads/main/turborepo/apps/web/src/app/page.tsx


---


**File:** `src/hooks/use-chat-ws.ts`

For more details, [visit the raw version of this file](https://raw.githubusercontent.com/DopamineDriven/t3-chat-clone/refs/heads/main/turborepo/apps/web/src/hooks/use-chat-ws.ts).

```ts

"use client";
import { useEffect, useRef, useState, useCallback } from "react";
import type { ChatWsEvent } from "@/types/chat-ws";
import { ChatWebSocketClient } from "@/utils/chat-ws-client";

export function useChatWebSocket(wsUrl: string) {
  const [lastEvent, setLastEvent] = useState<ChatWsEvent | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  const clientRef = useRef<ChatWebSocketClient | null>(new ChatWebSocketClient(wsUrl));

  useEffect(() => {
    const client = clientRef.current;
    if (!client) return;
    client.connect();

    const handleEvent = (data: ChatWsEvent) => setLastEvent(data);
    client.addListener(handleEvent);

    const interval = setInterval(() => setIsConnected(client.isConnected), 300);

    return () => {
      clearInterval(interval);
      client.removeListener(handleEvent);
      client.close();
    };
  }, [wsUrl]);

  const sendEvent = useCallback((event: ChatWsEvent) => {
    clientRef.current?.send(event);
  }, []);

  return { lastEvent, sendEvent, isConnected, client: clientRef.current };
}


```


**Related Resources:**
  - Raw file URL: https://raw.githubusercontent.com/DopamineDriven/t3-chat-clone/refs/heads/main/turborepo/apps/web/src/hooks/use-chat-ws.ts


---


**File:** `src/lib/auth.config.ts`

For more details, [visit the raw version of this file](https://raw.githubusercontent.com/DopamineDriven/t3-chat-clone/refs/heads/main/turborepo/apps/web/src/lib/auth.config.ts).

```ts

import type { NextAuthConfig } from "next-auth";
import type { GitHubProfile } from "next-auth/providers/github";
import type { GoogleProfile } from "next-auth/providers/google";
import { PrismaAdapter } from "@auth/prisma-adapter";
import NextAuth from "next-auth";
import GitHub from "next-auth/providers/github";
import Google from "next-auth/providers/google";
import prismaClient from "@/lib/prisma";

export const {
  handlers: { GET, POST }
} = NextAuth({
  adapter: PrismaAdapter(prismaClient),
  providers: [
    Google<GoogleProfile>({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      authorization: {params: {access_type: "offline", prompt: "consent"}}
    }),
    GitHub({
      clientId: process.env.GITHUB_CLIENT_ID,
      clientSecret: process.env.GITHUB_CLIENT_SECRET
    })
  ]
});


```


**Related Resources:**
  - Raw file URL: https://raw.githubusercontent.com/DopamineDriven/t3-chat-clone/refs/heads/main/turborepo/apps/web/src/lib/auth.config.ts


---


**File:** `src/lib/auth.ts`

For more details, [visit the raw version of this file](https://raw.githubusercontent.com/DopamineDriven/t3-chat-clone/refs/heads/main/turborepo/apps/web/src/lib/auth.ts).

```ts

// pages/api/auth/[...nextauth].ts
import type { JWT as NextAuthJWT } from "next-auth/jwt";
import type { GoogleProfile } from "next-auth/providers/google";
import NextAuth from "next-auth";
import GoogleProvider from "next-auth/providers/google";

export default NextAuth({
  providers: [
    GoogleProvider<GoogleProfile>({
      clientId: process.env.AUTH_GOOGLE_ID,
      clientSecret: process.env.AUTH_GOOGLE_SECRET,
      authorization: {
        params: { access_type: "offline", prompt: "consent" }
      }
    })
  ],
  session: {
    strategy: "jwt"
  },
  secret: process.env.AUTH_SECRET,
  callbacks: {
    async jwt({ token, account, session, trigger }) {
      // First sign-in: persist tokens in the JWT
      if (account) {
        return {
          ...token,
          access_token: account.access_token,
          expires_at: account.expires_at ?? new Date(Date.now()).getTime(),
          refresh_token: account.refresh_token
        };
      }
      // If token still valid, just return it
      if (Date.now() < (token as NextAuthJWT).expires_at * 1000) {
        return token;
      }
      // Otherwise, refresh it
      if (!token.refresh_token) {
        throw new Error("Missing refresh token");
      }
      try {
        const resp = await fetch("https://oauth2.googleapis.com/token", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            client_id: process.env.AUTH_GOOGLE_ID ?? "",
            client_secret: process.env.AUTH_GOOGLE_SECRET ?? "",
            grant_type: "refresh_token",
            refresh_token: token.refresh_token
          })
        });
        const data = await resp.json() as {
            access_token: string
            expires_in: number
            refresh_token?: string
          }
        if (!resp.ok) throw new Error("");
        return {
          ...token,
          session,
          access_token: data.access_token,
          expires_at: Math.floor(Date.now() / 1000 + data.expires_in),
          // if Google only issues refresh once, preserve old token
          refresh_token: data.refresh_token ?? token.refresh_token
        };
      } catch (err) {
        console.error("RefreshTokenError", err);
        return { ...token, error: "RefreshTokenError", session, access_token: token.access_token, refresh_token: token.refresh_token, exp: token.exp, expires_at: token.expires_at };
      }
    },
    async session({ session, token }) {
      // Expose any error and fresh access token in session
      session.error = token.error;
      return {
        ...session,
        accessToken: token.access_token
      };
    }
  }
});
declare module "next-auth" {
  interface Session {
    error?: "RefreshTokenError";
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    access_token: string;
    expires_at: number;
    refresh_token?: string;
    error?: "RefreshTokenError";
  }
}


```


**Related Resources:**
  - Raw file URL: https://raw.githubusercontent.com/DopamineDriven/t3-chat-clone/refs/heads/main/turborepo/apps/web/src/lib/auth.ts


---


**File:** `src/lib/base64.ts`

For more details, [visit the raw version of this file](https://raw.githubusercontent.com/DopamineDriven/t3-chat-clone/refs/heads/main/turborepo/apps/web/src/lib/base64.ts).

```ts

export function toBase64<const T extends string>(str: T) {
  return typeof window === "undefined"
    ? Buffer.from(str, "utf-8").toString("base64")
    : window.btoa(str);
}

export function fromBase64<const T extends string>(str: T) {
  typeof window === "undefined"
    ? Buffer.from(str, "base64").toString("utf-8")
    : window.atob(str);
}


```


**Related Resources:**
  - Raw file URL: https://raw.githubusercontent.com/DopamineDriven/t3-chat-clone/refs/heads/main/turborepo/apps/web/src/lib/base64.ts


---


**File:** `src/lib/prisma.ts`

For more details, [visit the raw version of this file](https://raw.githubusercontent.com/DopamineDriven/t3-chat-clone/refs/heads/main/turborepo/apps/web/src/lib/prisma.ts).

```ts

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient({ log: ["query", "info", "warn", "error"] });

declare global {
  // eslint-disable-next-line no-var
  var prismaClient: typeof prisma;
}

if (process.env.NODE_ENV !== "production") global.prismaClient = prisma;

export default prisma;


```


**Related Resources:**
  - Raw file URL: https://raw.githubusercontent.com/DopamineDriven/t3-chat-clone/refs/heads/main/turborepo/apps/web/src/lib/prisma.ts


---


**File:** `src/lib/safe-number.ts`

For more details, [visit the raw version of this file](https://raw.githubusercontent.com/DopamineDriven/t3-chat-clone/refs/heads/main/turborepo/apps/web/src/lib/safe-number.ts).

```ts

export function isDecimal<const T extends number | `${number}`>(s: T) {
  if (typeof s === "number") {
    return /./.test(s.toString(10));
  } else return /./.test(s);
}

export function toN<const V extends number | `${number}`>(s: V) {
  return typeof s === "string"
    ? isDecimal(s) === true
      ? Number.parseFloat(s)
      : Number.parseInt(s, 10)
    : s;
}


```


**Related Resources:**
  - Raw file URL: https://raw.githubusercontent.com/DopamineDriven/t3-chat-clone/refs/heads/main/turborepo/apps/web/src/lib/safe-number.ts


---


**File:** `src/lib/shimmer.ts`

For more details, [visit the raw version of this file](https://raw.githubusercontent.com/DopamineDriven/t3-chat-clone/refs/heads/main/turborepo/apps/web/src/lib/shimmer.ts).

```ts

import { toBase64 } from "@/lib/base64";
import { toN as n } from "@/lib/safe-number";

export type SafeNumber = `${number}` | number;

export function shimmerScaffold<
  const W extends SafeNumber,
  const H extends SafeNumber
>({ w, h }: { w: W; h: H }) {
  // prettier-ignore
  return `<svg width="${n(w)}" height="${n(h)}" version="1.1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">
  <defs>
    <linearGradient id="g">
      <stop stop-color="#333" offset="20%" />
      <stop stop-color="#222" offset="50%" />
      <stop stop-color="#333" offset="70%" />
    </linearGradient>
  </defs>
  <rect width="${n(w)}" height="${n(h)}" fill="#333" />
  <rect id="r" width="${n(w)}" height="${n(h)}" fill="url(#g)" />
  <animate xlink:href="#r" attributeName="x" from="-${n(w)}" to="${n(w)}" dur="1s" repeatCount="indefinite"  />
</svg>`;
}

/**
 * use in the "blurDataUrl" property of the Nextjs Image component and set the "placeholder" property to "blur"
 */
export function shimmer<
  const W extends SafeNumber,
  const H extends SafeNumber
>([w, h]: [W, H]) {
  return `data:image/svg+xml;base64,${toBase64(shimmerScaffold({ w, h }))}` as const;
}


```


**Related Resources:**
  - Raw file URL: https://raw.githubusercontent.com/DopamineDriven/t3-chat-clone/refs/heads/main/turborepo/apps/web/src/lib/shimmer.ts


---


**File:** `src/lib/site-url.ts`

For more details, [visit the raw version of this file](https://raw.githubusercontent.com/DopamineDriven/t3-chat-clone/refs/heads/main/turborepo/apps/web/src/lib/site-url.ts).

```ts

export const getProductionUrl = "https://prod-placeholder.com" as const;

export const getPreviewUrl = "https://preview-placeholder.vercel.app" as const;

export const getLocalUrl = "http://localhost:3030" as const;

export const envMediatedBaseUrl = (env: typeof process.env.NODE_ENV) =>
  process.env.VERCEL_ENV === "development" ||
  process.env.VERCEL_ENV === "preview"
    ? getPreviewUrl
    : env === "development"
      ? getLocalUrl
      : env === "production" || process.env.VERCEL_ENV === "production"
        ? getProductionUrl
        : env === "test"
          ? getLocalUrl
          : getPreviewUrl;

export const getSiteUrl = (
  env: "development" | "production" | "test" | undefined
) =>
  process.env.VERCEL_ENV === "development"
    ? getPreviewUrl
    : !env || env === "development"
      ? getLocalUrl
      : process.env.VERCEL_ENV
        ? process.env.VERCEL_ENV === "preview"
          ? getPreviewUrl
          : getProductionUrl
        : getPreviewUrl;

```


**Related Resources:**
  - Raw file URL: https://raw.githubusercontent.com/DopamineDriven/t3-chat-clone/refs/heads/main/turborepo/apps/web/src/lib/site-url.ts


---


**File:** `src/lib/strip-undefined.ts`

For more details, [visit the raw version of this file](https://raw.githubusercontent.com/DopamineDriven/t3-chat-clone/refs/heads/main/turborepo/apps/web/src/lib/strip-undefined.ts).

```ts

/** @see https://www.prisma.io/docs/orm/prisma-client/special-fields-and-types/null-and-undefined */
export function stripUndefined<const T>(obj: T) {
  const data = {} as T;
  for (const key in obj) if (obj[key] !== undefined) data[key] = obj[key];
  return { data };
}


```


**Related Resources:**
  - Raw file URL: https://raw.githubusercontent.com/DopamineDriven/t3-chat-clone/refs/heads/main/turborepo/apps/web/src/lib/strip-undefined.ts


---


**File:** `src/lib/utils.ts`

For more details, [visit the raw version of this file](https://raw.githubusercontent.com/DopamineDriven/t3-chat-clone/refs/heads/main/turborepo/apps/web/src/lib/utils.ts).

```ts

import type { ClassValue } from "clsx";
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}


```


**Related Resources:**
  - Raw file URL: https://raw.githubusercontent.com/DopamineDriven/t3-chat-clone/refs/heads/main/turborepo/apps/web/src/lib/utils.ts


---


**File:** `src/orm/account.ts`

For more details, [visit the raw version of this file](https://raw.githubusercontent.com/DopamineDriven/t3-chat-clone/refs/heads/main/turborepo/apps/web/src/orm/account.ts).

```ts

import { default as prisma } from "@/lib/prisma";
import { errHelper } from "@/orm/err-helper";

export const getAccountByUserId = async (userId: string) => {
  try {
    const account = await prisma.account.findFirst({
      where: { userId }
    });
    return account;
  } catch (err) {
    errHelper(err, "info");
    return null;
  }
};


```


**Related Resources:**
  - Raw file URL: https://raw.githubusercontent.com/DopamineDriven/t3-chat-clone/refs/heads/main/turborepo/apps/web/src/orm/account.ts


---


**File:** `src/orm/err-helper.ts`

For more details, [visit the raw version of this file](https://raw.githubusercontent.com/DopamineDriven/t3-chat-clone/refs/heads/main/turborepo/apps/web/src/orm/err-helper.ts).

```ts

export const errHelper = <
  const L extends
    | "debug"
    | "group"
    | "error"
    | "info"
    | "log"
    | "table"
    | "warn"
>(
  err: unknown,
  target?: L
) => {
  if (!target) {
    return console.info(
      err instanceof Error ? err.message : JSON.stringify(err, null, 2)
    );
  } else
    return console[target](
      err instanceof Error ? err.message : JSON.stringify(err, null, 2)
    );
};


```


**Related Resources:**
  - Raw file URL: https://raw.githubusercontent.com/DopamineDriven/t3-chat-clone/refs/heads/main/turborepo/apps/web/src/orm/err-helper.ts


---


**File:** `src/orm/index.ts`

For more details, [visit the raw version of this file](https://raw.githubusercontent.com/DopamineDriven/t3-chat-clone/refs/heads/main/turborepo/apps/web/src/orm/index.ts).

```ts

export type Nullable<T> = T | null;

export interface UserDTO {
  id: string;
  name: Nullable<string>;
  email: Nullable<string>;
  emailVerified: Nullable<string>;
  image: Nullable<string>;
  createdAt: string;
  updatedAt: string;
}

export interface ProfileDTO {
  id: string;
  bio: Nullable<string>;
  location: Nullable<string>;
  userId: string;
}

export interface AccountDTO {
  id: string;
  userId: string;
  type: string;
  provider: string;
  providerAccountId: string;
  refresh_token: Nullable<string>;
  access_token: Nullable<string>;
  expires_at: Nullable<number>;
  token_type: Nullable<string>;
  scope: Nullable<string>;
  id_token: Nullable<string>;
  session_state: Nullable<string>;
}

export interface SessionDTO {
  id: string;
  sessionToken: string;
  userId: string;
  expires: string;
}

export interface UserKeyDTO {
  id: string;
  userId: string;
  provider: string;
  apiKey: string;
  createdAt: string;
  updatedAt: string;
}

export interface SettingsDTO {
  id: string;
  userId: string;
  theme: Nullable<string>;
}

export interface AiAgentDTO {
  id: string;
  provider: string;
  model: string;
  displayName: Nullable<string>;
  description: Nullable<string>;
}

export interface AttachmentDTO {
  id: string;
  messageId: string;
  conversationId: Nullable<string>;
  url: string;
  type: string;
  createdAt: string;
}

export interface MessageDTO {
  id: string;
  conversationId: string;
  senderId: Nullable<string>;
  senderType: "user" | "ai" | "system";
  content: string;
  createdAt: string;
  updatedAt: string;
  aiAgentId: Nullable<string>;
  attachments: AttachmentDTO[];
}

export interface ConversationDTO {
  id: string;
  userId: string;
  title: Nullable<string>;
  createdAt: string;
  updatedAt: string;
  aiAgentId: Nullable<string>;
  branchId: Nullable<string>;
  parentId: Nullable<string>;
  isShared: boolean;
  shareToken: Nullable<string>;
  messages: MessageDTO[];
  attachments: AttachmentDTO[];
}

declare module "next-auth" {
  interface DefaultUser {
    id?: string;
    name?: string | null;
    email?: string | null;
    image?: string | null;
    createdAt?: string;
    updatedAt?: string;
  }
}


```


**Related Resources:**
  - Raw file URL: https://raw.githubusercontent.com/DopamineDriven/t3-chat-clone/refs/heads/main/turborepo/apps/web/src/orm/index.ts


---


**File:** `src/orm/user.ts`

For more details, [visit the raw version of this file](https://raw.githubusercontent.com/DopamineDriven/t3-chat-clone/refs/heads/main/turborepo/apps/web/src/orm/user.ts).

```ts

import { default as prisma } from "@/lib/prisma";
import { errHelper } from "@/orm/err-helper";

export const getUser = async <
  const T extends "id" | "email",
  const V extends string
>(
  target: T,
  identifier: V
) => {
  try {
    if (target === "email") {
      return await prisma.user.findUnique({ where: { email: identifier } });
    } else {
      return await prisma.user.findUnique({ where: { id: identifier } });
    }
  } catch (err) {
    errHelper(err, "info");
    return null;
  }
};


```


**Related Resources:**
  - Raw file URL: https://raw.githubusercontent.com/DopamineDriven/t3-chat-clone/refs/heads/main/turborepo/apps/web/src/orm/user.ts


---


**File:** `src/types/chat-ws.ts`

For more details, [visit the raw version of this file](https://raw.githubusercontent.com/DopamineDriven/t3-chat-clone/refs/heads/main/turborepo/apps/web/src/types/chat-ws.ts).

```ts

export type ChatMessage = {
  type: "message";
  userId: string;
  conversationId: string;
  content: string;
  timestamp: number;
  attachments?: string[];
};

export type TypingIndicator = {
  type: "typing";
  userId: string;
  conversationId: string;
};

export type PingMessage = {
  type: "ping";
};

export type ImageGenRequest = {
  type: "image_gen_request";
  userId: string;
  conversationId: string;
  prompt: string;
  seed?: number;
};

export type ImageGenResponse = {
  type: "image_gen_response";
  userId: string;
  conversationId: string;
  imageUrl?: string;
  success: boolean;
  error?: string;
};

export type AssetUploadRequest = {
  type: "asset_upload_request";
  userId: string;
  conversationId: string;
  filename: string;
  contentType: string;
  base64: string;
};

export type AssetUploadResponse = {
  type: "asset_upload_response";
  userId: string;
  conversationId: string;
  url?: string;
  success: boolean;
  error?: string;
};

export type ChatWsEvent =
  | AssetUploadRequest
  | AssetUploadResponse
  | ChatMessage
  | TypingIndicator
  | PingMessage
  | ImageGenRequest
  | ImageGenResponse;

export type ChatWsEventTypeUnion = ChatWsEvent["type"];

export type EventTypeMap = {
  asset_upload_request: AssetUploadRequest;
  asset_upload_response: AssetUploadResponse;
  message: ChatMessage;
  typing: TypingIndicator;
  ping: PingMessage;
  image_gen_request: ImageGenRequest;
  image_gen_response: ImageGenResponse;
};


```


**Related Resources:**
  - Raw file URL: https://raw.githubusercontent.com/DopamineDriven/t3-chat-clone/refs/heads/main/turborepo/apps/web/src/types/chat-ws.ts


---


**File:** `src/types/helpers.ts`

For more details, [visit the raw version of this file](https://raw.githubusercontent.com/DopamineDriven/t3-chat-clone/refs/heads/main/turborepo/apps/web/src/types/helpers.ts).

```ts

/* General Helper Types BEGIN */

export type Unenumerate<T> = T extends readonly (infer U)[] | (infer U)[]
  ? U
  : T;

export type UnwrapPromise<T> = T extends Promise<infer U> | PromiseLike<infer U>
  ? U
  : T;

export type RemoveFields<T, P extends keyof T = keyof T> = {
  [S in keyof T as Exclude<S, P>]: T[S];
};

export type ConditionalToRequired<
  T,
  Z extends keyof T = keyof T
> = RemoveFields<T, Z> & { [Q in Z]-?: T[Q] };

export type RequiredToConditional<
  T,
  X extends keyof T = keyof T
> = RemoveFields<T, X> & { [Q in X]?: T[Q] };

export type FieldToConditionallyNever<
  T,
  X extends keyof T = keyof T
> = RemoveFields<T, X> & { [Q in X]?: XOR<T[Q], never> };

export type ExcludeFieldEnumerable<T, K extends keyof T> = RemoveFields<T, K>;

export type Without<T, U> = { [P in Exclude<keyof T, keyof U>]?: never };

export type XOR<T, U> = T | U extends object
  ? (Without<T, U> & U) | (Without<U, T> & T)
  : T | U;

export type IsOptional<T, K extends keyof T> = undefined extends T[K]
  ? object extends Pick<T, K>
    ? true
    : false
  : false;

export type OnlyOptional<T> = {
  [K in keyof T as IsOptional<T, K> extends true ? K : never]: T[K];
};

export type OnlyRequired<T> = {
  [K in keyof T as IsOptional<T, K> extends false ? K : never]: T[K];
};

export type FilterOptionalOrRequired<
  V,
  T extends "conditional" | "required"
> = T extends "conditional" ? OnlyOptional<V> : OnlyRequired<V>;



/* General Helper Types END */


/* Case helper types BEGIN  */


/** Convert literal string types like 'foo-bar' to 'FooBar' */
export type ToPascalCase<S extends string> = string extends S
  ? string
  : S extends `${infer T}-${infer U}`
    ? `${Capitalize<T>}${ToPascalCase<U>}`
    : Capitalize<S>;

/** Convert literal string types like 'foo-bar' to 'fooBar' */
export type ToCamelCase<S extends string> = string extends S
  ? string
  : S extends `${infer T}-${infer U}`
    ? `${T}${ToPascalCase<U>}`
    : S;


/* Case helper types END  */


/* Helper functions BEGIN */

export function whAdjust<O extends string, T extends number>(
  ogVal: O,
  widthOrHeight?: string | number,
  relAdjust?: T
) {
  return widthOrHeight && relAdjust
    ? typeof widthOrHeight === "string"
      ? Number.parseInt(widthOrHeight, 10) * relAdjust
      : widthOrHeight * relAdjust
    : ogVal;
}

/* Helper functions END */


```


**Related Resources:**
  - Raw file URL: https://raw.githubusercontent.com/DopamineDriven/t3-chat-clone/refs/heads/main/turborepo/apps/web/src/types/helpers.ts


---


**File:** `src/types/next.ts`

For more details, [visit the raw version of this file](https://raw.githubusercontent.com/DopamineDriven/t3-chat-clone/refs/heads/main/turborepo/apps/web/src/types/next.ts).

```ts

export type InferGSPRTWorkup<T> =
  T extends Promise<readonly (infer U)[] | (infer U)[]> ? U : T;

/**
 * usage with dynamic page routes in nextjs app directory for a [slug] route
 *
 * ```tsx
  export default async function DynamicPage({
    params
  }: InferGSPRT<typeof generateStaticParams>) {
    const { slug } = await params;
    // your code here
  }
  ```
*/

export type InferGSPRT<V extends (...args: any) => any> = {
  params: Promise<InferGSPRTWorkup<ReturnType<V>>>;
};

```


**Related Resources:**
  - Raw file URL: https://raw.githubusercontent.com/DopamineDriven/t3-chat-clone/refs/heads/main/turborepo/apps/web/src/types/next.ts


---


**File:** `src/utils/chat-ws-client.ts`

For more details, [visit the raw version of this file](https://raw.githubusercontent.com/DopamineDriven/t3-chat-clone/refs/heads/main/turborepo/apps/web/src/utils/chat-ws-client.ts).

```ts

import { ChatWsEvent } from "@/types/chat-ws";

export type ChatEventListener = (event: ChatWsEvent) => void;

export class ChatWebSocketClient {
  private socket: WebSocket | null = null;
  private readonly url: string;
  private reconnectAttempts = 0;
  private readonly maxReconnectAttempts = 5;
  private reconnectTimeout: NodeJS.Timeout | null = null;
  private messageQueue=Array.of<string>();
  private listeners=Array.of<ChatEventListener>();
  private _isConnected = false;

  constructor(url: string) {
    this.url = url;
  }

  public connect() {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) return;
    this.socket = new WebSocket(this.url);

    this.socket.onopen = () => {
      this._isConnected = true;
      this.reconnectAttempts = 0;
      while (
        this.messageQueue.length > 0 &&
        this.socket?.readyState === WebSocket.OPEN
      ) {
        const msg = this.messageQueue.shift();
        if (msg) this.socket.send(msg);
      }
    };

    this.socket.onmessage = (event: MessageEvent<string>) => {
      const data = JSON.parse(event.data) as ChatWsEvent;
      this.listeners.forEach(listener => listener(data));
    };

    this.socket.onerror = error => {
      console.error("WebSocket error:", error);
      this._isConnected = false;
    };

    this.socket.onclose = () => {
      this._isConnected = false;
      this.socket = null;
      if (this.reconnectAttempts < this.maxReconnectAttempts) {
        this.reconnectAttempts += 1;
        const delay = 1000 * Math.pow(2, this.reconnectAttempts);
        this.reconnectTimeout = setTimeout(() => this.connect(), delay);
      } else {
        console.error("Max reconnect attempts reached");
      }
    };
  }

  public send(event: ChatWsEvent) {
    const msg = JSON.stringify(event);
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(msg);
    } else {
      this.messageQueue.push(msg);
      if (!this.socket) this.connect();
    }
  }

  public addListener(listener: ChatEventListener) {
    this.listeners.push(listener);
  }

  public removeListener(listener: ChatEventListener) {
    this.listeners = this.listeners.filter(l => l !== listener);
  }

  public close() {
    if (this.reconnectTimeout) clearTimeout(this.reconnectTimeout);
    if (this.socket) {
      this.socket.close();
      this.socket = null;
      this._isConnected = false;
    }
  }

  public get isConnected() {
    return this._isConnected;
  }
}


```


**Related Resources:**
  - Raw file URL: https://raw.githubusercontent.com/DopamineDriven/t3-chat-clone/refs/heads/main/turborepo/apps/web/src/utils/chat-ws-client.ts


---


**File:** `src/utils/test.ts`

For more details, [visit the raw version of this file](https://raw.githubusercontent.com/DopamineDriven/t3-chat-clone/refs/heads/main/turborepo/apps/web/src/utils/test.ts).

```ts

import * as dotenv from "dotenv";

dotenv.config();

/**
 *
 * made up PORT_ONE, PORT_TWO, and PORT_THREE .env vars with no actual meaning other than testing
 * this allowed me to verify that the value for PORT as defined in the .env file (3333) could be
 * programmatically replaced by executing a cli process as shown below
 *
 * reference for key-vals defined in .env:
 *
 * ```sh
 * PORT=3333
 * PORT_ONE=4444
 * PORT_TWO=5555
 * PORT_THREE==6666
 *```
 *The script workup:
 *
  ```json
  {
    "test:set:1": "dotenv -- pnpm _test:set:1",
    "test:set:2": "dotenv -- pnpm _test:set:2",
    "test:set:3": "dotenv -- pnpm _test:set:3",
    "_test:set:1": "PORT=$PORT_ONE tsx src/utils/test.ts",
    "_test:set:2": "PORT=$PORT_TWO tsx src/utils/test.ts",
    "_test:set:3": "PORT=$PORT_THREE tsx src/utils/test.ts",
  }
  ```

the output:

 ```bash
$ pnpm test:set:1

> test:set:1 /home/dopaminedriven/cloneathon/t3-chat-clone/turborepo/apps/web
> dotenv -- pnpm _test:set:1


> _test:set:1 /home/dopaminedriven/cloneathon/t3-chat-clone/turborepo/apps/web
> PORT=$PORT_ONE tsx src/utils/test.ts

4444


$ pnpm test:set:2

> test:set:2 /home/dopaminedriven/cloneathon/t3-chat-clone/turborepo/apps/web
> dotenv -- pnpm _test:set:2


> _test:set:2 /home/dopaminedriven/cloneathon/t3-chat-clone/turborepo/apps/web
> PORT=$PORT_TWO tsx src/utils/test.ts

5555

$ pnpm test:set:3

> test:set:3 /home/dopaminedriven/cloneathon/t3-chat-clone/turborepo/apps/web
> dotenv -- pnpm _test:set:3


> _test:set:3 /home/dopaminedriven/cloneathon/t3-chat-clone/turborepo/apps/web
> PORT=$PORT_THREE tsx src/utils/test.ts

6666
```
---

Passing arbitrary args to hardcoded package.json scripts *just works*

Consider the following appended args `--target hello` as shown below

```bash
$ pnpm test:set:3 --target hello

> test:set:3 /home/dopaminedriven/cloneathon/t3-chat-clone/turborepo/apps/web
> dotenv -- pnpm _test:set:3 --target hello


> _test:set:3 /home/dopaminedriven/cloneathon/t3-chat-clone/turborepo/apps/web
> PORT=$PORT_THREE tsx src/utils/test.ts --target hello

6666 hello
```


 ```
    */

const testing = () => {
  if (process.argv[3] && process.argv[3].length > 1) {
    return (process.env.PORT ?? "no port") + ` ${process.argv[3]}`;
  } else return process.env.PORT ?? "no port";
};

console.log(testing());


```


**Related Resources:**
  - Raw file URL: https://raw.githubusercontent.com/DopamineDriven/t3-chat-clone/refs/heads/main/turborepo/apps/web/src/utils/test.ts


---


**File:** `src/utils/to-md.ts`

For more details, [visit the raw version of this file](https://raw.githubusercontent.com/DopamineDriven/t3-chat-clone/refs/heads/main/turborepo/apps/web/src/utils/to-md.ts).

```ts

import { Fs } from "@d0paminedriven/fs";
import type { BufferEncodingUnion } from "@d0paminedriven/fs";

type Opts = {
  encoding?: BufferEncodingUnion | null | undefined;
  withFileTypes?: false | undefined;
  recursive?: boolean | undefined;
};

type Targets =
  | "root"
  | "prisma"
  | "src/app"
  | "src/hooks"
  | "src/context"
  | "src/lib"
  | "src/orm"
  | "src/types"
  | "src/ui"
  | "src/utils";

class OutputMd extends Fs {
  constructor(public override cwd: string) {
    super((cwd ??= process.cwd()));
  }

  private getTargetedDirs<const T extends Targets>(
    target: T,
    options = {
      encoding: "utf-8",
      recursive: true,
      withFileTypes: false
    } satisfies Opts
  ) {
    if (target === "root") {
      const { recursive: re = false, ...opts } = options;
      return (
        this.readDir(target, { recursive: re, ...opts })
          .filter(
            file =>
              /(?:(public|dist|patches|node_modules|\.(next|git|vscode|husky|changeset|github|turbo|gitignore|env)|pnpm-lock\.yaml))/g.test(
                file
              ) === false
          )
          .filter(file => /(?:(src\/test))/g.test(file) === false)
          // eslint-disable-next-line @typescript-eslint/prefer-string-starts-ends-with
          .filter(file => /\./g.test(file) && !/\.md$/g.test(file))
      );
    } else if (target === "prisma") {
      const { recursive: re = false, ...opts } = options;
      return this.readDir("prisma", { recursive: re, ...opts })
        .filter(file => /(?:(test))/g.test(file) === false)
        .filter(v => /\./g.test(v))
        .map(v => {
          return v;
        });
    } else
      return this.readDir(target, options)
        .filter(v => /\./g.test(v))
        .map(v => {
          return v;
        });
  }

  private getTargetedPaths<const T extends Targets>(
    tp: T,
    options = {
      encoding: "utf-8",
      recursive: true,
      withFileTypes: false
    } satisfies Opts
  ) {
    return this.getTargetedDirs(tp, options);
  }

  private fileExt(file: string) {
    return !file.startsWith(".")
      ? (file.split(/\./)?.reverse()?.[0] ?? "txt")
      : file.split(/\./gim)?.reverse()?.[0];
  }
  private commentRegex =
    // eslint-disable-next-line no-useless-escape
    /(?:(?:\/\*(?:[^*]|(?:\*+[^*\/]))*\*+\/)|(?:(?<!\:|\\\|\')\/\/.*))/gm;

  private handleComments<const T extends Targets>(
    target: T,
    file: string,
    removeComments = true
  ) {
    if (target === "root") {
      return file;
    } else if (!removeComments) {
      return file.trim();
    } else {
      return file.replace(this.commentRegex, "");
    }
  }

  public getRawFiles<const T extends Targets>(
    target: T,
    removeComments = true
  ) {
    const arr = Array.of<string>();
    try {
      return this.getTargetedPaths(target).map(file => {
        const handleInjectedTarget =
          target === "root"
            ? file
            : target === "prisma"
              ? `prisma/${file}`
              : `${target}/${file}`;
        const fileExtension = this.fileExt(file);
        const fileContent =
          this.fileToBuffer(handleInjectedTarget).toString("utf-8");

        // prettier-ignore
        const toInject = `**File:** \`${handleInjectedTarget}\`

For more details, [visit the raw version of this file](https://raw.githubusercontent.com/DopamineDriven/t3-chat-clone/refs/heads/main/turborepo/apps/web/${handleInjectedTarget}).

\`\`\`${fileExtension}

${this.handleComments(target, fileContent, removeComments)}

\`\`\`


**Related Resources:**
  - Raw file URL: https://raw.githubusercontent.com/DopamineDriven/t3-chat-clone/refs/heads/main/turborepo/apps/web/${handleInjectedTarget}


---

`
        arr.push(toInject);
        return toInject;
      });
    } catch (err) {
      console.error(err);
    } finally {
      return arr;
    }
  }
  public incomingArgs(argv: string[]) {
    const omitComments = argv[4]?.includes("false") ? false : true;
    // prettier-ignore
    const msg = `must provide an argv3 command, \n\n prisma | root | app | hooks | lib | context | utils | types | orm | ui \n\n eg, \n\n \`\`\`bash \npnpm tsx src/test/output-md.ts --target ws-server\n \`\`\``;

    if (argv[3] && argv[3].length > 1) {
      if (argv[3]?.includes("prisma")) {
        this.withWs(
          "src/utils/__out__/prisma.md",
          this.getRawFiles("prisma", omitComments).join("\n")
        );
      } else if (argv[3]?.includes("types")) {
        this.withWs(
          "src/utils/__out__/types.md",
          this.getRawFiles("src/types", omitComments).join("\n")
        );
      } else if (argv[3]?.includes("app")) {
        this.withWs(
          "src/utils/__out__/app.md",
          this.getRawFiles("src/app", omitComments).join("\n")
        );
      } else if (argv[3]?.includes("hooks")) {
        this.withWs(
          "src/utils/__out__/hooks.md",
          this.getRawFiles("src/hooks", omitComments).join("\n")
        );
      } else if (argv[3]?.includes("lib")) {
        this.withWs(
          "src/utils/__out__/lib.md",
          this.getRawFiles("src/lib", omitComments).join("\n")
        );
      } else if (argv[3]?.includes("context")) {
        this.withWs(
          "src/utils/__out__/context.md",
          this.getRawFiles("src/context", omitComments).join("\n")
        );
      } else if (argv[3]?.includes("utils")) {
        this.withWs(
          "src/utils/__out__/utils.md",
          this.getRawFiles("src/utils", omitComments).join("\n")
        );
      } else if (argv[3]?.includes("orm")) {
        this.withWs(
          "src/utils/__out__/orm.md",
          this.getRawFiles("src/orm", omitComments).join("\n")
        );
      } else if (argv[3]?.includes("ui")) {
        this.withWs(
          "src/utils/__out__/ui.md",
          this.getRawFiles("src/ui", omitComments).join("\n")
        );
      } else if (argv[3]?.includes("root")) {
        this.withWs(
          "src/utils/__out__/root.md",
          this.getRawFiles("root", omitComments).join("\n")
        );
      } else if (argv[3]?.includes("help")) {
        console.log(msg);
      } else {
        console.log(
          `argv[3] must be a valid value -- prisma | root | app | hooks | lib | context | utils | types | orm | ui`
        );
      }
    } else {
      console.log(msg);
    }
  }
}
const fs = new OutputMd(process.cwd());

fs.incomingArgs(process.argv);


```


**Related Resources:**
  - Raw file URL: https://raw.githubusercontent.com/DopamineDriven/t3-chat-clone/refs/heads/main/turborepo/apps/web/src/utils/to-md.ts


---


**File:** `prisma/migrations/20250613032714_init/migration.sql`

For more details, [visit the raw version of this file](https://raw.githubusercontent.com/DopamineDriven/t3-chat-clone/refs/heads/main/turborepo/apps/web/prisma/migrations/20250613032714_init/migration.sql).

```sql

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT,
    "email" TEXT,
    "emailVerified" TIMESTAMP(3),
    "image" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Profile" (
    "id" TEXT NOT NULL,
    "bio" TEXT,
    "location" TEXT,
    "userId" TEXT NOT NULL,

    CONSTRAINT "Profile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "refresh_token" TEXT,
    "access_token" TEXT,
    "expires_at" INTEGER,
    "token_type" TEXT,
    "scope" TEXT,
    "id_token" TEXT,
    "session_state" TEXT,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "sessionToken" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserKey" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "apiKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserKey_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Settings" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "theme" TEXT,

    CONSTRAINT "Settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiAgent" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "displayName" TEXT,
    "description" TEXT,

    CONSTRAINT "AiAgent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Conversation" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "aiAgentId" TEXT,
    "branchId" TEXT,
    "parentId" TEXT,
    "isShared" BOOLEAN NOT NULL DEFAULT false,
    "shareToken" TEXT,

    CONSTRAINT "Conversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Message" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "senderId" TEXT,
    "senderType" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "aiAgentId" TEXT,

    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Attachment" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "conversationId" TEXT,

    CONSTRAINT "Attachment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Profile_userId_key" ON "Profile"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Account_provider_providerAccountId_key" ON "Account"("provider", "providerAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "Session_sessionToken_key" ON "Session"("sessionToken");

-- CreateIndex
CREATE UNIQUE INDEX "Settings_userId_key" ON "Settings"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Conversation_shareToken_key" ON "Conversation"("shareToken");

-- AddForeignKey
ALTER TABLE "Profile" ADD CONSTRAINT "Profile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserKey" ADD CONSTRAINT "UserKey_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Settings" ADD CONSTRAINT "Settings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_aiAgentId_fkey" FOREIGN KEY ("aiAgentId") REFERENCES "AiAgent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_aiAgentId_fkey" FOREIGN KEY ("aiAgentId") REFERENCES "AiAgent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "Message"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


```


**Related Resources:**
  - Raw file URL: https://raw.githubusercontent.com/DopamineDriven/t3-chat-clone/refs/heads/main/turborepo/apps/web/prisma/migrations/20250613032714_init/migration.sql


---


**File:** `src/ui/footer/index.tsx`

For more details, [visit the raw version of this file](https://raw.githubusercontent.com/DopamineDriven/t3-chat-clone/refs/heads/main/turborepo/apps/web/src/ui/footer/index.tsx).

```tsx

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

```


**Related Resources:**
  - Raw file URL: https://raw.githubusercontent.com/DopamineDriven/t3-chat-clone/refs/heads/main/turborepo/apps/web/src/ui/footer/index.tsx


---


**File:** `src/ui/home/index.tsx`

For more details, [visit the raw version of this file](https://raw.githubusercontent.com/DopamineDriven/t3-chat-clone/refs/heads/main/turborepo/apps/web/src/ui/home/index.tsx).

```tsx

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


```


**Related Resources:**
  - Raw file URL: https://raw.githubusercontent.com/DopamineDriven/t3-chat-clone/refs/heads/main/turborepo/apps/web/src/ui/home/index.tsx


---


**File:** `src/ui/nav/index.tsx`

For more details, [visit the raw version of this file](https://raw.githubusercontent.com/DopamineDriven/t3-chat-clone/refs/heads/main/turborepo/apps/web/src/ui/nav/index.tsx).

```tsx

"use client";

import { Icon } from "@t3-chat-clone/ui";
import { useEffect } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useTheme } from "next-themes";

const ThemeToggle = dynamic(
  () => import("@/ui/theme").then(d => d.ThemeToggle),
  { ssr: false }
);

export function Nav() {
  const { resolvedTheme } = useTheme();

  useEffect(() => {
    // Check if user prefers dark mode
    const prefersDark =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches;

    // Apply theme based on system preference during initial load
    if (!resolvedTheme) {
      if (prefersDark) {
        document.documentElement.classList.add("dark");
      } else {
        document.documentElement.classList.remove("dark");
      }
    } else {
      // Apply theme based on resolvedTheme once it's available
      if (resolvedTheme === "dark") {
        document.documentElement.classList.add("dark");
      } else {
        document.documentElement.classList.remove("dark");
      }
    }
  }, [resolvedTheme]);
  return (
    <header className="bg-background/95 supports-[backdrop-filter]:bg-background/60 max-w-9xl sticky top-0 z-40 w-full self-center border-b backdrop-blur">
      <div className="container flex h-14 items-center">
        <div className="mx-2 flex">
          <Link href="/" className="mr-6 flex items-center space-x-2">
            <Icon.Package className="size-6" />
            <span className="font-bold">turbogen</span>
          </Link>
        </div>
        <div className="flex flex-1 items-center justify-end space-x-4">
          <nav className="flex items-center space-x-6">
            <Link
              href="https://github.com/DopamineDriven/d0paminedriven"
              target="_blank"
              rel="noreferrer"
              className="flex items-center space-x-2">
              <Icon.Github className="size-5" />
              <span className="sr-only">GitHub</span>
            </Link>
            <Link
              href="#"
              className="text-muted-foreground hover:text-foreground text-sm font-medium transition-colors">
              Documentation
            </Link>
            <ThemeToggle />
          </nav>
        </div>
      </div>
    </header>
  );
}


```


**Related Resources:**
  - Raw file URL: https://raw.githubusercontent.com/DopamineDriven/t3-chat-clone/refs/heads/main/turborepo/apps/web/src/ui/nav/index.tsx


---


**File:** `src/ui/page-layout/index.tsx`

For more details, [visit the raw version of this file](https://raw.githubusercontent.com/DopamineDriven/t3-chat-clone/refs/heads/main/turborepo/apps/web/src/ui/page-layout/index.tsx).

```tsx

"use client";

import type { ReactNode } from "react";
import { Footer } from "@/ui/footer";
import { Nav } from "@/ui/nav";

export function PageLayout({ children }: { children: ReactNode }) {
  return (
    <div className="@max-9xl:mx-auto flex min-h-screen flex-col justify-center">
      <Nav />
      <main className="flex-1">{children}</main>
      <Footer />
    </div>
  );
}


```


**Related Resources:**
  - Raw file URL: https://raw.githubusercontent.com/DopamineDriven/t3-chat-clone/refs/heads/main/turborepo/apps/web/src/ui/page-layout/index.tsx


---


**File:** `src/ui/theme/index.tsx`

For more details, [visit the raw version of this file](https://raw.githubusercontent.com/DopamineDriven/t3-chat-clone/refs/heads/main/turborepo/apps/web/src/ui/theme/index.tsx).

```tsx

"use client";

import { Button, Icon } from "@t3-chat-clone/ui";
import { useEffect, useState } from "react";
import { useTheme } from "next-themes";

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const toggleTheme = () => {
    setTheme(resolvedTheme === "dark" ? "light" : "dark");
  };

  if (!mounted) {
    const prefersDark =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches;

    return (
      <Button
        variant="ghost"
        size="icon"
        style={{
          backgroundColor: "transparent",
          border: "none",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: "2.5rem",
          height: "2.5rem",
          borderRadius: "0.375rem"
        }}>
        {prefersDark ? (
          <Icon.Moon className="size-5" />
        ) : (
          <Icon.Sun className="size-5" />
        )}
        <span
          style={{
            position: "absolute",
            width: "1px",
            height: "1px",
            padding: "0",
            margin: "-1px",
            overflow: "hidden",
            clip: "rect(0, 0, 0, 0)",
            whiteSpace: "nowrap",
            borderWidth: "0"
          }}>
          Toggle theme
        </span>
      </Button>
    );
  }

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={toggleTheme}
      style={{
        backgroundColor: "transparent",
        border: "none",
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        width: "2.5rem",
        height: "2.5rem",
        borderRadius: "0.375rem"
      }}>
      {resolvedTheme === "dark" ? (
        <Icon.Moon className="size-5" />
      ) : (
        <Icon.Sun className="size-5" />
      )}
      <span
        style={{
          position: "absolute",
          width: "1px",
          height: "1px",
          padding: "0",
          margin: "-1px",
          overflow: "hidden",
          clip: "rect(0, 0, 0, 0)",
          whiteSpace: "nowrap",
          borderWidth: "0"
        }}>
        Toggle theme
      </span>
    </Button>
  );
}


```


**Related Resources:**
  - Raw file URL: https://raw.githubusercontent.com/DopamineDriven/t3-chat-clone/refs/heads/main/turborepo/apps/web/src/ui/theme/index.tsx


---

