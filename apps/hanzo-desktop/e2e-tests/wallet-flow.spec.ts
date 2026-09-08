/**
 * Wallet flow smoke — proves the shared @luxwallet/store engine works end-to-end
 * in the desktop frontend. Crypto is the real @luxfi/crypto WASM; the keychain
 * uses the host `secure_storage_*` bridge, mocked here with an in-page map (the
 * same seam the three desktops inject).
 *
 * The /wallet route is node-independent (reachable pre-onboarding by design), so
 * this loads it directly against the preview build and:
 *   1. creates a Local HD + Post-Quantum wallet through the crypto-wallet page
 *      (which drives useLuxWallet == createLuxWallet from @luxwallet/store),
 *   2. asserts a real EVM address + the ML-DSA-65 PQ badge render — i.e. the
 *      @luxfi/crypto WASM derived secp256k1 + ML-DSA-65 through the shared store,
 *   3. switches the network via the page NetworkSelect (store.selectChain) and
 *      asserts the shown selection updates.
 */
import { test, expect, type Page } from '@playwright/test';

const BASE = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:1420';
const ADDR_RE = /0x[a-fA-F0-9]{40}/;

// Tall viewport so the NetworkSelect dropdown (many chains) fits on screen.
test.use({ viewport: { width: 1280, height: 1200 } });

/** Minimal Tauri runtime shim so the app boots in headless Chromium and the
 * keychain seam has a working `secure_storage_*` bridge. */
async function installTauriMock(page: Page) {
  await page.addInitScript(() => {
    const store = new Map<string, string>();
    const internals = {
      metadata: {
        currentWindow: { label: 'main' },
        currentWebview: { windowLabel: 'main', label: 'main' },
      },
      transformCallback: (cb: (r: unknown) => void, once = false) => {
        const id = Math.floor(Math.random() * 1e9);
        Object.defineProperty(window, `_${id}`, {
          value: (r: unknown) => {
            if (once) Reflect.deleteProperty(window, `_${id}`);
            return cb && cb(r);
          },
          writable: false,
          configurable: true,
        });
        return id;
      },
      invoke: async (cmd: string, args: Record<string, string> = {}) => {
        if (cmd === 'secure_storage_set') return store.set(args.key, args.value), null;
        if (cmd === 'secure_storage_get') return store.get(args.key) ?? null;
        if (cmd === 'secure_storage_delete') return store.delete(args.key), null;
        return null;
      },
      convertFileSrc: (p: string) => p,
    };
    (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = internals;
    (window as unknown as Record<string, unknown>).__TAURI_IPC__ = internals.invoke;
  });
}

test('create PQ wallet + switch network on the shared @luxwallet store', async ({
  page,
}) => {
  await installTauriMock(page);
  await page.goto(`${BASE}/wallet`);

  // The crypto-wallet page (backed by @luxwallet/store) mounts.
  const setup = page.getByRole('button', { name: /set up wallet/i });
  await expect(setup).toBeVisible({ timeout: 20000 });
  await setup.click();

  // choose -> Create New
  await page.getByText('Create New', { exact: true }).click();
  // create-type -> Local HD + Post-Quantum (runs createWallet('local-hd-pq')
  // through @luxwallet/store → @luxfi/crypto WASM: secp256k1 + ML-DSA-65).
  await page.getByText('Local HD + Post-Quantum', { exact: true }).click();

  // The freshly-generated recovery phrase is shown; dismiss it if present.
  const done = page.getByRole('button', { name: /saved it/i });
  await done.click({ timeout: 15000 }).catch(() => {});

  // Wallet page now shows the account: a real 0x address + the PQ badge. This is
  // the end-to-end proof the shared store minted a real PQ wallet.
  await expect(page.getByText('ML-DSA-65')).toBeVisible({ timeout: 20000 });
  await expect(page.getByText('Post-Quantum Identity (NodeID)')).toBeVisible();
  const addressCode = page.locator('code').filter({ hasText: ADDR_RE }).first();
  await expect(addressCode).toBeVisible();
  const address = (await addressCode.textContent())?.trim() ?? '';
  expect(address).toMatch(ADDR_RE);
  console.log('created wallet address:', address);

  // Network switch: open the page NetworkSelect and pick a different network,
  // driving useLuxWallet.selectChain on the shared store. Default is Hanzo; pick
  // Lux C-Chain (first registry entry, near the top of the list).
  const networkTrigger = page.getByRole('combobox').last();
  const before = (await networkTrigger.textContent())?.trim() ?? '';
  expect(before).toMatch(/Hanzo/i); // default network is the brand's own (Hanzo)
  await networkTrigger.click();
  // Radix Select renders options in a portal (positioned off-viewport when the
  // trigger sits low on the page). Force-click fires radix's selection handler
  // regardless of scroll position.
  const ethereum = page.getByRole('option', { name: /Ethereum \(ETH\)/i }).first();
  await expect(ethereum).toBeAttached({ timeout: 10000 });
  await ethereum.click({ force: true });
  // The trigger reflects the new selection (store.selectedChainId changed off Hanzo).
  await expect(networkTrigger).toHaveText(/Ethereum/i, { timeout: 10000 });
  const after = (await networkTrigger.textContent())?.trim() ?? '';
  console.log('switched network from', JSON.stringify(before), 'to', JSON.stringify(after));

  await page.screenshot({ path: 'e2e-tests/.artifacts/wallet-flow.png', fullPage: true });
});
