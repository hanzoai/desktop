// SPDX-License-Identifier: Apache-2.0
import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, beforeEach, vi } from 'vitest';

// Provide a tauri shim BEFORE importing the component so isTauriAvailable()
// returns true and safeInvoke routes through our mock.
const invokeMock = vi.fn();
const listenMock = vi.fn().mockResolvedValue(() => {});

beforeEach(() => {
  invokeMock.mockReset();
  listenMock.mockClear();
  (globalThis as { window?: unknown }).window = (
    globalThis as { window?: unknown }
  ).window ?? {};
  (window as unknown as { __TAURI_INTERNALS__: unknown }).__TAURI_INTERNALS__ = {
    invoke: invokeMock,
  };
  // Stub fetch for eth_getBalance — we don't exercise the network here.
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      json: async () => ({ jsonrpc: '2.0', id: 1, result: '0x0' }),
    }),
  );
});

vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args: unknown[]) =>
    invokeMock(...(args as [string, Record<string, unknown> | undefined])),
}));

vi.mock('@tauri-apps/api/event', () => ({
  listen: (...args: unknown[]) =>
    listenMock(...(args as [string, () => void])),
}));

vi.mock('../../store/wallet', () => ({
  useWallet: () => ({
    wallet: { address: '0x1111111111111111111111111111111111111111' },
  }),
}));

import MiningPage from '../mining';

describe('MiningPage', () => {
  it('renders the Phase 1 banner, balances, and recent proofs from fixtures', async () => {
    invokeMock.mockImplementation(async (cmd: string) => {
      if (cmd === 'mining_get_history') {
        return [
          {
            work_id_hex:
              'aabbccddeeff00112233445566778899aabbccddeeff00112233445566778899',
            reward_wei: '1000000000000000000',
            chain_id: 96369,
            status: 'locally_verified',
            timestamp: 1_700_000_000,
            privacy: 3,
            compute_minutes: 1,
            backend: 'CPU',
          },
        ];
      }
      if (cmd === 'mining_get_local_pending') return '1000000000000000000';
      if (cmd === 'mining_get_state')
        return { backend: 'CPU', privacy: 'public' };
      return null;
    });

    render(<MiningPage />);

    await waitFor(() => {
      // Phase 1 banner is mandatory — never pretend mints are live.
      expect(screen.getByTestId('phase1-banner').textContent).toMatch(
        /Phase 1/,
      );
    });

    // Local pending balance reflects the fixture's 1e18 wei.
    await waitFor(() => {
      expect(screen.getByTestId('pending-balance').textContent).toMatch(
        /1\.0000/,
      );
    });

    // Recent proofs table rows (1 fixture row).
    expect(
      screen.getByTestId('recent-proofs').querySelectorAll('tbody tr').length,
    ).toBe(1);

    // Privacy selector renders all four tiers.
    expect(screen.getByTestId('privacy-public')).toBeInTheDocument();
    expect(screen.getByTestId('privacy-private')).toBeInTheDocument();
    expect(screen.getByTestId('privacy-confidential')).toBeInTheDocument();
    expect(screen.getByTestId('privacy-sovereign')).toBeInTheDocument();

    // Backend label.
    expect(screen.getByText(/backend: CPU/)).toBeInTheDocument();
  });
});
