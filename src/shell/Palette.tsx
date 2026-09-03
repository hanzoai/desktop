import { Palette as Bar, useCommandK, type Op } from '@hanzo/ui/product'
import {
  Blocks,
  Bot,
  Brain,
  Building2,
  Clock,
  Code2,
  FileText,
  FolderGit2,
  GraduationCap,
  Kanban,
  ListTodo,
  LogIn,
  LogOut,
  PanelLeft,
  Plug,
  Settings,
  Shield,
  SquarePen,
  Terminal,
  UserCheck,
  UserPlus,
  UserRound,
  Video,
} from '@hanzogui/lucide-icons-2'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router'

import { workspaceAppsStore } from '../apps/store.ts'
import { artifactStore } from '../artifact/store.ts'
import { automationsStore } from '../automations/store.ts'
import { boardStore } from '../boards/store.ts'
import { api } from '../data/api.ts'
import { useSession } from '@hanzo/chat/data/session'
import { intelligenceStore } from '../intelligence/store.ts'
import { mcpStore } from '../mcp/store.ts'
import { pluginsStore } from '../plugins/store.ts'
import { connectorsStore } from '../connectors/store.ts'
import { skillsStore } from '../skills/store.ts'
import { multiplayerStore } from '../presence/store.ts'
import { projectsStore } from '../projects/store.ts'
import { taskQueueStore } from '../tasks/store.ts'
import { terminalStore } from '../terminal/store.ts'

export interface PaletteProps {
  onSettings: () => void
  onRail: () => void
  onOpenAgentBuilder?: () => void
}

/**
 * ⌘K, on every route this app answers.
 */
