import type { ComponentType } from 'react';
import {
  BookText,
  Braces,
  Database,
  FileCode2,
  FileCog,
  FileImage,
  FileText,
  Folder,
  FolderGit2,
  FolderOpen,
  Lock,
  Package,
  Palette,
  Terminal,
} from 'lucide-react';

export interface FileVisual {
  Icon: ComponentType<{ size?: number; strokeWidth?: number; className?: string; style?: React.CSSProperties }>;
  color: string;
  nameColor?: string;
  badge?: string;
}

const IMAGE_RE = /\.(png|jpe?g|gif|webp|svg|ico|avif|heic)$/i;
const LOCK_RE = /(lock\.ya?ml|package-lock\.json|Cargo\.lock|\.lock|\.env(\..+)?)$/i;
const SHELL_RE = /\.(sh|zsh|bash|fish|command)$/i;
const DOC_RE = /\.(md|mdx|txt|rst|adoc)$/i;
const STYLE_RE = /\.(css|scss|sass|less|styl)$/i;
const DATA_RE = /\.(sql|sqlite|db|parquet|csv|tsv)$/i;
const CONFIG_RE = /\.(ya?ml|toml|ini|conf|cfg|xml|plist|xcconfig|entitlements)$/i;

/**
 * Vercel Geist / Zen semantic file icons & colors:
 * neutral grey folders + crisp monochrome filenames with subtle Geist icon accents.
 */
export function getFileVisual(name: string, isDir: boolean, isOpen = false): FileVisual {
  const lower = name.toLowerCase();

  if (isDir) {
    if (lower === '.git' || lower === '.github') {
      return { Icon: FolderGit2, color: '#888888', nameColor: '#a1a1aa' };
    }
    if (lower.startsWith('.')) {
      return { Icon: isOpen ? FolderOpen : Folder, color: '#525252', nameColor: '#737373' };
    }
    return { Icon: isOpen ? FolderOpen : Folder, color: '#888888', nameColor: '#ededed' };
  }

  if (lower === 'package.json' || lower === 'pnpm-workspace.yaml' || lower === 'cargo.toml') {
    return { Icon: Package, color: '#f5a623', nameColor: '#ededed' };
  }
  if (LOCK_RE.test(lower)) {
    return { Icon: Lock, color: '#666666', nameColor: '#888888' };
  }
  if (lower.endsWith('.ts') || lower.endsWith('.tsx') || lower.endsWith('.mts') || lower.endsWith('.cts')) {
    return { Icon: FileCode2, color: '#52a8ff', nameColor: '#ededed' };
  }
  if (lower.endsWith('.js') || lower.endsWith('.jsx') || lower.endsWith('.mjs') || lower.endsWith('.cjs')) {
    return { Icon: FileCode2, color: '#f5a623', nameColor: '#ededed' };
  }
  if (lower.endsWith('.rs') || lower.endsWith('.swift')) {
    return { Icon: FileCode2, color: '#f57c38', nameColor: '#ededed' };
  }
  if (lower.endsWith('.py') || lower.endsWith('.go')) {
    return { Icon: FileCode2, color: '#50e3c2', nameColor: '#ededed' };
  }
  if (lower.endsWith('.json') || lower.endsWith('.jsonc')) {
    return { Icon: Braces, color: '#d4a72c', nameColor: '#d4d4d8' };
  }
  if (SHELL_RE.test(lower) || lower === 'makefile' || lower === 'dockerfile') {
    return { Icon: Terminal, color: '#46a758', nameColor: '#ededed' };
  }
  if (STYLE_RE.test(lower)) {
    return { Icon: Palette, color: '#f75f8f', nameColor: '#ededed' };
  }
  if (IMAGE_RE.test(lower)) {
    return { Icon: FileImage, color: '#50e3c2', nameColor: '#ededed' };
  }
  if (DOC_RE.test(lower) || lower === 'license' || lower.startsWith('readme')) {
    return { Icon: BookText, color: '#bf7af0', nameColor: '#ededed' };
  }
  if (DATA_RE.test(lower)) {
    return { Icon: Database, color: '#79d868', nameColor: '#ededed' };
  }
  if (CONFIG_RE.test(lower) || lower.startsWith('.')) {
    return { Icon: FileCog, color: '#737373', nameColor: '#a1a1aa' };
  }
  return { Icon: FileText, color: '#737373', nameColor: '#d4d4d8' };
}
