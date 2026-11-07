import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import {
  buildLocalModelsCatalogResponse,
  LocalAiManager,
  openLocalAiManager,
} from '../local-ai';

describe('local AI catalog and manager', () => {
  it('serves local AI models with free tier access and excludes qwen2 models', async () => {
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
    expect(ids.some((id) => id.startsWith('zen'))).toBe(true);
    expect(ids.some((id) => id.startsWith('qwen3'))).toBe(true);
    expect(ids.some((id) => id.toLowerCase().includes('qwen2'))).toBe(false);

    for (const model of body.data) {
      expect(model.class).toBe('free');
    }
  });

  it('opens the Local AI & Node Manager modal and switches across Models, Node, and Engine tabs', async () => {
    render(<LocalAiManager />);

    act(() => {
      openLocalAiManager('models');
    });

    await waitFor(() => {
      expect(screen.getByTestId('local-ai-manager-modal')).toBeTruthy();
    });

    expect(screen.getByTestId('local-ai-search-input')).toBeTruthy();

    fireEvent.click(screen.getByTestId('local-ai-tab-node'));
    expect(screen.getByText('Node Configuration')).toBeTruthy();

    fireEvent.click(screen.getByTestId('local-ai-tab-engine'));
    expect(screen.getByText(/Embedded Hanzo Engine/)).toBeTruthy();
  });
});
