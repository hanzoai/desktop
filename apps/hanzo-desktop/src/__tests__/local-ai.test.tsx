import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import {
  buildLocalModelsCatalogResponse,
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
