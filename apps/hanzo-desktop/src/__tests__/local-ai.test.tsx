import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  buildLocalModelsCatalogResponse,
  DOWNLOAD_UNREACHABLE_MESSAGE,
  ENGINE_NOT_RUNNING_MESSAGE,
  LocalAiManager,
  openLocalAiManager,
} from '../local-ai';

describe('local AI catalog and manager', () => {
  it('serves local AI models with free tier access, includes Zen 6 SKUs, and excludes zen4/zen5/qwen2 models', async () => {
    const body = (await buildLocalModelsCatalogResponse()) as {
      object: string;
      data: Array<{
        id: string;
        name: string;
        class: string;
        owned_by: string;
      }>;
    };
    expect(body.object).toBe('list');
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data.length).toBeGreaterThan(10);

    const ids = body.data.map((m) => m.id);
    expect(ids).toContain('enso-free');
    expect(ids).toContain('zen6:8b');
    expect(ids).toContain('zen6-coder:31b');
    expect(ids).toContain('zen6-flash:4b');
    expect(ids).toContain('zen-vl:8b');
    expect(ids.some((id) => id.startsWith('qwen3'))).toBe(true);
    expect(ids.some((id) => /zen[45]|qwen2/i.test(id))).toBe(false);
    expect(body.data.some((m) => /zen[45]|qwen2/i.test(m.name))).toBe(false);

    for (const model of body.data) {
      expect(model.class).toBe('free');
    }
  });

  it('opens the Local AI & Node Manager modal with Zen 6 search placeholder and zero zen4/zen5/qwen2 in rendered UI', async () => {
    render(<LocalAiManager />);

    act(() => {
      openLocalAiManager('models');
    });

    await waitFor(() => {
      expect(screen.getByTestId('local-ai-manager-modal')).toBeTruthy();
    });

    const searchInput = screen.getByTestId('local-ai-search-input') as HTMLInputElement;
    expect(searchInput.placeholder).toBe('Search local models (zen6, qwen3, deepseek-r1, vision, coder…)');
    expect(screen.getByTestId('local-ai-manager-modal').textContent).not.toMatch(/zen[45]|qwen2/i);

    fireEvent.click(screen.getByTestId('local-ai-tab-node'));
    expect(screen.getByText('Node Configuration')).toBeTruthy();

    fireEvent.click(screen.getByTestId('local-ai-tab-engine'));
    expect(screen.getByText(/Embedded Hanzo Engine/)).toBeTruthy();
  });
});

// A release bundle ships no engine, so on a computer without `hanzo-server` or
// Ollama every request to :11434 and :36900 is refused. The webview words that
// refusal itself ("Load failed" in WebKit) and the manager used to print it.
describe('local AI manager with no engine on this computer', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  const open = async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Load failed'));
    render(<LocalAiManager />);
    act(() => {
      openLocalAiManager('models');
    });
    await waitFor(() => {
      expect(screen.getByTestId('local-ai-manager-modal')).toBeTruthy();
    });
  };

  it('says why a download did not start instead of the webview error', async () => {
    await open();
    fireEvent.click(screen.getAllByText('↓ Download')[0]);
    const banner = await screen.findByTestId('local-ai-pull-error');
    expect(banner.textContent).toBe(DOWNLOAD_UNREACHABLE_MESSAGE);
    expect(banner.textContent).not.toMatch(/Load failed|Failed to fetch/);
  });

  it('calls a stopped engine not running', async () => {
    await open();
    expect(screen.getByTestId('local-ai-tab-engine').textContent).toBe('Inference Engine (Not running)');
  });

  it('reports a download that broke half-way as itself, not as one that never started', async () => {
    const broken = new ReadableStream<Uint8Array>({
      pull() {
        throw new TypeError('Load failed');
      },
    });
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) =>
      String(input).endsWith('/api/pull')
        ? new Response(broken, { status: 200 })
        : Promise.reject(new TypeError('Load failed')),
    );
    render(<LocalAiManager />);
    act(() => {
      openLocalAiManager('models');
    });
    await waitFor(() => {
      expect(screen.getByTestId('local-ai-manager-modal')).toBeTruthy();
    });
    fireEvent.click(screen.getAllByText('↓ Download')[0]);
    const banner = await screen.findByTestId('local-ai-pull-error');
    expect(banner.textContent).toMatch(/stopped part-way: the connection to Ollama was lost/);
  });

  it('says the engine is not running when a model is loaded into it', async () => {
    await open();
    fireEvent.click(screen.getByTestId('local-ai-tab-engine'));
    fireEvent.click(screen.getByText(/^Load/));
    expect(await screen.findByText(ENGINE_NOT_RUNNING_MESSAGE)).toBeTruthy();
  });
});
