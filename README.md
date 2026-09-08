<p align="center"><img src=".github/hero.svg" alt="desktop" width="880"></p>

<h1 align="center">
<img width="36" height="36" src="assets/icon.png"/>
  Hanzo
  </h1>
<div align="center">

> Create Powerful AI Agents using local or remote AIs

</div>

<p align="center">
  <img src="https://img.shields.io/badge/Windows-compatible-success?logo=windows&logoColor=white" alt="Windows compatible">
  <img src="https://img.shields.io/badge/Linux-compatible-success?logo=linux&logoColor=white" alt="Linux compatible">
  <img src="https://img.shields.io/badge/macOS-Apple Silicon compatible-success?logo=apple&logoColor=white" alt="macOS Apple Silicon compatible">
</p>

<p align="center">
  <a href="https://github.com/hanzoai/desktop/stargazers"><img src="https://img.shields.io/github/stars/hanzoai/desktop?style=social" alt="GitHub stars"></a>
  <a href="https://discord.gg/CJCyAsm9Vr"><img src="https://img.shields.io/badge/Discord-join-7289DA?logo=discord&logoColor=white" alt="Discord"></a>
  <a href="https://x.com/hanzoai"><img src="https://img.shields.io/twitter/follow/hanzoai?style=social" alt="Twitter Follow"></a>
</p>

<p align="center">
  <strong>Build collaborative AI agents that work together, handle payments, and automate complex workflows</strong>
  <br/>
  Hanzo is a free, open-source platform that democratizes AI agent creation.
  No coding required – just drag, drop, and deploy intelligent agents that can work across platforms and handle real-world tasks.
</p>

<p align="center">
  <a href="#-features">Features</a> •
  <a href="#-demo">Demo</a> •
  <a href="#-examples">Examples</a> •
  <a href="#-quick-start">Quick Start</a> •
  <a href="#-development">Development</a> •
  <a href="https://docs.hanzo.ai">Documentation</a>
</p>

---

## 🚀 Features

**🎯 No-Code Agent Builder** – Create specialized AI agents in minutes through an intuitive visual interface. No programming experience needed.

**🤖 Multi-Agent Orchestration** – Deploy teams of agents that collaborate, share context, and coordinate complex multi-step workflows automatically.

**💰 Crypto-Native Architecture** – Built-in support for decentralized payments, DeFi interactions, and autonomous economic agents that can transact independently.

**🔗 Universal Protocol Support** – Seamlessly integrates with Model Context Protocol (MCP), making your agents compatible with Claude, Cursor, and the broader AI ecosystem.

**⚡ Hybrid Deployment** – Run everything locally for maximum privacy, connect to cloud models for enhanced capabilities, or combine both approaches as needed.

**🔐 Security-First Design** – Your crypto keys, sensitive data, and computations remain under your control with local-first architecture.

**🌐 Cross-Platform Compatibility** – Works on Windows, macOS, and Linux with consistent performance and user experience.

## 🎬 Demo

