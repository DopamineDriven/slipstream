"use client";

import type { ComponentPropsWithRef } from "react";
import { ArrowRight } from "./arrow-right";
import { Code } from "./code";
import { Github } from "./github";
import { Layers } from "./layers";
import { Moon } from "./moon";
import { Package } from "./package";
import { Sun } from "./sun";
import { Terminal } from "./terminal";
import { Zap } from "./zap";

const IconComponents = {
  ArrowRight,
  Code,
  Github,
  Layers,
  Moon,
  Package,
  Sun,
  Terminal,
  Zap
} as const;

export type IconName = keyof typeof IconComponents;

export type BaseSVGProps = Omit<
  ComponentPropsWithRef<"svg">,
  | "viewBox"
  | "xmlns"
  | "fill"
  | "role"
  | "stroke"
  | "strokeWidth"
  | "strokeLinecap"
  | "strokeLinejoin"
>;

export interface IconProps<T extends IconName> extends BaseSVGProps {
  target?: T;
}

function IconWithTarget({ target, ...props }: IconProps<IconName>) {
  if (!target) {
    return null;
  }

  const IconComponent = IconComponents[target];
  return <IconComponent {...props} />;
}

export const Icon = Object.assign(
  // allows for target="icon name"
  IconWithTarget,
  // allows for keying into icon name directly
  IconComponents
);

export { ArrowRight, Code, Github, Layers, Moon, Package, Sun, Terminal, Zap };
