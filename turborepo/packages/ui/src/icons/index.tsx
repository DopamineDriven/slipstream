"use client";

import type { ComponentPropsWithRef } from "react";
import { ArrowDownCircle } from "@/icons/arrow-down-circle";
import { ArrowLeft } from "@/icons/arrow-left";
import { ArrowRight } from "@/icons/arrow-right";
import { BookOpen } from "@/icons/book-open";
import { Bot } from "@/icons/bot";
import { Camera } from "@/icons/camera";
import { Check } from "@/icons/check";
import { ChevronDown } from "@/icons/chevron-down";
import { ChevronRight } from "@/icons/chevron-right";
import { ChevronUp } from "@/icons/chevron-up";
import { Circle } from "@/icons/circle";
import { CirclePlus } from "@/icons/circle-plus";
import { Code } from "@/icons/code";
import { Compass } from "@/icons/compass";
import { Copy } from "@/icons/copy";
import { Edit } from "@/icons/edit";
import { Expand } from "@/icons/expand";
import { Eye } from "@/icons/eye";
import { EyeClosed } from "@/icons/eye-closed";
import { EyeOff } from "@/icons/eye-off";
import { FileText } from "@/icons/file-text";
import { Github } from "@/icons/github";
import { History } from "@/icons/history";
import { ImageIcon } from "@/icons/image-icon";
import { Key } from "@/icons/key";
import { KeyRound } from "@/icons/key-round";
import { Layers } from "@/icons/layers";
import { Loader } from "@/icons/loader";
import { LoaderCircle } from "@/icons/loader-circle";
import { LoaderPinwheel } from "@/icons/loader-pinwheel";
import { LogOut } from "@/icons/log-out";
import { Mail } from "@/icons/mail";
import { Menu } from "@/icons/menu";
import { MessageCircleQuestion } from "@/icons/message-circle-question";
import { MessageSquare } from "@/icons/message-square";
import { MessageSquareText } from "@/icons/message-square-text";
import { Moon } from "@/icons/moon";
import { Package } from "@/icons/package";
import { Palette } from "@/icons/palette";
import { PanelLeftClose } from "@/icons/panel-left-close";
import { PanelRightClose } from "@/icons/panel-right-close";
import { Paperclip } from "@/icons/paperclip";
import { PenLine } from "@/icons/pen-line";
import { Plus } from "@/icons/plus";
import { QuestionMark } from "@/icons/question-mark";
import { Save } from "@/icons/save";
import { Search } from "@/icons/search";
import { Send } from "@/icons/send";
import { Settings } from "@/icons/settings";
import { ShareIcon } from "@/icons/share-icon";
import { Sparkles } from "@/icons/sparkles";
import { SquarePen } from "@/icons/square-pen";
import { Sun } from "@/icons/sun";
import { Terminal } from "@/icons/terminal";
import { Trash } from "@/icons/trash";
import { TrashSimple } from "@/icons/trash-simple";
import { User } from "@/icons/user";
import { X } from "@/icons/x";
import { Zap } from "@/icons/zap";

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
  ChevronUp,
  CirclePlus,
  Circle,
  Code,
  Compass,
  Copy,
  Edit,
  Expand,
  Eye,
  EyeClosed,
  EyeOff,
  FileText,
  Github,
  History,
  ImageIcon,
  Key,
  KeyRound,
  Layers,
  LoaderCircle,
  LoaderPinwheel,
  Loader,
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
  QuestionMark,
  Save,
  Search,
  Send,
  Settings,
  ShareIcon,
  Sparkles,
  SquarePen,
  Sun,
  Terminal,
  Trash,
  TrashSimple,
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
  ChevronUp,
  CirclePlus,
  Circle,
  Code,
  Compass,
  Copy,
  Edit,
  Expand,
  Eye,
  EyeClosed,
  EyeOff,
  FileText,
  Github,
  History,
  ImageIcon,
  Key,
  KeyRound,
  Layers,
  LoaderCircle,
  LoaderPinwheel,
  Loader,
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
  QuestionMark,
  Save,
  Search,
  Send,
  Settings,
  ShareIcon,
  Sparkles,
  SquarePen,
  Sun,
  Terminal,
  Trash,
  TrashSimple,
  User,
  X,
  Zap
};
