import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GuiProvider } from '@hanzo/gui';

import config from '../../gui.config';

// The engine is reached only through Tauri commands (src-tauri/src/local_models.rs);
// these stand in for them.
const invoke = vi.fn();
const listeners = new Map<string, (e: { payload: unknown }) => void>();
vi.mock('@tauri-apps/api/core', () => ({ invoke: (...a: unknown[]) => invoke(...a) }));
vi.mock('@tauri-apps/api/event', () => ({
  listen: async (name: string, cb: (e: { payload: unknown }) => void) => {
    listeners.set(name, cb);
    return () => listeners.delete(name);
  },
}));
const openUrl = vi.fn(async () => undefined);
vi.mock('@tauri-apps/plugin-opener', () => ({ openUrl: (u: string) => openUrl(u) }));

import {
  buildLocalModelsCatalogResponse,
  handleLocalChatCompletion,
  LocalAiManager,
  openLocalAiManager,
} from '../local-ai';
import {
  CANCELLED,
  ENGINE_RELEASES_URL,
  fitsThisMac,
  formatSize,
  memoryNeededGb,
  overall,
  type EngineStatus,
  waitForEngine,
} from '../lib/local-models';

import { keychain } from '../keychain';

const NANO = 'zenlm/zen-nano-0.6b';
const base: EngineStatus = {
  engine: '/Users/x/.local/bin/hanzo-engine',
  cache_dir: '/Users/x/.cache/huggingface/hub',
  installed: [],
  pulling: null,
  serving: null,
  serve_error: null,
};