export const Palette = ({ onSettings, onRail, onOpenAgentBuilder }: PaletteProps) => {
  const [open, setOpen] = useState(false)
  const navigate = useNavigate()
  const { standing, signIn, signOut } = useSession()

  useCommandK(useCallback(() => setOpen((was) => !was), []))

  // Global hotkeys for instant agentic surfaces:
  // ⌘` or ⌘\ -> Toggle Terminal & Cloud Sandbox
  // ⌘M -> Toggle MCP Skills & Connectors
  // ⌘B -> Open Sprint Boards
  // ⌘Q -> Open Durable Task Queue
  // ⌘T -> Open Zero-Trust Tunnel Sharing
  // ⌘P -> Open Projects & Switcher
  // ⌘X -> Open Plugins Marketplace
  // ⌘A -> Open Automations
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isCmd = e.metaKey || e.ctrlKey
      if (isCmd && (e.key === '`' || e.key === '\\')) {
        e.preventDefault()
        terminalStore.toggle()
      } else if (isCmd && (e.key === 'm' || e.key === 'M')) {
        e.preventDefault()
        mcpStore.toggle()
      } else if (isCmd && (e.key === 'b' || e.key === 'B')) {
        e.preventDefault()
        boardStore.toggle()
      } else if (isCmd && (e.key === 'q' || e.key === 'Q')) {
        e.preventDefault()
        taskQueueStore.toggle()
      } else if (isCmd && (e.key === 't' || e.key === 'T')) {
        e.preventDefault()
        workspaceAppsStore.toggle('tunnel')
      } else if (isCmd && (e.key === 'p' || e.key === 'P')) {
        e.preventDefault()
        projectsStore.toggle()
      } else if (isCmd && (e.key === 'x' || e.key === 'X')) {
        e.preventDefault()
        pluginsStore.toggle()
      } else if (isCmd && (e.key === 'a' || e.key === 'A')) {
        e.preventDefault()
        automationsStore.toggle()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  const ops = useMemo<Op[]>(() => {
    const list: Op[] = [
      {
        id: 'new',
        group: 'Chat',
        label: 'New chat',
        hint: 'Start a conversation',
        icon: <SquarePen size={15} />,
      },
      {
        id: 'projects',
        group: 'Workspace & Organization',
        label: 'Projects & Workspaces',
        hint: 'Switch projects, create repos, assign agents (⌘P)',
        icon: <FolderGit2 size={15} />,
      },
      {
        id: 'orgs',
        group: 'Workspace & Organization',
        label: 'Organization & Tenancy Switcher',
        hint: 'Switch orgs and IAM team policies',
        icon: <Building2 size={15} />,
      },
      {
        id: 'users',
        group: 'Workspace & Organization',
        label: 'User & Identity Switcher',
        hint: 'Switch acting engineer identity & roles',
        icon: <UserCheck size={15} />,
      },
      {
        id: 'plugins',
        group: 'Extensions & Tools',
        label: 'Plugins',
        hint: 'What this deployment mounts, and what this org built (⌘X)',
        icon: <Blocks size={15} />,
      },
      {
        id: 'skills',
        group: 'Extensions & Tools',
        label: 'Skills',
        hint: "What this org's agents can discover",
        icon: <GraduationCap size={15} />,
      },
      {
        id: 'connectors',
        group: 'Extensions & Tools',
        label: 'Connectors',
        hint: 'Providers this org has connected',
        icon: <Plug size={15} />,
      },
      {
        id: 'automations',
        group: 'Extensions & Tools',
        label: 'Automations',
        hint: 'Cron jobs, git push hooks, agent schedules (⌘A)',
        icon: <Clock size={15} />,
      },
      {
        id: 'terminal',
        group: 'Agentic & Cloud',
        label: 'Terminal',
        hint: 'A leased sandbox, on this machine or the estate (⌘\\)',
        icon: <Terminal size={15} />,
      },
      {
        id: 'meet',
        group: 'Workspace Apps',
        label: 'meet.hanzo.ai — Live Video Room',
        hint: 'WebRTC room with AI transcription agent',
        icon: <Video size={15} />,
      },
      {
        id: 'notes',
        group: 'Workspace Apps',
        label: 'notes.hanzo.ai & todo.hanzo.ai',
        hint: 'Collaborative markdown notes and checklists',
        icon: <FileText size={15} />,
      },
      {
        id: 'tunnel',
        group: 'Workspace Apps',
        label: 'Network',
        hint: "The org's overlay on the Zero Trust fabric (⌘T)",
        icon: <Shield size={15} />,
      },
      {
        id: 'tasks',
        group: 'Agentic & Cloud',
        label: 'tasks.hanzo.ai & CI/CD Pipelines',
        hint: 'Orchestrate async background tasks & builds (⌘Q)',
        icon: <ListTodo size={15} />,
      },
      {
        id: 'boards',
        group: 'Agentic & Cloud',
        label: 'Sprint Boards & Agent Tasks',
        hint: 'Kanban issues with autonomous agent dispatch (⌘B)',
        icon: <Kanban size={15} />,
      },
      {
        id: 'mcp',
        group: 'Agentic & Cloud',
        label: 'MCP servers',
        hint: 'What this org connected, and which tools are on (⌘M)',
        icon: <Blocks size={15} />,
      },
      {
        id: 'intelligence',
        group: 'Agentic & Cloud',
        label: 'Memory & Code Intelligence',
        hint: 'Vector memory, rules, and AST codebase symbols',
        icon: <Brain size={15} />,
      },
      {
        id: 'builder',
        group: 'Agentic & Cloud',
        label: 'Agent Builder & Studio',
        hint: 'Create and deploy custom agent specialists',
        icon: <Bot size={15} />,
      },
      {
        id: 'canvas',
        group: 'Agentic & Cloud',
        label: 'Open Artifact Canvas',
        hint: 'Live code editor and preview iframe',
        icon: <Code2 size={15} />,
      },
      {
        id: 'invite',
        group: 'Collaboration',
        label: 'Invite Friends & Multiplayer Collaboration',
        hint: 'Multiplayer room share & co-piloting',
        icon: <UserPlus size={15} />,
      },
      {
        id: 'rail',
        group: 'Chat',
        label: 'Show conversations',
        hint: 'Open the left column',
        icon: <PanelLeft size={15} />,
      },
      {
        id: 'settings',
        group: 'You',
        label: 'Settings',
        hint: 'Model, appearance, account',
        icon: <Settings size={15} />,
      },
    ]

    if (standing === 'live') {
      list.push(
        {
          id: 'account',
          group: 'You',
          label: 'Account',
          hint: 'Manage your identity',
          icon: <UserRound size={15} />,
        },
        { id: 'signout', group: 'You', label: 'Log out', icon: <LogOut size={15} /> },
      )
    } else {
      list.push({ id: 'signin', group: 'You', label: 'Log in', icon: <LogIn size={15} /> })
    }

    return list
  }, [standing])

  const run = useCallback(
    (op: Op) => {
      switch (op.id) {
        case 'new':
          navigate('/')
          break
        case 'projects':
        case 'orgs':
        case 'users':
          projectsStore.open()
          break
        case 'plugins':
          pluginsStore.open()
          break
        case 'skills':
          skillsStore.open()
          break
        case 'connectors':
          connectorsStore.open()
          break
        case 'automations':
          automationsStore.open()
          break
        case 'terminal':
          terminalStore.toggle()
          break
        case 'meet':
          workspaceAppsStore.open('meet')
          break
        case 'notes':
          workspaceAppsStore.open('notes')
          break
        case 'tunnel':
          workspaceAppsStore.open('tunnel')
          break
        case 'tasks':
          taskQueueStore.open()
          break
        case 'boards':
          boardStore.open()
          break
        case 'mcp':
          mcpStore.open()
          break
        case 'intelligence':
          intelligenceStore.open()
          break
        case 'builder':
          onOpenAgentBuilder?.()
          break
        case 'canvas':
          artifactStore.open({
            title: 'Untitled Sandbox',
            code: '// Write TypeScript, TSX or HTML code here\nconsole.log("Hello from Hanzo Sandbox!");',
            language: 'typescript',
          })
          break
        case 'invite':
          multiplayerStore.openInvite()
          break
        case 'rail':
          onRail()
          break
        case 'settings':
          onSettings()
          break
        case 'account':
          window.open(api.iam.account, '_blank', 'noopener')
          break
        case 'signin':
          void signIn()
          break
        case 'signout':
          void signOut()
          break
      }
    },
    [navigate, onOpenAgentBuilder, onRail, onSettings, signIn, signOut],
  )

  return <Bar open={open} onOpenChange={setOpen} ops={ops} onRun={run} />
}
