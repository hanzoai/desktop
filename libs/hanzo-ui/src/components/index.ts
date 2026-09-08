/**
 * The desktop's component surface.
 *
 * Two provenances, one import path. Anything @hanzo/ui already publishes comes
 * straight from there — those components render through @hanzo/gui primitives
 * and carry NO Radix, NO shadcn fork and NO Tailwind of their own, so the
 * desktop stops maintaining a second copy of a solved problem. What remains
 * below the line is the set @hanzo/ui does not cover yet; each one is a
 * candidate for deletion the moment it lands upstream.
 *
 * Nothing may be listed twice: a name that exists in both places is a fork, and
 * a fork is the bug this file exists to prevent.
 *
 * A third, smaller group comes from `./gui-repairs`: @hanzo/ui components that
 * needed one prop corrected before they were usable here. They are re-exported
 * from there INSTEAD of from @hanzo/ui, so the unrepaired original has no way
 * into the app. That file lists what each repair fixes and when it can go.
 */

// ── Repaired @hanzo/ui components — see ./gui-repairs ──────────────────────
export {
  CollapsibleTrigger,
  Command,
  CommandInput,
  CommandItem,
  CommandList,
  DialogClose,
  DialogFooter,
  DialogTrigger,
  PopoverClose,
  PopoverTrigger,
  TooltipTrigger,
} from './gui-repairs';

// ── From @hanzo/ui (on @hanzo/gui) ─────────────────────────────────────────
export {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogOverlay,
  AlertDialogPortal,
  AlertDialogTitle,
  AlertDialogTrigger,
  Avatar,
  AvatarFallback,
  AvatarImage,
  Badge,
  badgeVariants,
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  Checkbox,
  Collapsible,
  CollapsibleContent,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandSeparator,
  CommandShortcut,
  ContextMenu,
  ContextMenuCheckboxItem,
  ContextMenuContent,
  ContextMenuGroup,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuPortal,
  ContextMenuRadioGroup,
  ContextMenuRadioItem,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuPortal,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
  Label,
  Popover,
  PopoverAnchor,
  PopoverContent,
  Progress,
  RadioGroup,
  RadioGroupItem,
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
  ScrollArea,
  ScrollBar,
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectScrollDownButton,
  SelectScrollUpButton,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
  Separator,
  Slider,
  Switch,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Textarea,
  ToggleGroup,
  ToggleGroupItem,
  Tooltip,
  TooltipContent,
  TooltipProvider,
} from '@hanzo/ui';

// ── Still local: no @hanzo/ui equivalent yet ───────────────────────────────
export * from './alert';
export * from './breadcrumb';
export * from './button';
export * from './background-beams';
export * from './copy-to-clipboard-icon';
export * from './dot-pattern';
export * from './dots-loader';
export * from './drawer';
export * from './error-message';
export * from './file-uploader';
export * from './form';
export * from './input';
export * from './markdown-preview';
export * from './prompt-textarea';
export * from './qr-code';
export * from './search-input';
export * from './sheet';
export * from './skeleton';
export * from './stepper';
export * from './textfield';
export * from './toast';
export * from './toggle';
export * from './table';
export * from './chat';
export * from './text-link';
export * from './rjsf/index';
export * from './pretty-json-print';
export * from './reasoning';