/** A desktop window whose engine answers `status`; other commands answer `answers[cmd]`. */
function desktop(status: () => EngineStatus, answers: Record<string, (args: any) => unknown> = {}) {
  (window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ = {};
  invoke.mockImplementation(async (cmd: string, args: unknown) => {
    if (cmd === 'local_models_status') return status();
    if (answers[cmd]) return answers[cmd](args);
    if (cmd === 'hardware_get_summary') return { hardware: { memory: 8 } };
    return undefined;
  });
}

async function openScreen() {
  render(
    <GuiProvider config={config} defaultTheme="dark">
      <LocalAiManager />
    </GuiProvider>,
  );
  act(() => openLocalAiManager('models'));
  await waitFor(() => expect(screen.getByTestId('local-ai-status').textContent).not.toMatch(/Checking/));
}

const nanoCard = () => screen.getAllByTestId('local-ai-model-zen-nano:0.6b')[0];

beforeEach(() => {
  vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Load failed'));
});

afterEach(() => {
  vi.restoreAllMocks();
  invoke.mockReset();
  listeners.clear();
  delete (window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__;
  window.localStorage.clear();
});

describe('the model list', () => {
  it('serves local AI models with free tier access, includes Zen 6 SKUs, and excludes zen4/zen5/qwen2 models', async () => {
    const body = await buildLocalModelsCatalogResponse();
    expect(body.object).toBe('list');
    const ids = body.data.map((m) => String(m.id));
    expect(ids).toContain('enso-free');
    expect(ids).toContain('zen6:8b');
    expect(ids).toContain('zen-vl:8b');
    expect(ids.some((id) => /zen[45]|qwen2/i.test(id))).toBe(false);
    for (const model of body.data) expect(model.class).toBe('free');
  });

  it('judges memory and size the way the cards say them', () => {
    expect(memoryNeededGb(1_208_033_536)).toBe(3);
    expect(fitsThisMac(1_208_033_536, 8)).toBe(true);
    expect(fitsThisMac(4_079_450_110, 8)).toBe(false);
    expect(formatSize(1_208_033_536)).toBe('1.2 GB');
    expect(formatSize(727_119_969)).toBe('727 MB');
    expect(overall(null).kind).toBe('app-only');
    expect(overall({ ...base, engine: null }).kind).toBe('no-engine');
    expect(overall({ ...base, serving: NANO })).toEqual({ kind: 'running', repo: NANO });
  });
});

describe('the Local AI screen', () => {
  it('in a plain browser says local models need the desktop app, in plain words', async () => {
    await openScreen();
    const status = screen.getByTestId('local-ai-status').textContent ?? '';
    expect(status).toMatch(/Local models are not set up/);
    const text = screen.getByTestId('local-ai-manager-modal').textContent ?? '';
    expect(text).not.toMatch(/zen[45]|qwen2|Ollama|11434|hanzod|Hanzo Node|Inference Engine/i);
    expect((screen.getByTestId('local-ai-search-input') as HTMLInputElement).placeholder).toBe(
      'Search models (zen, qwen3, coder…)',
    );
  });

  it('with no engine installed says what is missing and offers the one thing that fixes it', async () => {
    desktop(() => ({ ...base, engine: null }));
    await openScreen();
    expect(screen.getByTestId('local-ai-status').textContent).toMatch(/engine, which runs models on this computer, is not installed/);
    fireEvent.click(screen.getByText('Get Hanzo’s engine'));
    expect(openUrl).toHaveBeenCalledWith(ENGINE_RELEASES_URL);
  });

  it('tells a signed-in reader that chat still uses the cloud, and says nothing of it to a guest', async () => {
    desktop(() => ({ ...base, installed: [{ repo: NANO, bytes: 1_208_031_405 }] }));
    keychain.setItem('hanzo_iam_access_token', 'held');
    try {
      await openScreen();
      expect(screen.getByTestId('local-ai-signed-in-note').textContent).toMatch(
        /chat uses Hanzo’s cloud models.*without\s+signing in/s,
      );
    } finally {
      keychain.removeItem('hanzo_iam_access_token');
    }
  });

  it('opens on a signed-out pick of a model not on this computer, and never for a signed-in person', async () => {
    desktop(() => base);
    render(
      <GuiProvider config={config} defaultTheme="dark">
        <LocalAiManager />
      </GuiProvider>,
    );
    const pick = async () => {
      window.localStorage.setItem('hanzo.mind', JSON.stringify({ model: 'zen-nano:0.6b' }));
      await act(async () => {
        window.dispatchEvent(new Event('hanzo:mind'));
        await new Promise((r) => setTimeout(r, 0));
      });
    };
    // The token lives in the in-memory keychain, not localStorage.
    keychain.setItem('hanzo_iam_access_token', 'held');
    try {
      await pick();
      expect(screen.queryByTestId('local-ai-manager-modal')).toBeNull();
    } finally {
      keychain.removeItem('hanzo_iam_access_token');
    }
    await pick();
    await waitFor(() => expect(screen.getByTestId('local-ai-manager-modal')).toBeTruthy());
  });

  it('says nothing about signing in to a guest', async () => {
    desktop(() => ({ ...base, installed: [{ repo: NANO, bytes: 1_208_031_405 }] }));
    await openScreen();
    expect(screen.queryByTestId('local-ai-signed-in-note')).toBeNull();
  });

  it('downloads with real progress on the card, then shows the model as downloaded', async () => {
    let installed: EngineStatus['installed'] = [];
    let finish!: () => void;
    desktop(() => ({ ...base, installed }), {
      local_models_pull: () =>
        new Promise<void>((done) => {
          finish = () => {
            installed = [{ repo: NANO, bytes: 1_208_033_536 }];
            done();
          };
        }),
    });
    await openScreen();
    expect(screen.getByTestId('local-ai-status').textContent).toMatch(/Ready.*Nothing downloaded yet/);
    fireEvent.click(screen.getAllByLabelText('Download Zen Nano')[0]);
    await waitFor(() => expect(invoke).toHaveBeenCalledWith('local_models_pull', { repo: NANO }));
    act(() => listeners.get('local-models-progress')?.({ payload: { repo: NANO, done: 42, total: 100 } }));
    expect(nanoCard().textContent).toMatch(/Downloading 42%/);
    expect(screen.getAllByLabelText('Cancel downloading Zen Nano').length).toBeGreaterThan(0);
    await act(async () => finish());
    await waitFor(() => expect(nanoCard().textContent).toMatch(/Downloaded/));
    expect(screen.getAllByLabelText('Use Zen Nano').length).toBeGreaterThan(0);
    expect(screen.getByTestId('local-ai-status').textContent).toMatch(/1 model downloaded/);
  });

  it('puts a failed download on its own card with a retry', async () => {
    desktop(() => base, {
      local_models_pull: () =>
        Promise.reject('This computer could not reach the model library. Check the internet connection and try again.'),
    });
    await openScreen();
    fireEvent.click(screen.getAllByLabelText('Download Zen Nano')[0]);
    const alert = await screen.findAllByTestId('local-ai-pull-error');
    expect(alert[0].getAttribute('role')).toBe('alert');
    expect(alert[0].textContent).toMatch(/could not reach the model library/);
    expect(nanoCard().textContent).toMatch(/Try again/);
  });

  it('says nothing went wrong when the person cancels', async () => {
    desktop(() => base, { local_models_pull: () => Promise.reject(CANCELLED) });
    await openScreen();
    fireEvent.click(screen.getAllByLabelText('Download Zen Nano')[0]);
    await waitFor(() => expect(invoke).toHaveBeenCalledWith('local_models_pull', { repo: NANO }));
    await waitFor(() => expect(screen.queryByTestId('local-ai-pull-error')).toBeNull());
  });

  it('Use starts the engine on that model and Remove deletes it', async () => {
    let serving: string | null = null;
    // Its folder also holds another tool's GGUF copies: Remove deletes those too.
    let installed = [{ repo: NANO, bytes: 1_208_033_536, folder_bytes: 7_812_000_000 }];
    desktop(() => ({ ...base, installed, serving }), {
      local_models_serve: ({ repo }) => {
        serving = repo;
      },
      local_models_remove: () => {
        installed = [];
        serving = null;
      },
    });
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('ok', { status: 200 }));
    await openScreen();
    fireEvent.click(screen.getAllByLabelText('Use Zen Nano')[0]);
    await waitFor(() => expect(screen.getByTestId('local-ai-status').textContent).toMatch(/Running Zen Nano/));
    expect(invoke).toHaveBeenCalledWith('local_models_serve', { repo: NANO });
    expect(JSON.parse(window.localStorage.getItem('hanzo.mind') ?? '{}').model).toBe('zen-nano:0.6b');
    fireEvent.click(screen.getAllByLabelText('Remove Zen Nano')[0]);
    // Asked first, with the size and who else loses it; nothing is deleted yet.
    const ask = await screen.findByTestId('local-ai-remove-confirm');
    expect(ask.textContent).toMatch(/Remove Zen Nano\?/);
    expect(ask.textContent).toMatch(/deletes 7\.8 GB from this computer/);
    expect(ask.textContent).toMatch(/Other programs that use the same model .* lose it too/);
    expect(invoke).not.toHaveBeenCalledWith('local_models_remove', expect.anything());
    // eslint-disable-next-line no-console
    // gui renders a native <dialog> without `open` in jsdom, so its buttons count as hidden there.
    fireEvent.click(within(ask).getByRole('button', { name: 'Keep it', hidden: true }));
    await waitFor(() => expect(screen.queryByTestId('local-ai-remove-confirm')).toBeNull());
    expect(invoke).not.toHaveBeenCalledWith('local_models_remove', expect.anything());
    fireEvent.click(screen.getAllByLabelText('Remove Zen Nano')[0]);
    const again = await screen.findByTestId('local-ai-remove-confirm');
    fireEvent.click(within(again).getByRole('button', { name: 'Remove', hidden: true }));
    await waitFor(() => expect(invoke).toHaveBeenCalledWith('local_models_remove', { repo: NANO }));
    await waitFor(() => expect(screen.getAllByLabelText('Download Zen Nano').length).toBeGreaterThan(0));
  });

  it('a server this app did not start is not taken for the chosen model', async () => {
    const taken =
      'Another program on this computer is already using port 36900, where the model answers, so zenlm/zen-nano-0.6b was not started. Quit that program (it may be a Hanzo engine left running), then press Use again.';
    desktop(() => ({ ...base, installed: [{ repo: NANO, bytes: 1_208_033_536 }] }), {
      local_models_serve: () => Promise.reject(taken),
    });
    // Someone else's server answers /health on the port.
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('ok', { status: 200 }));
    expect(await waitForEngine(NANO, 200, 10)).toBe(false);
    await openScreen();
    fireEvent.click(screen.getAllByLabelText('Use Zen Nano')[0]);
    const alert = await screen.findAllByTestId('local-ai-pull-error');
    expect(alert[0].textContent).toBe(taken);
    expect(screen.getByTestId('local-ai-status').textContent).not.toMatch(/Running/);
  });

  it('claims a fit only for this computer\'s known memory', async () => {
    desktop(() => base, { hardware_get_summary: () => ({ hardware: { memory: 16 } }) });
    await openScreen();
    expect(nanoCard().textContent).toMatch(/Fits this computer/);
    expect(document.body.textContent).not.toMatch(/this Mac/);
  });

  it('makes no fit claim when the memory cannot be read', async () => {
    desktop(() => base, { hardware_get_summary: () => Promise.reject('no hardware info') });
    await openScreen();
    expect(nanoCard().textContent).not.toMatch(/Fits/);
    expect(nanoCard().textContent).toMatch(/Needs 3 GB memory/);
  });

  it('keeps developer details behind Advanced', async () => {
    desktop(() => base);
    await openScreen();
    const advanced = screen.getByTestId('local-ai-advanced') as HTMLDetailsElement;
    expect(advanced.open).toBe(false);
    expect(advanced.textContent).toMatch(/127\.0\.0\.1:36900/);
    act(() => openLocalAiManager('engine'));
    await waitFor(() => expect((screen.getByTestId('local-ai-advanced') as HTMLDetailsElement).open).toBe(true));
  });
});

