"use client";

import type { ComponentPropsWithRef } from "react";
import { ArrowDownCircle } from "./arrow-down-circle";
import { ArrowLeft } from "./arrow-left";
import { ArrowRight } from "./arrow-right";
import { BookOpen } from "./book-open";
import { Bot } from "./bot";
import { Camera } from "./camera";
import { Check } from "./check";
import { ChevronDown } from "./chevron-down";
import { ChevronRight } from "./chevron-right";
import { Circle } from "./circle";
import { CirclePlus } from "./circle-plus";
import { Code } from "./code";
import { Compass } from "./compass";
import { Copy } from "./copy";
import { Expand } from "./expand";
import { FileText } from "./file-text";
import { Github } from "./github";
import { History } from "./history";
import { ImageIcon } from "./image-icon";
import { KeyRound } from "./key-round";
import { Layers } from "./layers";
import { LogOut } from "./log-out";
import { Mail } from "./mail";
import {Menu} from "./menu";
import { MessageCircleQuestion } from "./message-circle-question";
import { MessageSquare } from "./message-square";
import { MessageSquareText } from "./message-square-text";
import { Moon } from "./moon";
import { Package } from "./package";
import { Palette } from "./palette";
import { PanelLeftClose } from "./panel-left-close";
import { PanelRightClose } from "./panel-right-close";
import { Paperclip } from "./paperclip";
import { PenLine } from "./pen-line";
import { Plus } from "./plus";
import { Search } from "./search";
import { Send } from "./send";
import { Settings } from "./settings";
import { ShareIcon } from "./share-icon";
import { Sparkles } from "./sparkles";
import { Sun } from "./sun";
import { Terminal } from "./terminal";
import { User } from "./user";
import { X } from "./x";
import { Zap } from "./zap";

const IconComponents = {
  ArrowDownCircle,
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Bot,
  Camera,
  Check,
  ChevronDown,
  ChevronRight,
  CirclePlus,
  Circle,
  Code,
  Compass,
  Copy,
  Expand,
  FileText,
  Github,
  History,
  ImageIcon,
  KeyRound,
  Layers,
  LogOut,
  Mail,
  Menu,
  MessageCircleQuestion,
  MessageSquare,
  MessageSquareText,
  Moon,
  Package,
  Palette,
  PanelLeftClose,
  PanelRightClose,
  Paperclip,
  PenLine,
  Plus,
  Search,
  Send,
  Settings,
  ShareIcon,
  Sparkles,
  Sun,
  Terminal,
  User,
  X,
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

export {
  ArrowDownCircle,
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Bot,
  Camera,
  Check,
  ChevronDown,
  ChevronRight,
  CirclePlus,
  Circle,
  Code,
  Compass,
  Copy,
  Expand,
  FileText,
  Github,
  History,
  ImageIcon,
  KeyRound,
  Layers,
  LogOut,
  Mail,
  Menu,
  MessageCircleQuestion,
  MessageSquare,
  MessageSquareText,
  Moon,
  Package,
  Palette,
  PanelLeftClose,
  PanelRightClose,
  Paperclip,
  PenLine,
  Plus,
  Search,
  Send,
  Settings,
  ShareIcon,
  Sparkles,
  Sun,
  Terminal,
  User,
  X,
  Zap
};