[![Hanzo Desktop — 31s demo](assets/hero-poster.png)](https://github.com/hanzoai/desktop/raw/main/assets/hero.mp4)

_Click to play — 31s, recorded from this commit's own frontend: onboarding,
the workspace, the Zen models, light and back, then every section. The still is
a frame of that same film,
so the poster cannot promise a screen the video does not show. Regenerate both
with `pnpm film && pnpm film:masters`. (GitHub plays video inline only for
assets uploaded through its own attachment flow, hence the poster-and-link.)_

## 📋 Examples

**💹 Autonomous Trading Bot** – Deploy an agent that monitors social sentiment, analyzes market trends, and executes trades based on predefined strategies.

**📧 Intelligent Email Assistant** – Create an agent that categorizes incoming emails, drafts contextual responses, and automatically schedules follow-ups.

**📊 Data Intelligence Agent** – Build agents that scrape web data, perform trend analysis, and generate comprehensive reports with actionable insights.

**🔄 Workflow Automation Hub** – Orchestrate multiple specialized agents that handle different components of complex business processes seamlessly.

**🏦 DeFi Portfolio Manager** – Set up agents that monitor your crypto investments, rebalance portfolios, and execute yield farming strategies.

## 🚀 Quick Start

### One-Click Installation

1. **Download** the latest release for your platform from our [releases page](https://github.com/hanzoai/desktop/releases)
2. **Install** and launch Hanzo
3. **Create** your first AI agent using our step-by-step guided interface

### System Requirements

- **Memory**: 4GB RAM minimum (8GB recommended)
- **Storage**: 2GB free space
- **OS**: Windows 10+, macOS 10.15+, or Linux (Ubuntu 20.04+)

---

## 🛠 Development

### Architecture Overview

Hanzo is built as a modern monorepo using **NX** for orchestration and dependency management. The architecture consists of:

**Core Applications:**

- **hanzo-desktop** – Cross-platform Tauri application with React frontend

**Shared Libraries:**

- **hanzo-message-ts** – Message protocols and network communication with Hanzo Node
- **hanzo-node-state** – React Query-based state management for node data
- **hanzo-ui** – Reusable React components with design system
- **hanzo-artifacts** – Styled UI primitives built on Radix and Tailwind CSS
- **hanzo-i18n** – Internationalization utilities powered by i18next

**Technology Stack:**

- **Frontend**: React 18, TypeScript, Tailwind CSS, Radix UI
- **Desktop**: Tauri (Rust + React)
- **State Management**: Zustand (UI state) + React Query (server state)
- **Build System**: Vite, NX monorepo
- **Testing**: Vitest, React Testing Library

### 🚀 Getting Started

#### 1. Clone and Setup

```bash
git clone https://github.com/hanzoai/desktop
cd desktop
nvm use
npm ci
```

#### 2. Fetch the side binaries

The app spawns a Hanzo Node beside itself, so the node binary and the embedding
model have to be on disk before Tauri can bundle them. One command, every
platform — it reads your OS and architecture, and takes the release from
`apps/hanzo-desktop/src-tauri/pins`:

```bash
cd apps/hanzo-desktop && pnpm download-binaries
```

`pnpm dev` and `pnpm build` run it for you; the command above is for fetching
ahead of time, or after changing the pin. To move to a different node release,
edit `pins` — no other file names a version.

### 📦 Essential Commands

#### Development Server

```bash
# Run desktop app (recommended for development)
npx nx serve:tauri hanzo-desktop
```

#### Building

```bash
# Build desktop application
npx nx build hanzo-desktop

# Create development build
NODE_OPTIONS="--max_old_space_size=8192" npx nx build hanzo-desktop --config="./src-tauri/tauri.conf.development.json"

# Build all projects
npx nx run-many --target=build
```

#### Third party data and repository management

```bash
# Update the built-in Ollama models repository. This repository contains model definitions, tags and metadata for all supported AI models. The command below regenerates the repository files to ensure compatibility with the latest Ollama version and model updates
npx ts-node ./ci-scripts/generate-ollama-models-repository.ts

# Generate Composio apps repository - This script regenerates the repository of pre-built Composio apps and templates that users can import into Hanzo. It ensures the app catalog stays up-to-date with the latest official releases.
deno run -A ./ci-scripts/composio-repository/main.ts

# Generate translations for all languages (EN, ES, etc.)
# This command uses AI to automatically generate translations for all supported languages based on the primary i18n source file (English).
# It ensures consistent translations across the entire application while maintaining natural language quality.

npx nx run hanzo-i18n:i18n
```

#### Testing & Quality

```bash
# Run tests
npx nx test [project-name]
npx nx run-many --target=test

# Lint code
npx nx lint [project-name]
npx nx run-many --target=lint
```

### 🏗 Project Structure

```
desktop/
├── apps/
│   └── hanzo-desktop/          # Main desktop application
├── libs/
│   ├── hanzo-message-ts/       # Core messaging protocol
│   ├── hanzo-node-state/       # State management
│   ├── hanzo-ui/               # Component library
│   ├── hanzo-artifacts/        # UI primitives
│   └── hanzo-i18n/             # Internationalization
├── ci-scripts/                   # Build and deployment scripts
└── tools/                        # Development utilities
```

### 🎨 UI Development Guidelines

**Component Libraries:**

- **Radix UI** – Unstyled, accessible component primitives
- **Tailwind CSS** – Utility-first styling and responsive design
- **Shadcn/ui** – Pre-built component patterns

**State Management:**

- **Zustand** – Client-side UI state management
- **React Query** – Server state, caching, and synchronization

### 🌍 Internationalization

<p align="start">
  <img src="https://img.shields.io/badge/English-supported-success?logo=alphabet&logoColor=white" alt="English supported">
  <img src="https://img.shields.io/badge/Español-supported-success?logo=alphabet&logoColor=white" alt="Spanish supported">
  <img src="https://img.shields.io/badge/中文-supported-success?logo=alphabet&logoColor=white" alt="Chinese supported">
  <img src="https://img.shields.io/badge/粵語-supported-success?logo=alphabet&logoColor=white" alt="Cantonese supported">
  <img src="https://img.shields.io/badge/日本語-supported-success?logo=alphabet&logoColor=white" alt="Japanese supported">
  <img src="https://img.shields.io/badge/한국어-supported-success?logo=alphabet&logoColor=white" alt="Korean supported">
  <img src="https://img.shields.io/badge/Bahasa Indonesia-supported-success?logo=alphabet&logoColor=white" alt="Indonesian supported">
  <img src="https://img.shields.io/badge/Türkçe-supported-success?logo=alphabet&logoColor=white" alt="Turkish supported">
</p>

Hanzo supports multiple languages through our i18n system:

```bash
# Add new translation keys
# Edit files in libs/hanzo-i18n/locales/

# Generate updated translation types
npx nx run hanzo-i18n:i18n

# Supported languages: en-US, es-ES, zh-CN, zh-HK, ko-KR, ja-JP, id-ID, tr-TR
```

### 🤝 Contributing

1. **Fork** the repository
2. **Create** a feature branch: `git checkout -b feature/amazing-feature`
3. **Commit** your changes: `git commit -m 'Add amazing feature'`
4. **Push** to the branch: `git push origin feature/amazing-feature`
5. **Open** a Pull Request

### 📚 Additional Resources

- **[Official Documentation](https://docs.hanzo.ai)** – Comprehensive guides and API reference
- **[Discord Community](https://discord.gg/CJCyAsm9Vr)** – Get help and connect with other developers
- **[Twitter Updates](https://x.com/hanzoai)** – Latest news and announcements

---

<p align="center">
  <strong>Built with ❤️ by the Hanzo community</strong>
  <br/>
  <a href="https://github.com/hanzoai/desktop/blob/main/LICENSE">Apache License</a> •
  <a href="https://github.com/hanzoai/desktop/issues">Report Bug</a> •
  <a href="https://github.com/hanzoai/desktop/issues">Request Feature</a>
</p>
