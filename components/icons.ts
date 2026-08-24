/**
 * Single icon entry point for the app.
 *
 * Import icons from here, never from `lucide-react-native` directly. The package
 * root is a barrel that re-exports ~1750 icon modules; Metro does not tree-shake,
 * so a single named import from it pulls every icon into the bundle. The
 * `lucide-react-native/icons/*` subpaths resolve to one module per icon.
 *
 * Adding an icon: add a line below, kebab-case file name. Aliased names differ
 * from their module (AlertCircle -> circle-alert, HelpCircle -> circle-question-mark,
 * FileQuestion -> file-question-mark); check `dist/esm/icons/` when unsure.
 */

import type { LucideProps } from "lucide-react-native";
import type { ComponentType } from "react";

// Type-only, so the barrel is erased at compile time and costs no bundle weight.
export type IconProps = LucideProps;
export type IconComponent = ComponentType<LucideProps>;

export { default as AlertCircle } from "lucide-react-native/icons/circle-alert";
export { default as BookOpen } from "lucide-react-native/icons/book-open";
export { default as Camera } from "lucide-react-native/icons/camera";
export { default as Check } from "lucide-react-native/icons/check";
export { default as CheckCheck } from "lucide-react-native/icons/check-check";
export { default as ChevronDown } from "lucide-react-native/icons/chevron-down";
export { default as ChevronLeft } from "lucide-react-native/icons/chevron-left";
export { default as ChevronRight } from "lucide-react-native/icons/chevron-right";
export { default as ChevronUp } from "lucide-react-native/icons/chevron-up";
export { default as Clock } from "lucide-react-native/icons/clock";
export { default as Copy } from "lucide-react-native/icons/copy";
export { default as CornerUpLeft } from "lucide-react-native/icons/corner-up-left";
export { default as Eye } from "lucide-react-native/icons/eye";
export { default as EyeOff } from "lucide-react-native/icons/eye-off";
export { default as FileText } from "lucide-react-native/icons/file-text";
export { default as Headphones } from "lucide-react-native/icons/headphones";
export { default as HelpCircle } from "lucide-react-native/icons/circle-question-mark";
export { default as House } from "lucide-react-native/icons/house";
export { default as Image } from "lucide-react-native/icons/image";
export { default as Inbox } from "lucide-react-native/icons/inbox";
export { default as Info } from "lucide-react-native/icons/info";
export { default as LogOut } from "lucide-react-native/icons/log-out";
export { default as Mail } from "lucide-react-native/icons/mail";
export { default as Megaphone } from "lucide-react-native/icons/megaphone";
export { default as MessageCircle } from "lucide-react-native/icons/message-circle";
export { default as MessageSquare } from "lucide-react-native/icons/message-square";
export { default as Mic } from "lucide-react-native/icons/mic";
export { default as Pause } from "lucide-react-native/icons/pause";
export { default as Play } from "lucide-react-native/icons/play";
export { default as Plus } from "lucide-react-native/icons/plus";
export { default as Reply } from "lucide-react-native/icons/reply";
export { default as Search } from "lucide-react-native/icons/search";
export { default as Send } from "lucide-react-native/icons/send";
export { default as Settings } from "lucide-react-native/icons/settings";
export { default as Shield } from "lucide-react-native/icons/shield";
export { default as ShieldCheck } from "lucide-react-native/icons/shield-check";
export { default as Sparkles } from "lucide-react-native/icons/sparkles";
export { default as Square } from "lucide-react-native/icons/square";
export { default as SquarePen } from "lucide-react-native/icons/square-pen";
export { default as Trash2 } from "lucide-react-native/icons/trash-2";
export { default as User } from "lucide-react-native/icons/user";
export { default as UserX } from "lucide-react-native/icons/user-x";
export { default as Users } from "lucide-react-native/icons/users";
export { default as X } from "lucide-react-native/icons/x";
