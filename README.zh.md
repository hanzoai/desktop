<H1 Align =“ Center”>
<img width =“ 36” height =“ 36” src =“资产/iCon.png”/>
Hanzo
</ h1>
<div align =“中心”>

> 使用本地或远程AIS创建强大的AI代理

</div>

<p align =“中心”>
<img src =“ https://img.shields.io/badge/windows-compatible-success?logo = windows&logocolor = white” alt =“ Windows compatible”>
<img src =“ https://img.shields.io/badge/linux-compatible-success?logo = linux&logocolor = white” alt =“ linux compatible”>
<img src =“ https://img.shields.io/badge/macos-apple硅
</p>

<p align =“中心”>
<a href =“ https://github.com/dcspark/hanzo-desktop/stargazers”> <img src =“ https://img.shields.io/github/github/github/dcspark/dcspark/dcspark/hanzo-hanzo-desktop?style=social=Social=Social=Social alt alt alt alt =”
<A href =“ https://discord.gg/eua45u3seu”> <img src =“ https://img.shields.io/discord/1303749220842340412？alt =“ Discord”> </a>
<a href =“ https://x.com/hanzolocalai”> <img src =“ https://img.shields.io/twitter/twitter/twitter/follow/hanzolocalai?style?style=social = social” alt alt =“ twitter” twitter cont
</p>

<p align =“中心”>
<strong>建立协作AI代理，可以一起工作，处理付款和自动化复杂工作流程</strong>
<br/>
Hanzo是一个免费的开源平台，使AI代理创建民主化。
无需编码 - 只需拖动，掉落和部署可以跨平台工作并处理现实世界任务的智能代理。
</p>

<p align =“中心”>
在以下内容中阅读此信息：
<a href="README.zh.md">简体中文</a> |
<a href="README.zh-HK.md">粤语</a> |
<a href =“ readme.ko.md”>韩文</a> |
<a href =“ readme.ja.md”>日语</a> |
<a href =“ readme.es.md”>español</a>
</p>

<p align =“中心”>
<a href =“＃ - 功能”>功能</a>•
<a href =“＃ - 演示”> demo </a>•
<a href =“＃ - 示例”>示例</a>•
<a href =“＃ - 快速启动”>快速启动</a>•
<a href =“＃ - 开发”>开发</a>•
<a href =“ https://docs.hanzo.ai”>文档</a>
</p>

---

##🚀功能

**🎯无代理构建器** - 通过直观的视觉界面在几分钟内创建专业的AI代理。无需编程经验。

**🤖多代理编排** - 部署代理团队，它们会自动协作，共享上下文和协调复杂的多步骤工作流程。

**💰加密本地体系结构** - 对分散付款，Fefi互动和可以独立交易的自治经济代理人的内置支持。

**🔗通用协议支持** - 与模型上下文协议（MCP）无缝集成，使您的代理与Claude，Cursor和更广泛的AI生态系统兼容。

**⚡混合部署** - 在本地运行所有内容以获得最大的隐私，连接到云模型以增强功能，或根据需要组合这两种方法。

**🔐安全优先设计** - 您的加密密钥，敏感数据和计算在本地优先架构中保持在您的控制之下。

**🌐跨平台兼容性** - 在Windows，MacOS和Linux上工作，具有一致的性能和用户体验。

##🎬演示

[！[demo Video]（Assets/hanzo-screenshot.png）]（https://github.com/user-user-attachments/assets/bc5bbb7da-7ca5-7ca5-477d-838a-a-8238a-8239951b6c01）

\_watch Hanzo代理商合作分析市场数据，执行交易并自动管理复杂工作流程。

##📋示例

**💹自动交易机器人** - 部署一种监视社会情绪，分析市场趋势并根据预定义务策略执行交易的代理商。

**📧智能电子邮件助理** - 创建一个代理，该代理将传入的电子邮件，草稿上下文响应以及自动安排后续行动进行分类。

**📊数据情报代理** - 构建刮擦Web数据，执行趋势分析并通过可行的见解生成全面报告的代理。

**🔄工作流动自动化中心** - 编排多种专门处理复杂业务流程的不同组件的专用代理。

**🏦defi投资组合经理** - 设置代理商来监视您的加密货币投资，重新平衡投资组合并执行产量耕作策略。

##🚀快速开始

###一键安装

1。**下载**您的平台的最新版本从我们的[发行页]（https://github.com/dcspark/hanzo-desktop/releases）
2。**安装**并启动Hanzo
3。**创建**您的第一个AI代理使用我们的分步导界面

###系统要求

- **内存**：4GB RAM最低（建议8GB）
- **存储**：2GB自由空间
- ** OS **：Windows 10+，MacOS 10.15+或Linux（Ubuntu 20.04+）

---

##🛠开发

###架构概述

Hanzo是用** nx **进行编排和依赖管理的现代Monorepo建造的。该体系结构包括：

**核心应用程序：**

- ** hanzo-desktop ** - 跨平台陶里（Tauri Tauri）应用于React前端

**共享库：**

- ** Hanzo-Message-TS ** - 消息协议和与Hanzo节点的网络通信
- ** Hanzo-Node-State ** - 基于REACT查询的节点数据的状态管理
- ** Hanzo-UI ** - 可重复使用的反应组件与设计系统
- ** Hanzo-Artifacts ** - 构建基于Radix和Tailwind CSS的样式的UI原语
- ** hanzo-i18n ** - 由I18Next提供支持的国际化公用事业