describe('local chat', () => {
  it('starts the downloaded model and answers from the engine on this computer', async () => {
    let serving: string | null = null;
    desktop(() => ({ ...base, installed: [{ repo: NANO, bytes: 1 }], serving }), {
      local_models_serve: ({ repo }) => {
        serving = repo;
      },
    });
    const native = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/v1/models')) return new Response(JSON.stringify({ data: [{ id: NANO }] }));
      if (url.endsWith('/v1/chat/completions')) {
        expect(JSON.parse(String(init?.body)).model).toBe(NANO);
        return new Response(JSON.stringify({ choices: [{ message: { content: 'Hello!' } }] }));
      }
      return new Response('ok');
    });
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('ok', { status: 200 }));
    const res = await handleLocalChatCompletion(native as unknown as typeof fetch, {
      body: JSON.stringify({ model: 'enso-free', messages: [{ role: 'user', content: 'hi' }] }),
    });
    expect(invoke).toHaveBeenCalledWith('local_models_serve', { repo: NANO });
    expect(res.status).toBe(200);
    expect((await res.json()).choices[0].message.content).toBe('Hello!');
  });

  it('does not chat with a server on the port that this app did not start', async () => {
    desktop(() => ({ ...base, installed: [{ repo: NANO, bytes: 1 }] }), {
      local_models_serve: () => Promise.reject('Another program on this computer is already using port 36900.'),
    });
    const native = vi.fn(async (url: string) =>
      url.endsWith('/v1/models') ? new Response(JSON.stringify({ data: [{ id: 'someone-elses-model' }] })) : new Response('{}'),
    );
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('ok', { status: 200 }));
    const res = await handleLocalChatCompletion(native as unknown as typeof fetch, {
      body: JSON.stringify({ model: 'enso-free', messages: [{ role: 'user', content: 'hi' }] }),
    });
    expect(res.status).toBe(503);
    expect(native).not.toHaveBeenCalledWith(expect.stringMatching(/chat\/completions/), expect.anything());
  });

  it('with no engine says what is missing instead of failing silently', async () => {
    desktop(() => ({ ...base, engine: null }));
    const res = await handleLocalChatCompletion(fetch, { body: JSON.stringify({ model: 'enso-free' }) });
    expect(res.status).toBe(503);
    expect((await res.json()).error.message).toMatch(/engine is not installed/);
  });
});
