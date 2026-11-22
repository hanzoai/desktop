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
  LocalAiManager,
  localChat,
  openLocalAiManager,
} from '../local-ai';
import {
  CANCELLED,
  ENGINE_RELEASES_URL,
  LOCAL_SOURCES,
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
  it('offers the picker only the router aliases and the models this app can download', async () => {
    const body = await buildLocalModelsCatalogResponse();
    expect(body.object).toBe('list');
    expect(body.data.map((m) => String(m.id))).toEqual(['enso-auto', 'enso-free', 'enso', ...LOCAL_SOURCES.map((s) => s.tag)]);
    for (const model of body.data) expect(model.class).toBe('free');
  });

  it('claims reasoning and tools only where local-sources.json says so, and vision for none', async () => {
    const body = await buildLocalModelsCatalogResponse();
    const said = (id: string) => body.data.find((m) => m.id === id)!;
    expect(said('smollm2:135m')).toMatchObject({ supports_tools: false, supports_reasoning: false });
    expect(said('deepseek-r1:1.5b')).toMatchObject({ supports_tools: false, supports_reasoning: true });
    expect(said('qwen3:4b')).toMatchObject({ supports_tools: true, supports_reasoning: true });
    for (const src of LOCAL_SOURCES) expect(said(src.tag)).toMatchObject({ supports_tools: src.tools, supports_reasoning: src.reasons });
    for (const model of body.data) expect(model.supports_vision).toBe(false);
    // The aliases answer with the chosen model, so they say what it can do.
    window.localStorage.setItem('hanzo.mind', JSON.stringify({ model: 'smollm2:135m' }));
    const again = await buildLocalModelsCatalogResponse();
    expect(again.data.find((m) => m.id === 'enso-free')).toMatchObject({ supports_tools: false, supports_reasoning: false });
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
  });

  it('lists only models it can download: every one has a Download button, none is "not available"', async () => {
    desktop(() => base);
    await openScreen();
    const text = screen.getByTestId('local-ai-manager-modal').textContent ?? '';
    expect(text).toContain(`All models (${LOCAL_SOURCES.length})`);
    expect(text).not.toMatch(/Not available yet|cannot be downloaded/);
    for (const s of LOCAL_SOURCES) expect(screen.getAllByLabelText(`Download ${s.title}`).length).toBeGreaterThan(0);
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

  it('does not open itself on a pick of a model not on this computer: Open settings is the one door', async () => {
    desktop(() => base);
    render(
      <GuiProvider config={config} defaultTheme="dark">
        <LocalAiManager />
      </GuiProvider>,
    );
    window.localStorage.setItem('hanzo.mind', JSON.stringify({ model: 'zen-nano:0.6b' }));
    await act(async () => {
      window.dispatchEvent(new Event('hanzo:mind'));
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(screen.queryByTestId('local-ai-manager-modal')).toBeNull();
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
  const ask = (model?: string, messages: unknown[] = [{ role: 'user', content: 'hi' }], signal = new AbortController().signal) =>
    localChat({ messages, model, signal });
  /** The engine on this computer: started and serving NANO; `chat` answers each turn it is asked. */
  const serving = (chat: (init?: RequestInit) => Response | Promise<Response>) => {
    desktop(() => ({ ...base, installed: [{ repo: NANO, bytes: 1 }], serving: NANO }));
    return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) =>
      String(input).endsWith('/v1/models') ? new Response(JSON.stringify({ data: [{ id: NANO }] })) : chat(init),
    );
  };
  const said = (content: string) => new Response(JSON.stringify({ choices: [{ message: { content } }] }));

  it('starts the downloaded model and answers from the engine on this computer', async () => {
    let running: string | null = null;
    desktop(() => ({ ...base, installed: [{ repo: NANO, bytes: 1 }], serving: running }), {
      local_models_serve: ({ repo }) => {
        running = repo;
      },
    });
    const native = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/v1/models')) return new Response(JSON.stringify({ data: [{ id: NANO }] }));
      expect(JSON.parse(String(init?.body)).model).toBe(NANO);
      return said('Hello!');
    });
    const reply = await localChat({ messages: [], signal: new AbortController().signal }, native as unknown as typeof fetch);
    expect(invoke).toHaveBeenCalledWith('local_models_serve', { repo: NANO });
    expect(reply).toBe('Hello!');
  });

  it('does not chat with a server on the port that this app did not start', async () => {
    desktop(() => ({ ...base, installed: [{ repo: NANO, bytes: 1 }] }), {
      local_models_serve: () => Promise.reject('Another program on this computer is already using port 36900.'),
    });
    const native = vi.fn(async (url: string) =>
      url.endsWith('/v1/models') ? new Response(JSON.stringify({ data: [{ id: 'someone-elses-model' }] })) : new Response('{}'),
    );
    await expect(localChat({ messages: [], signal: new AbortController().signal }, native as unknown as typeof fetch)).rejects.toThrow(
      /No local model is running yet/,
    );
    expect(native).not.toHaveBeenCalledWith(expect.stringMatching(/chat\/completions/), expect.anything());
  });

  it('with no engine says what is missing instead of failing silently', async () => {
    desktop(() => ({ ...base, engine: null }));
    await expect(ask()).rejects.toThrow(/engine is not installed/);
  });

  it('asks for the model the reader picked and returns the engine’s text', async () => {
    const asked: string[] = [];
    serving((init) => {
      asked.push(JSON.parse(String(init?.body)).model);
      return said('Hi there');
    });
    expect(await ask(NANO)).toBe('Hi there');
    expect(asked).toEqual([NANO]);
  });

  it('throws the engine’s own error text and status, never "No local model is running yet"', async () => {
    serving(() => new Response(JSON.stringify({ error: { message: 'context length exceeded' } }), { status: 400 }));
    const failure = await ask().catch((e: Error) => e);
    expect((failure as Error).message).toBe('context length exceeded (400)');
  });

  it('honours Stop: an aborted turn rejects and is not answered', async () => {
    const stop = new AbortController();
    serving(
      (init) =>
        new Promise<Response>((_, reject) =>
          init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError'))),
        ),
    );
    const turn = ask(undefined, [], stop.signal);
    await new Promise((r) => setTimeout(r, 0));
    stop.abort();
    await expect(turn).rejects.toThrow(/Abort/);
  });

  it('sends a picture to the engine as the turn’s image part', async () => {
    let body: { messages: Array<{ content: unknown }> } | undefined;
    serving((init) => {
      body = JSON.parse(String(init?.body));
      return said('A cat.');
    });
    const parts = [
      { type: 'text', text: 'What is this?' },
      { type: 'image_url', image_url: { url: 'data:image/png;base64,AAAA' } },
    ];
    await ask(undefined, [{ role: 'user', content: parts }]);
    expect(body?.messages[0].content).toEqual(parts);
  });
});
