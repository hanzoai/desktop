import {
  Bot,
  FolderClosed,
  MessageSquare,
  Settings,
  TerminalSquare,
  Wrench,
} from '@hanzogui/lucide-icons-2';

export type SectionKey =
  | 'chat'
  | 'terminals'
  | 'agents'
  | 'tools'
  | 'files'
  | 'settings';

export type Section = {
  key: SectionKey;
  label: string;
  icon: typeof MessageSquare;
  /** Shown while the section has nothing in it — which is every section today. */
  title: string;
  description: string;
  bullets: string[];
};

/**
 * THE section catalog. Four surfaces read it and none of them owns a list of
 * its own: the sidebar nav, the main body's empty state, the dock's tabs and
 * the companions menu. It used to be two parallel objects keyed the same way
 * (`NAV` and `EMPTY` in Shell.tsx), which is a list written twice — adding a
 * section meant remembering both, and the compiler could only catch the half
 * that was a `Record`.
 */
export const SECTIONS: Section[] = [
  {
    key: 'chat',
    label: 'Chat',
    icon: MessageSquare,
    title: 'Start a conversation',
    description:
      'Chat with local and hosted models, with tools and agents inline.',
    bullets: [
      'Runs on your machine by default',
      'Bring your own keys for hosted models',
    ],
  },
  {
    key: 'terminals',
    label: 'Terminals',
    icon: TerminalSquare,
    /* The empty state is the workspace's own, so these are what the sidebar and
       the companions menu read and nothing draws them as a body. A machine
       arrives by `hanzo link` on it or by starting one here. */
    title: 'No machines linked',
    description: 'Open terminals, desktops and pages on machines you have.',
    bullets: ['Run `hanzo link` on a machine of yours', 'Or start one in the cloud'],
  },
  {
    key: 'agents',
    label: 'Agents',
    icon: Bot,
    title: 'No agents yet',
    description: 'Compose multi-step agents from tools, prompts and models.',
    bullets: ['Reusable across chats', 'Version and share as bundles'],
  },
  {
    key: 'tools',
    label: 'Tools',
    icon: Wrench,
    title: 'No tools installed',
    description: 'Add MCP tools to give models real capabilities.',
    bullets: ['Install from the store', 'Author your own in TS or Python'],
  },
  {
    key: 'files',
    label: 'Files',
    icon: FolderClosed,
    title: 'No files indexed',
    description: 'Add files and folders for retrieval-augmented answers.',
    bullets: ['Local vector search', 'Nothing is uploaded'],
  },
  {
    key: 'settings',
    label: 'Settings',
    icon: Settings,
    title: 'Settings',
    description: 'Configure your node, models and appearance.',
    bullets: ['Local node ports and keys', 'Appearance and theme'],
  },
];

export const SECTION = Object.fromEntries(
  SECTIONS.map((section) => [section.key, section]),
) as Record<SectionKey, Section>;