**技术堆栈：**

- **前端**：React 18，打字稿，尾风CSS，Radix UI
- **桌面**：Tauri（Rust + React）
- **状态管理**：Zustand（UI状态） + React Query（服务器状态）
- **构建系统**：Vite，NX Monorepo
- **测试**：vitest，React测试库

###🚀入门

#### 1。克隆和设置

```bash
git clone https://github.com/hanzo-ai/hanzo-desktop
cd hanzo-desktop
nvm use
npm ci
```

#### 2。下载必需的侧二进制

在运行Hanzo之前，您需要下载为应用程序的核心功能提供动力的嵌入式Hanzo节点二进制文件。这可以通过基于您的平台的单个命令来完成：

** macos（苹果硅）：**

```bash
ARCH="aarch64-apple-darwin" \
HANZO_NODE_VERSION="v1.1.20" \
OLLAMA_VERSION="v0.12.3" \
npx ts-node ./ci-scripts/download-side-binaries.ts
```

** linux：**

```bash
ARCH="x86_64-unknown-linux-gnu" \
OLLAMA_VERSION="v0.12.3" \
HANZO_NODE_VERSION="v1.1.20" \
npx ts-node ./ci-scripts/download-side-binaries.ts
```

**视窗：**

```powershell
$ENV:OLLAMA_VERSION="v0.12.3"
$ENV:HANZO_NODE_VERSION="v1.1.20"
$ENV:ARCH="x86_64-pc-windows-msvc"
npx ts-node ./ci-scripts/download-side-binaries.ts
```

###📦基本命令

####开发服务器

```bash
# Run desktop app (recommended for development)
npx nx serve:tauri hanzo-desktop
```

＃＃＃＃ 建筑

```bash
# Build desktop application
npx nx build hanzo-desktop

# Create development build
NODE_OPTIONS="--max_old_space_size=8192" npx nx build hanzo-desktop --config="./src-tauri/tauri.conf.development.json"

# Build all projects
npx nx run-many --target=build
```

####第三方数据和存储库管理

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

####测试和质量

```bash
# Run tests
npx nx test [project-name]
npx nx run-many --target=test

# Lint code
npx nx lint [project-name]
npx nx run-many --target=lint
```

###🏗项目结构

```
hanzo-desktop/
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

###🎨UI开发指南

**组件库：**

- ** radix ui ** - 未风格的，可访问的组件原始图
- ** tailwind CSS ** - 公用事业领先的样式和响应式设计
- ** shadcn/ui ** - 预构建的组件模式

**国家管理：**

- **条件** - 客户端UI状态管理
- ** REACT查询** - 服务器状态，缓存和同步

###🌍国际化

<p align =“ start”>
<img src =“ https://img.shields.io/badge/english-supported-success?logo=alphabet&logocolor=white = White” Alt =“英语支持”>
<img src =“https://img.shields.io/badge/español-supported-success?logo=alphabet&logocolor=white”
<img src =“ https://img.shields.io/badge/- supported-success？logo = alphabet＆logocolor = white = white“ alt =“中文支持”>
<img src =“ https://img.shields.io/badge/-- supported-success？logo = alphabet＆logocolor = white = white” alt =“ ant =“ cantonese supported”>
<img src =“ https://img.shields.io/badge/-- supported-success？logo = alphabet＆logocolor = white = white“ alt =“日本支持”>
<img src =“ https://img.shields.io/badge/-- supported-success？logo = alphabet＆logocolor = white = white'
<img src =“ https://img.shields.io/badge/bahasa indonesia-supported-success？logo = alphabet＆logocolor = white = white“ alt alt =“印度尼西亚支持”>
<img src =“https://img.shields.io/badge/türkçe-supported-success?logo= alphabet＆logogocolor=white = white” alt =“ turkish”
</p>

Hanzo通过我们的I18N系统支持多种语言：

```bash
# Add new translation keys
# Edit files in libs/hanzo-i18n/locales/

# Generate updated translation types
npx nx run hanzo-i18n:i18n

# Supported languages: en-US, es-ES, zh-CN, zh-HK, ko-KR, ja-JP, id-ID, tr-TR
```

###🤝贡献

1。**叉**存储库
2。**创建**功能分支：`git Checkout -b feature/Amazing -feature`
3。**提交您的更改：`git commit -m'添加惊人的功能
4。
5。**打开\*\*拉动请求

###📚其他资源

- ** [官方文档]（https://docs.hanzo.ai）** - 全面的指南和API参考
- ** [DISCORD社区]（https：//discord.gg/eua45u3seu）** - 获得帮助并与其他开发人员建立联系
- ** [Twitter更新]（https://x.com/hanzolocalai）** - 最新新闻和公告

---

<p align =“中心”>
<strong>由Hanzo Community建造的❤️</strong>
<br/>
<a href =“ https://github.com/dcspark/hanzo-desktop/blob/main/license”> apache许可证</a>•
<a href =“ https://github.com/dcspark/hanzo-desktop/issues”>报告错误</a>•
<a href =“ https://github.com/dcspark/hanzo-desktop/issues”>请求功能</a>
</p>
