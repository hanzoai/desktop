#!/usr/bin/env node
// Download the external binaries the app bundles from download.hanzo.ai
// (Cloudflare R2) instead of committing large executables to git.
//
// One script for every platform — macOS, Linux and Windows alike — so it is
// Node, not a shell script: `pnpm` runs package scripts through cmd.exe on
// Windows, which cannot execute a `.sh`, and the `bash` first on a Windows PATH
// is usually WSL's, which would fetch the LINUX binaries into a Windows tree.
//
// Usage: node src-tauri/download-binaries.mjs   (or `pnpm download-binaries`)

import { createWriteStream, existsSync, readFileSync } from 'node:fs';
import { chmod, mkdir, rename, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';
import { extract } from 'zip-lib';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const BINARIES_DIR = join(SCRIPT_DIR, 'external-binaries');
const LLM_MODELS_DIR = join(SCRIPT_DIR, 'llm-models');
const NODE_DIR = join(BINARIES_DIR, 'hanzo-node');

const PLATFORMS = { darwin: 'apple-darwin', linux: 'unknown-linux-gnu', win32: 'pc-windows-msvc' };
const ARCHES = { x64: 'x86_64', arm64: 'aarch64' };

const platform = PLATFORMS[process.platform];
const arch = ARCHES[process.arch];
if (!platform) fail(`Unsupported OS: ${process.platform}`);
if (!arch) fail(`Unsupported architecture: ${process.arch}`);

const TARGET = `${arch}-${platform}`;
const EXT = process.platform === 'win32' ? '.exe' : '';
console.log(`Detected platform: ${TARGET}`);

// Which release to fetch. One home, read here and named nowhere else.
const pins = Object.fromEntries(
  readFileSync(join(SCRIPT_DIR, 'pins'), 'utf8')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'))
    .map((line) => line.split('=').map((s) => s.trim())),
);
const { HANZO_NODE_VERSION } = pins;
if (!HANZO_NODE_VERSION) fail('pins has no HANZO_NODE_VERSION');

function fail(message) {
  console.error(message);
  process.exit(1);
}

/** Stream `url` to `dest`, through a `.part` file so a cut download never passes for a whole one. */
async function download(url, dest) {
  console.log(`Downloading from: ${url}`);
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok || !res.body) throw new Error(`${url} answered ${res.status}`);
  const part = `${dest}.part`;
  await pipeline(Readable.fromWeb(res.body), createWriteStream(part));
  await rename(part, dest);
}

await mkdir(join(NODE_DIR, 'hanzo-tools-runner-resources'), { recursive: true });
await mkdir(LLM_MODELS_DIR, { recursive: true });

// Hanzo Node, with deno and uv under hanzo-tools-runner-resources.
//
// Tauri resolves a sidecar by the name in tauri.conf.json plus the target
// triple, so each binary the archive carries is renamed once, here. The archive
// names them with the platform's own extension — hanzo-node.exe on Windows —
// and the suffix goes BEFORE it: hanzo-node-x86_64-pc-windows-msvc.exe.
const SIDECARS = ['hanzo-node', 'hanzo-tools-runner-resources/deno', 'hanzo-tools-runner-resources/uv'];

if (!existsSync(join(NODE_DIR, `hanzo-node-${TARGET}${EXT}`))) {
  console.log(`Downloading Hanzo Node ${HANZO_NODE_VERSION} for ${TARGET}...`);
  const url = `https://download.hanzo.ai/hanzo-node/binaries/production/${TARGET}/${HANZO_NODE_VERSION}.zip`;
  const zip = join(NODE_DIR, 'hanzo-node.zip');
  try {
    await download(url, zip);
    await extract(zip, NODE_DIR);
    for (const s of SIDECARS) {
      const src = join(NODE_DIR, `${s}${EXT}`);
      const dst = join(NODE_DIR, `${s}-${TARGET}${EXT}`);
      if (!existsSync(src)) fail(`Archive is missing ${s}${EXT}`);
      await rename(src, dst);
      if (!EXT) await chmod(dst, 0o755);
    }
    await rm(zip, { force: true });
    console.log('Downloaded Hanzo Node successfully with bundled tools');
  } catch (e) {
    fail(`Failed to download Hanzo Node binary: ${e.message}`);
  }
} else {
  console.log('Hanzo Node already downloaded');
}

// Ollama dropped per zoo/universe architecture: AI inference + embeddings go
// through the brand inference endpoint (cloud or hanzo-engine), not a bundled
// local LLM runner.
//
// The hanzo-ml `soup` CLI is not fetched: nothing has been published under
// hanzo-ml/. src/model_tools/soup.rs finds the binary via HANZO_SOUP_BIN, or
// beside the app executable, or on PATH.

const EMBEDDING_MODEL = 'embeddinggemma-300M-BF16.gguf';
if (!existsSync(join(LLM_MODELS_DIR, EMBEDDING_MODEL))) {
  console.log('Downloading embedding model...');
  try {
    await download(`https://download.hanzo.ai/llm-models/${EMBEDDING_MODEL}`, join(LLM_MODELS_DIR, EMBEDDING_MODEL));
    console.log('Downloaded embedding model successfully');
  } catch (e) {
    fail(`Failed to download embedding model: ${e.message}`);
  }
} else {
  console.log('Embedding model already downloaded');
}

console.log('');
console.log('Binary download complete!');
console.log(`Binaries are located in: ${BINARIES_DIR}`);
console.log(`LLM models are located in: ${LLM_MODELS_DIR}`);
