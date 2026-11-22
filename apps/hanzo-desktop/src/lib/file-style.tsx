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
 * Unix shell (LS_COLORS / eza) semantic file icons & colors so directories,
 * source languages, configs, docs, scripts, and dotfiles read at a glance.
 */
export function getFileVisual(name: string, isDir: boolean, isOpen = false): FileVisual {
  const lower = name.toLowerCase();

  if (isDir) {
    if (lower === '.git' || lower === '.github') {
      return { Icon: FolderGit2, color: '#818cf8', nameColor: '#a5b4fc' };
    }
    if (lower.startsWith('.')) {
      return { Icon: isOpen ? FolderOpen : Folder, color: '#64748b', nameColor: '#94a3b8' };
    }
    return { Icon: isOpen ? FolderOpen : Folder, color: '#38bdf8', nameColor: '#e0f2fe' };
  }

  if (lower === 'package.json' || lower === 'pnpm-workspace.yaml' || lower === 'cargo.toml') {
    return { Icon: Package, color: '#f59e0b', nameColor: '#fde68a' };
  }
  if (LOCK_RE.test(lower)) {
    return { Icon: Lock, color: '#94a3b8', nameColor: '#94a3b8' };
  }
  if (lower.endsWith('.ts') || lower.endsWith('.tsx') || lower.endsWith('.mts') || lower.endsWith('.cts')) {
    return { Icon: FileCode2, color: '#60a5fa', nameColor: '#dbeafe' };
  }
  if (lower.endsWith('.js') || lower.endsWith('.jsx') || lower.endsWith('.mjs') || lower.endsWith('.cjs')) {
    return { Icon: FileCode2, color: '#fbbf24', nameColor: '#fef3c7' };
  }
  if (lower.endsWith('.rs')) {
    return { Icon: FileCode2, color: '#fb923c', nameColor: '#ffedd5' };
  }
  if (lower.endsWith('.swift')) {
    return { Icon: FileCode2, color: '#f97316', nameColor: '#ffedd5' };
  }
  if (lower.endsWith('.py') || lower.endsWith('.go')) {
    return { Icon: FileCode2, color: '#22d3ee', nameColor: '#cffafe' };
  }
  if (lower.endsWith('.json') || lower.endsWith('.jsonc')) {
    return { Icon: Braces, color: '#eab308', nameColor: '#fef08a' };
  }
  if (SHELL_RE.test(lower) || lower === 'makefile' || lower === 'dockerfile') {
    return { Icon: Terminal, color: '#34d399', nameColor: '#a7f3d0' };
  }
  if (STYLE_RE.test(lower)) {
    return { Icon: Palette, color: '#f472b6', nameColor: '#fce7f3' };
  }
  if (IMAGE_RE.test(lower)) {
    return { Icon: FileImage, color: '#2dd4bf', nameColor: '#ccfbf1' };
  }
  if (DOC_RE.test(lower) || lower === 'license' || lower.startsWith('readme')) {
    return { Icon: BookText, color: '#c084fc', nameColor: '#e9d5ff' };
  }
  if (DATA_RE.test(lower)) {
    return { Icon: Database, color: '#a3e635', nameColor: '#ecfccb' };
  }
  if (CONFIG_RE.test(lower) || lower.startsWith('.')) {
    return { Icon: FileCog, color: '#94a3b8', nameColor: '#cbd5e1' };
  }
  return { Icon: FileText, color: '#9ca3af', nameColor: '#e5e7eb' };
}
