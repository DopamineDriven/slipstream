// styles
import "./globals.css";

// icons
export { Icon } from "@/icons/index";
export type { BaseSVGProps, IconName } from "@/icons/index";
export { AnthropicIcon } from "@/icons/anthropic";
export { ArrowDownCircle } from "@/icons/arrow-down-circle";
export { ArrowLeft } from "@/icons/arrow-left";
export { ArrowRight } from "@/icons/arrow-right";
export { BookOpen } from "@/icons/book-open";
export { Bot } from "@/icons/bot";
export { Camera } from "@/icons/camera";
export { Check } from "@/icons/check";
export { ChevronDown } from "@/icons/chevron-down";
export { ChevronRight } from "@/icons/chevron-right";
export { ChevronUp } from "@/icons/chevron-up";
export { CirclePlus } from "@/icons/circle-plus";
export { Circle } from "@/icons/circle";
export { Code } from "@/icons/code";
export { Compass } from "@/icons/compass";
export { Copy } from "@/icons/copy";
export { Edit } from "@/icons/edit";
export { EditIcon } from "@/icons/edit-icon";
export { EllipsisHorizontal } from "@/icons/ellipsis-horizontal";
export { EmptyChatHistory } from "@/icons/empty-chat-history";
export { Expand } from "@/icons/expand";
export { EyeClosed } from "@/icons/eye-closed";
export { EyeOff } from "@/icons/eye-off";
export { Eye } from "@/icons/eye";
export { FileText } from "@/icons/file-text";
export { GeminiIcon } from "@/icons/gemini";
export { Github } from "@/icons/github";
export { GripVertical } from "@/icons/grip-vertical";
export { History } from "@/icons/history";
export { ImageIcon } from "@/icons/image-icon";
export { KeyRound } from "@/icons/key-round";
export { Key } from "@/icons/key";
export { Layers } from "@/icons/layers";
export { LoaderCircle } from "@/icons/loader-circle";
export { LoaderPinwheel } from "@/icons/loader-pinwheel";
export { Loader } from "@/icons/loader";
export { LogOut } from "@/icons/log-out";
export { Mail } from "@/icons/mail";
export { Menu } from "@/icons/menu";
export { MessageCircleQuestion } from "@/icons/message-circle-question";
export { MessageSquare } from "@/icons/message-square";
export { MessageSquareText } from "@/icons/message-square-text";
export { MetaIcon } from "@/icons/meta";
export { Mic } from "@/icons/mic";
export { Moon } from "@/icons/moon";
export { OpenAiIcon } from "@/icons/openai";
export { Package } from "@/icons/package";
export { Palette } from "@/icons/palette";
export { PanelLeft } from "@/icons/panel-left";
export { PanelLeftClose } from "@/icons/panel-left-close";
export { PanelRightClose } from "@/icons/panel-right-close";
export { Paperclip } from "@/icons/paperclip";
export { PenLine } from "@/icons/pen-line";
export { Plus } from "@/icons/plus";
export { QuestionMark } from "@/icons/question-mark";
export { QuoteIcon } from "@/icons/quote";
export { ReadAloud } from "@/icons/read-aloud";
export { RetryIcon } from "@/icons/retry";
export { Save } from "@/icons/save";
export { Search } from "@/icons/search";
export { Send } from "@/icons/send";
export { SendMessage } from "@/icons/send-message";
export { Settings } from "@/icons/settings";
export { ShareIcon } from "@/icons/share-icon";
export { Sparkles } from "@/icons/sparkles";
export { SquarePen } from "@/icons/square-pen";
export { Sun } from "@/icons/sun";
export { Terminal } from "@/icons/terminal";
export { ThumbsDown } from "@/icons/thumbs-down";
export { ThumbsUp } from "@/icons/thumbs-up";
export { Tools } from "@/icons/tools";
export { Trash } from "@/icons/trash";
export { TrashSimple } from "@/icons/trash-simple";
export { User } from "@/icons/user";
export { VercelIcon } from "@/icons/vercel";
export { X } from "@/icons/x";
export { XAiIcon } from "@/icons/xai";
export { Zap } from "@/icons/zap";
// lib
export { cn } from "@/lib/utils";
// ui/base
export { UploadProgress } from "@/ui/base/progress";

// ui
export {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger
} from "@/ui/accordion";
export type { AccordionProps } from "@/ui/accordion";
export {
  AlertDialog,
  AlertDialogPortal,
  AlertDialogOverlay,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogAction,
  AlertDialogCancel
} from "@/ui/alert-dialog";
export type { AlertDialogProps } from "@/ui/alert-dialog";
export { AspectRatio } from "@/ui/aspect-ratio";
export { Avatar, AvatarFallback, AvatarImage } from "@/ui/avatar";
export type { AvatarProps } from "@/ui/avatar";
export { Badge, badgeVariants } from "@/ui/badge";
export type { BadgeProps } from "@/ui/badge";
export { Button, buttonVariants } from "@/ui/button";
export type { ButtonProps } from "@/ui/button";
export {
  Card,
  CardHeader,
  CardFooter,
  CardTitle,
  CardAction,
  CardDescription,
  CardContent
} from "@/ui/card";
export { Checkbox } from "@/ui/checkbox";
export {
  Dialog,
  DialogPortal,
  DialogOverlay,
  DialogClose,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription
} from "@/ui/dialog";
export type { DialogProps } from "@/ui/dialog";
export {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuCheckboxItem,
  DropdownMenuRadioItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuGroup,
  DropdownMenuPortal,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuRadioGroup
} from "@/ui/dropdown-menu";
export type { DropdownMenuProps } from "@/ui/dropdown-menu";
export { Input } from "@/ui/input";
export type { InputProps } from "@/ui/input";
export { Label } from "@/ui/label";
export {
  Popover,
  PopoverTrigger,
  PopoverContent,
  PopoverAnchor
} from "@/ui/popover";
export type { PopoverProps } from "@/ui/popover";
export { Progress } from "@/ui/progress";
export type { ProgressProps } from "@/ui/progress";
export { ScrollArea, ScrollBar } from "@/ui/scroll-area";
export type { ScrollAreaProps } from "@/ui/scroll-area";
export {
  Select,
  SelectGroup,
  SelectValue,
  SelectTrigger,
  SelectContent,
  SelectLabel,
  SelectItem,
  SelectSeparator,
  SelectScrollUpButton,
  SelectScrollDownButton
} from "@/ui/select";
export type { SelectProps } from "@/ui/select";
export { Separator } from "@/ui/separator";
export type { SeparatorProps } from "@/ui/separator";
export {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger
} from "@/ui/sheet";
export { Skeleton } from "@/ui/skeleton";
export { Slider } from "@/ui/slider";
export { Switch } from "@/ui/switch";
export type { SwitchProps } from "@/ui/switch";
export { Tabs, TabsContent, TabsList, TabsTrigger } from "@/ui/tabs";
export type { TabsProps } from "@/ui/tabs";
export { Textarea } from "@/ui/textarea";
export type { TextareaProps } from "@/ui/textarea";
export { Toggle, toggleVariants } from "@/ui/toggle";
export type { ToggleProps } from "@/ui/toggle";
export {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger
} from "@/ui/tooltip";
