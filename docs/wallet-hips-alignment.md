# Wallet ↔ HIPs Alignment Plan

Status: Draft · Date: 2026-05-31 · Scope: align the Hanzo Desktop crypto wallet (and the node APIs it depends on) to **HIP-0001** ($AI token), **HIP-0025** (Bot Agent Wallet & RPC billing), and **HIP-0018** (payment / invoice). Supporting: HIP-0048 (DID), HIP-0026 (IAM balance ledger), HIP-0027 (KMS), HIP-0005 (PQ).

This is a planning document. **No code is changed by this plan.** It enumerates what must be added/changed, who owns each piece (node vs. desktop), and a phased rollout.

---

## 1. Where we are today (ground truth)

### Desktop (`apps/hanzo-desktop`)
- **Page:** `src/pages/crypto-wallet.tsx` — a generic Base-Sepolia EVM wallet. Shows Wallet Address, Network, and an **Assets** card hardcoded to two rows: **ETH** and **USDC**. Example address in the wild: `0x9F22…`.
- **Components:** `src/components/crypto-wallet/`
  - `context/wallets-context.tsx` — Zustand store; views are `Main / RegularCreate / RegularMnemonic / RegularPrivateKey / ViewSecretRecoveryPhrase`. No "agent wallet", no "billing", no "DID" views.
  - `utils.ts` — `truncateAddress`, `formatBalanceAmount(amount, decimals=18)` (BigInt, generic), `getBasescanAddressUrl` (hardcoded basescan / sepolia.basescan).
- **Network is hardcoded** to `NetworkIdentifier.BaseSepolia` in every create/restore form (`crypto-wallet.tsx` lines ~716, 810, 923, 1078). The network `<Select>` only offers `base-sepolia` + a disabled "coming soon".
- **Explorer link** (`etherscanLink`, lines ~207-219) only knows BaseSepolia → `sepolia.basescan.org`, else `basescan.org`.
- **Data model / API client:** `libs/hanzo-message-ts/src/api/wallets.ts`
  - `enum NetworkIdentifier { BaseSepolia, BaseMainnet, EthereumSepolia, EthereumMainnet, ArbitrumSepolia, ArbitrumMainnet, Anvil }` — **no Hanzo / chain 36963.**
  - REST surface: `POST /v2/create_local_wallet`, `/v2/restore_local_wallet`, `/v2/restore_coinbase_mpc_wallet`, `GET /v2/list_wallets`, `GET /v2/get_wallet_balance`.
  - `GetWalletBalanceResponse` is a free-form map keyed by asset symbol (`ETH`, `USDC`, …) → `{ amount, asset{asset_id,contract_address,decimals,network_id}, decimals }`.
  - Wallet model is `LocalEthersWallet { type, data: { id, network, address, private_key, public_key, mnemonic? } }`. **No `safeAddress`, no `did`, no `derivationPath`, no `chainId`.**
- **State hooks:** `libs/hanzo-node-state/src/v2/{queries,mutations}/…Wallet…` — thin React-Query wrappers over the above. **No billing/credits/invoice/DID hooks exist.**

### Node (`/home/z/work/hanzo/node`)
What already exists (reusable):
- **Chain 36963 is known.** `hanzo-libs/hanzo-mining/src/ledger.rs`: `pub const AI_MAINNET_ID: u32 = 36963;`. `hanzo-mining/src/evm.rs` defines per-chain `EvmConfig { chain_id, token_symbol, token_decimals: 18, … }` for Hanzo (36963 / testnet 36964), Zoo (200200/200201), Lux. Bridge ("Teleport") in `hanzo-mining/src/bridge.rs`.
  - ⚠️ **Token symbol mismatch:** `evm.rs` uses `token_symbol: "HAI"`; mining contract addrs `0x369000…aAAI`. HIP-1 mandates user-facing symbol **`$AI`** (billing currency code `"AI"`), 18 decimals, 1B cap. The repo's L1 token is also called `HANZO`. These must be reconciled to one canonical `$AI` (see §3).
- **DID library:** `hanzo-libs/hanzo-did/src/did.rs` — `DID { method, id, … }`, constructors `DID::hanzo`, `DID::lux`, `hanzo_eth`, `hanzo_sepolia`, omnichain variants (`get_omnichain_variants`, `is_same_entity`), parse/format. This is the seed for HIP-25/HIP-48 `did:hanzo:`. **Not yet wired to wallets, and does not yet emit W3C DID Documents / `MLDSAVerificationKey2025`.**
- **Wallet impls:** `hanzo-bin/hanzo-node/src/wallet/` — `local_ether_wallet.rs`, `coinbase_mpc_wallet.rs`, `wallet_manager.rs`, `wallet_traits.rs`. Persisted via `hanzo-libs/hanzo-db-sqlite/src/wallet_manager.rs` (single-row `hanzo_wallet` table, opaque JSON blob).
- **Payments:** x402 stack `hanzo-libs/hanzo-runtime/src/functions/x402/{create,verify,settle}_payment.rs`, `payment_requirements.rs`. Agent-payment managers `hanzo-bin/hanzo-node/src/network/agent_payments_manager/{my,external}_agent_offerings_manager.rs`. Invoice store `hanzo-libs/hanzo-db-sqlite/src/invoice_manager.rs` + schema `hanzo-libs/hanzo-messages/src/schemas/invoices.rs`.
  - ⚠️ The existing `Invoice` is **tool-barter** shaped (`provider_name`, `requester_name`, `hanzo_offering`, `usage_type_inquiry`, `status ∈ {Pending,Paid,Failed,Processed,Rejected}`). It is **not** the HIP-18 fiat/credits/Stripe invoice (no USD line items, no `stripe_price_id`, no credits).
- **Network enums are Base/EVM-only and must gain Hanzo:**
  - `hanzo-messages/src/schemas/wallet_mixed.rs` → `enum NetworkIdentifier { BaseSepolia, BaseMainnet, EthereumSepolia, EthereumMainnet, ArbitrumSepolia, ArbitrumMainnet, Anvil }`.
  - `hanzo-messages/src/schemas/x402_types.rs` → `enum Network { BaseSepolia, Base, AvalancheFuji, Avalanche }`. **No Hanzo 36963 in either.**

### Gap summary
| HIP | Mandated | Desktop today | Node today |
|---|---|---|---|
| HIP-1 | `$AI`, 18 dec, chain 36963 | ETH/USDC only, BaseSepolia | chain known; symbol "HAI"/"HANZO" not unified to `$AI`; not in wallet enums |
| HIP-25 | `did:hanzo:` + Safe 1-of-2, path `m/44'/60'/0'/0/<idx>`, 24-word BIP-39, metered RPC billing | none | DID lib exists; no Safe; no derivation/agent-index; no RPC billing meter |
| HIP-18 | credits (1 cr=$0.001), IAM balance, Stripe + $AI top-up, invoices | none | tool-barter invoices only; no credits/IAM/Stripe |

---

## 2. Target architecture (responsibility split)

**Principle (from the HIPs):** the **node owns keys, signing, chain I/O, and on-chain settlement**; the **desktop is a thin, read-mostly client** that renders balances/credits/invoices and triggers node-mediated actions. Secrets/keys never reach the renderer (HIP-27); balances of record live in IAM (HIP-26).

```
┌──────────────────────────── Desktop (React renderer) ────────────────────────────┐
│ crypto-wallet.tsx: AI/USDC/LUX assets · Agent Wallet (DID + Safe) · Credits ·     │
│ Invoices · Top-up (Stripe / $AI) · RPC usage meter                                │
│   └─ calls only: hanzo-message-ts api/* → node REST (Bearer api_v2_key)           │
└───────────────────────────────────────────────────────────────────────────────────┘
                                  │ HTTPS (localhost / node_address)
┌──────────────────────────────── Node (Rust / Tauri sidecar) ─────────────────────┐
│ wallet/* : HD derivation m/44'/60'/0'/0/<idx>, Safe 1.4.1 deploy, EIP-1271 sign   │
│ hanzo-did : did:hanzo: doc gen, registry resolve, VC issue (HIP-48)               │
│ mining/evm+bridge : $AI on 36963, Teleport, balances                             │
│ x402 + agent_payments_manager + invoice_manager : RPC metering & settlement       │
│   └─ talks to: IAM (hanzo.id, balance), KMS (kms.hanzo.ai, keys), DID (did.hanzo) │
└───────────────────────────────────────────────────────────────────────────────────┘
        │ IAM HIP-26 (balance of record)   │ KMS HIP-27 (key custody)   │ chain 36963
```

**Desktop must NOT:** hold private keys in JS, mutate IAM balances directly, talk to Stripe directly (PCI SAQ A — checkout is Stripe-hosted, opened via node-provided URL), or sign on-chain in the renderer.

**Desktop MAY:** read balances/credits/invoices/usage, render DID + Safe address, open hosted checkout URLs, and submit "create agent wallet / set auto-recharge / top-up intent" requests that the node fulfills.

---

## 3. HIP-0001 — $AI token denomination & decimals

### 3a. Canonicalize the token (node, blocking)
- Pick one canonical identity and use it everywhere: **name `AI`, symbol `$AI`, currency code `"AI"`, 18 decimals, chain 36963.** Reconcile `evm.rs` `token_symbol: "HAI"` and the repo's `HANZO` L1 name to this. (Treat `HANZO`/`$AI` as the same 1B-supply asset; expose it to users as `$AI`.)
- Add a single source-of-truth constant module (node) e.g. `AiToken { symbol:"AI", name:"AI", decimals:18, chain_id:36963, contract: <TBD-at-deploy> }`, consumed by mining/evm, wallet balance, and x402 asset descriptors.

### 3b. Add Hanzo network to the wallet enums (node, blocking)
- `wallet_mixed.rs::NetworkIdentifier`: add `HanzoMainnet` (36963) and `HanzoTestnet` (36964). Provide `chain_id()` + `Display` ("Hanzo", "Hanzo Testnet") + RPC URL resolution.
- `x402_types.rs::Network`: add `Hanzo` (36963) + `HanzoTestnet`, with `chain_id()` and asset/`pay_to` plumbing so x402 settlement can target 36963.
- `AssetType` (wallet_mixed.rs): add `AI` native asset for Hanzo networks (mirrors how `ETH`/`USDC` map today). Keep `USDC` (bridged) and add `LUX` (bridged) per HIP-25 accepted tokens.

### 3c. Surface $AI in balances (node + desktop)
- Node `GET /v2/get_wallet_balance` already returns a symbol-keyed map; ensure it returns an `AI` entry `{ amount (wei string), decimals:18, asset:{asset_id:"AI", contract_address, network_id:"hanzo-mainnet"} }` when the wallet network is Hanzo.
- Desktop `crypto-wallet.tsx` **Assets card**: add an **$AI row first** (icon, "Hanzo AI", symbol `$AI`), formatted with `formatBalanceAmount(walletBalance?.AI.amount, 18)`. ETH row becomes conditional (only on EVM L1/testnets); USDC + LUX rows shown when present.
- Desktop `utils.ts`: add an `AiTokenIcon`/asset registry and a `getExplorerUrl(address, network)` that maps Hanzo → the 36963 explorer (TBD, e.g. `explorer.hanzo.network`) instead of always basescan. Replace the inline `etherscanLink` memo accordingly.
- Desktop network `<Select>` (create/restore forms): add **Hanzo** (and **Hanzo Testnet**) options; make **Hanzo Testnet the default** for dev builds instead of `base-sepolia`.

### 3d. i18n / labels (desktop)
- Add `$AI` strings (asset name, denomination helper "1 $AI = …") to `hanzo-i18n`. Do not invent a USD peg for $AI in the UI — USD valuation of $AI only appears in the credits/top-up flow via the HIP-8 oracle the node provides.

---

## 4. HIP-0025 — Bot Agent Wallet & RPC billing

### 4a. Agent wallet provisioning (node, primary)
Node gains an **agent-wallet service** that, per workspace/agent:
- Derives an EOA from a **24-word BIP-39** workspace seed at **`m/44'/60'/0'/0/<agent-index>`** (secp256k1). (Today `local_ether_wallet.rs` exists but is not agent-indexed; add deterministic per-agent index + 24-word default.)
- Deploys / references a **Gnosis Safe v1.4.1**, default threshold **1-of-2** (agent EOA + workspace owner), on chain **36963**. Store `safeAddress`.
- Mints a `did:hanzo:<agent-id>` (extend `hanzo-did`) and assembles the **DID Document** (`@context` incl. `https://hanzo.ai/ns/agent/v1`; `verificationMethod.type = EcdsaSecp256k1VerificationKey2019`; `blockchainAccountId = eip155:36963:0x…`; services `AgentRPCService`, `SafeWallet` endpoint `safe:36963:0x…`, plus `AgentBillingSchedule`). Signing delegated to **KMS** (HIP-27); private key never leaves KMS.
- Persists an `AgentWalletConfig { address?, safeAddress?, chain:"hanzo", chainId:36963, derivationPath }` — extend the SQLite wallet blob / add an `agent_wallet` table.

New/extended node REST (mirror HIP-25 gateway methods):
- `GET /v2/agent/:agentId/did` (→ `agent.did.get`), `GET /v2/agent/:agentId/wallet` (→ `agent.wallet.get`), `GET /v2/agent/:agentId/identity` (full).
- `POST /v2/agent/:agentId/wallet` (create; admin scope) deploying Safe + DID.
- Billing: `GET /rpc/:agentId/billing`, `GET …/billing/balance`, `GET …/billing/usage`, `POST …/billing/prepay`.

### 4b. RPC metering & settlement (node, primary)
- Implement the **rate schedule** as a DID service `AgentBillingSchedule` (e.g. `chat.send` 0.001 AI/req, `agent` 0.00001 AI/token, `agent.wait` 0.01/req, `browser.request` 0.005/req) and a **free tier** (100 req/day, 10k tok/day; free methods `health`, `agent.identity.get`, `agent.did.get`).
- Meter calls, **batch-settle hourly** (minAmount 0.1 AI) to the agent Safe on 36963; emit `RPCSettlement(agent, consumer, amount, requestCount, periodStart, periodEnd)`. This extends the existing `agent_payments_manager` + x402 `settle_payment` rather than replacing them.
- Insufficient balance → HTTP **402** (consistent with HIP-18 metering).

### 4c. Desktop UI for agent wallet (desktop)
- New **"Agent Wallet"** section/tab in `crypto-wallet.tsx` (and/or a dedicated route reachable from the existing "Explore Network Agents" link). Render per agent:
  - `did:hanzo:<id>` (copyable), Safe address + threshold badge ("1-of-2"), derivation path, chain (Hanzo 36963), accepted tokens (AI/USDC/LUX).
  - **Billing panel:** current `$AI` billing balance, free-tier remaining (req/day, tok/day), live **usage meter** by method (from `…/billing/usage`), and a **Prepay** button (calls `…/billing/prepay`).
- Extend `wallets-context.tsx` with views `AgentWallet`, `AgentBilling`, `AgentPrepay`. Add `AgentWalletConfig` + billing types to `hanzo-message-ts/src/api/` and React-Query hooks under `hanzo-node-state/v2/{queries,mutations}` (`useGetAgentWallet`, `useGetAgentDid`, `useGetAgentBilling`, `useAgentPrepay`, `useCreateAgentWallet`).
- Update the create-wallet model type (`createLocalWallet/types.ts` and friends) so a wallet can carry `chainId`, `safeAddress`, `did`, `derivationPath` without breaking existing local wallets.

### 4d. DID display & PQ (desktop + node, follow-on)
- Show the DID's alsoKnownAs siblings (`did:lux:`, `did:ai:`) read-only. (HIP-48 omnichain; node already has `get_omnichain_variants`.)
- Per HIP-48/HIP-5 PQ transition, the DID Doc SHOULD gain an `MLDSAVerificationKey2025` key by 2027; desktop only needs to render a "Post-Quantum: enabled/pending" badge from the DID Doc — key handling stays in node/KMS.

---

## 5. HIP-0018 — Payment / credits / invoices

> Distinction: **HIP-25 billing is $AI-denominated agent RPC** settled on-chain to a Safe. **HIP-18 is USD credits** (1 credit = $0.001) for platform/model usage, with **IAM (HIP-26) as the sole balance source of truth**, topped up via Stripe (fiat) or $AI (crypto). The wallet UI must present both clearly and not conflate them.

### 5a. Credits & balance (node bridges to IAM; desktop reads)
- Node exposes (proxying / mirroring the HIP-18 `/v1/billing/*` + HIP-26 IAM endpoints) at least: `GET /v2/billing/balance`, `…/transactions`, `…/usage`, `…/subscription`, and **creates checkout** via `…/checkout` (Stripe-hosted) and `…/checkout/crypto` ($AI on 36963).
- **Balance is read from IAM** (JWT claims `balance` or `/api/get-account`); node/Commerce only ever **add** via `POST /api/add-balance` + `POST /api/add-transaction`. Desktop must treat balance as read-only and never compute/mutate it locally.
- Crypto top-up flow ($AI → credits): per-user deposit address → Transfer on 36963 → USD via HIP-8 TWAP oracle → same `add-balance` path. Desktop just shows "pending confirmations (1 conf <$1k / 6 conf ≥$1k)" and resulting credits.

### 5b. Desktop credits/billing UI (desktop)
- New **"Credits & Billing"** card in `crypto-wallet.tsx` rendering the HIP-18 balance schema:
  `{ balance, balance_usd, tier, credits_included, credits_used, credits_remaining, period_start, period_end, auto_recharge:{enabled,threshold,amount} }`.
- **Top-up** dialog with two paths: **Card** (opens Stripe-hosted checkout URL returned by node — no card data in app, PCI SAQ A) and **$AI** (shows deposit address/QR for chain 36963). Pricing tiers with bonus ($5→5,000 … $1,000+→25%+) shown read-only.
- **Auto-recharge** toggle (threshold/amount) → `POST` to node billing.
- **Subscription** row (Free/Pro/Team/Enterprise) using `stripe_price_id`s; subscribe/cancel via node → `…/subscribe` (POST/DELETE).
- **Insufficient balance** anywhere → surface the node's HTTP **402** as a clear "Add credits" prompt.

### 5c. Invoices (node model change + desktop list)
- ⚠️ The current node `Invoice` (tool-barter) does **not** match HIP-18. Add a **HIP-18 invoice model** (or a `BillingInvoice` variant) carrying: issuer block ("Hanzo AI Inc., 548 Market St, Suite 45000, SF, CA 94104"), line items (subscription / credit purchase / overage), usage-by-service summary, open/close balance, payment method (card last-4 | wire ref | `$AI` tx hash), and `integrity:"sha256:…"` hash-chain. PDFs stored in MinIO (HIP-32); node returns a download URL.
- Node endpoints: `GET /v2/billing/invoices`, `GET /v2/billing/invoices/:id` (returns metadata + PDF URL).
- Desktop: re-enable a **"Recent Activity"/Invoices** list (the commented-out block at `crypto-wallet.tsx` ~382-419 is the placeholder) → render transactions (`/v2/billing/transactions`) and a downloadable invoice list. Add `useGetInvoices` / `useGetTransactions` hooks.

---

## 6. Node-vs-Desktop responsibility matrix

| Capability | Node (Rust) | Desktop (React) |
|---|---|---|
| $AI constant/decimals/chain 36963 | **Owns** (`AiToken`, mining/evm, enums) | Reads symbol/decimals via balance API |
| HD derivation `m/44'/60'/0'/0/<idx>`, 24-word seed | **Owns** (`wallet/*`, KMS) | Never sees keys; shows path read-only |
| Gnosis Safe 1.4.1 deploy / 1-of-2 / EIP-1271 sign | **Owns** | Shows Safe addr + threshold badge |
| `did:hanzo:` doc, registry resolve, VC, PQ key | **Owns** (`hanzo-did`, DID svc, KMS) | Renders DID + siblings + PQ badge |
| RPC metering, free tier, hourly settle, `RPCSettlement` | **Owns** (`agent_payments_manager`, x402) | Renders usage meter + prepay button |
| Credits balance (source of truth) | **Bridges to IAM**; add-only | **Read-only** display |
| Stripe checkout / subscription | **Owns** (returns hosted URL) | Opens URL; no card data |
| $AI crypto top-up + TWAP oracle | **Owns** (deposit addr, confs, oracle) | Shows deposit addr/QR + conf status |
| HIP-18 invoices + PDF (MinIO) | **Owns** schema + storage | Lists + downloads |
| Secrets/keys | **KMS (HIP-27)** | Never in renderer |

---

## 7. Phased rollout

**Phase 0 — Token canonicalization (node, blocking, ~small).**
Unify `$AI` (symbol/decimals/chain) in node constants; reconcile "HAI"/"HANZO". Add `HanzoMainnet`/`HanzoTestnet` to `NetworkIdentifier` and `Hanzo` to x402 `Network`, with `chain_id()`/RPC/explorer. Add `AssetType::AI`. No UI yet. **Exit:** `get_wallet_balance` can return an `AI` entry on a Hanzo wallet; existing Base flows unaffected.

**Phase 1 — $AI in the existing wallet (desktop, HIP-1).**
Add the `$AI` asset row (first) + icon + explorer mapping in `crypto-wallet.tsx`/`utils.ts`; add Hanzo network options to the create/restore selects and default dev builds to Hanzo Testnet. Extend wallet types with optional `chainId`/`did`/`safeAddress`/`derivationPath` (non-breaking). **Exit:** user can create/view a Hanzo $AI wallet end-to-end.

**Phase 2 — Agent wallet read path (node + desktop, HIP-25 part 1).**
Node: per-agent HD derivation + DID Doc generation (signing via KMS) + `GET /v2/agent/:id/{did,wallet,identity}`. Desktop: "Agent Wallet" view rendering DID, Safe (may be undeployed placeholder), path, accepted tokens. **Exit:** every default team preset (Vi, Dev, …) shows a `did:hanzo:<preset>` and (pending) Safe.

**Phase 3 — Safe + RPC billing (node + desktop, HIP-25 part 2).**
Node: deploy Gnosis Safe 1.4.1 (1-of-2) on 36963; implement metering + free tier + hourly settlement (`RPCSettlement`) on the agent_payments/x402 path; `…/billing/{balance,usage,prepay}`. Desktop: billing panel + usage meter + prepay; 402 handling. **Exit:** metered RPC accrues and settles to the Safe; UI reflects balance/usage.

**Phase 4 — Credits & Stripe top-up (node↔IAM + desktop, HIP-18 part 1).**
Node bridges balance reads to IAM and exposes `/v2/billing/{balance,transactions,usage,subscription,checkout}`; Stripe-hosted checkout + subscription. Desktop: Credits & Billing card, Card top-up (hosted URL), auto-recharge, subscription. **Exit:** user buys credits via card; balance (from IAM) updates; subscriptions work.

**Phase 5 — $AI crypto top-up + invoices (node + desktop, HIP-18 part 2).**
Node: `…/checkout/crypto` deposit addresses on 36963 + TWAP oracle → add-balance; HIP-18 invoice model + MinIO PDFs + `…/invoices[/:id]`. Desktop: $AI top-up (deposit addr/QR + conf status), invoices list/download, re-enable activity feed. **Exit:** $AI → credits works; invoices downloadable.

**Phase 6 — Post-Quantum & hardening (node + desktop, HIP-5/48, follow-on).**
Node: add `MLDSAVerificationKey2025` to DID Docs; 2-of-3 MPC for high-value DIDs; rotate per HIP-27 policy. Desktop: PQ badge, 2-of-3 threshold display. **Exit:** new DIDs carry a PQ key; UI reflects it.

---

## 8. Concrete change checklist (no code written here)

**Node**
- `hanzo-mining/src/evm.rs`: reconcile `token_symbol` → canonical `$AI`; add `AiToken` constant module.
- `hanzo-messages/src/schemas/wallet_mixed.rs`: `NetworkIdentifier += {HanzoMainnet, HanzoTestnet}`, `AssetType += AI`; add `chain_id()`.
- `hanzo-messages/src/schemas/x402_types.rs`: `Network += {Hanzo, HanzoTestnet}` + chain_id mapping.
- `hanzo-bin/hanzo-node/src/wallet/*`: agent-indexed HD derivation (24-word, `m/44'/60'/0'/0/<idx>`), Safe 1.4.1 deploy + EIP-1271, `AgentWalletConfig` persistence.
- `hanzo-libs/hanzo-did/*`: W3C DID Document emit (`agent/v1` + `did/v1` contexts, secp256k1 + optional ML-DSA), registry resolve, VC issue; KMS-delegated signing.
- New billing/metering: extend `agent_payments_manager` + x402 `settle_payment` for rate schedule, free tier, hourly batch settle, `RPCSettlement` event; `…/billing/*` endpoints.
- IAM bridge: `add-balance`/`add-transaction` writers; `/v2/billing/*` (balance read-only from IAM, checkout, subscription).
- Invoices: HIP-18 `BillingInvoice` model + MinIO PDF + endpoints. (Keep existing tool-barter `Invoice` separate.)
- Routes: register all new `/v2/agent/*`, `/rpc/:id/billing*`, `/v2/billing/*` in the api_v2 handlers/command list.

**Desktop**
- `libs/hanzo-message-ts/src/api/wallets.ts`: add Hanzo to `NetworkIdentifier`; extend `WalletData`/`LocalEthersWallet` with optional `chainId`/`did`/`safeAddress`/`derivationPath`; add `AI` to balance typing.
- New `libs/hanzo-message-ts/src/api/`: `agent-wallet.ts`, `billing.ts`, `invoices.ts` (DID, AgentWalletConfig, BillingBalance, Invoice, rate schedule).
- New `libs/hanzo-node-state/src/v2/{queries,mutations}/`: `getAgentWallet`, `getAgentDid`, `getAgentBilling`, `getBillingBalance`, `getTransactions`, `getInvoices`, `createAgentWallet`, `agentPrepay`, `createCheckout`, `setAutoRecharge`, `subscribe`.
- `apps/hanzo-desktop/src/components/crypto-wallet/`: `utils.ts` (AI asset registry, `getExplorerUrl`), `context/wallets-context.tsx` (`AgentWallet`/`AgentBilling`/`AgentPrepay`/`Credits` views).
- `apps/hanzo-desktop/src/pages/crypto-wallet.tsx`: $AI asset row; Hanzo network options + default; Agent Wallet section (DID/Safe/usage); Credits & Billing card (top-up card+$AI, auto-recharge, subscription); re-enable activity/invoices.
- `hanzo-i18n`: `$AI`, agent-wallet, credits, invoice strings.

---

## 9. Open questions / dependencies
- **$AI contract address on 36963** is TBD at deployment (HIP-1) — gate Phase 1 mainnet on it; testnet first.
- **Explorer URL** for chain 36963 (replace basescan) — needs canonical host.
- **IAM/KMS/DID service reachability from the node** in desktop (localhost) deployments — confirm the node can reach `hanzo.id` / `kms.hanzo.ai` / `did.hanzo.ai`, or ship local/offline fallbacks.
- **Token naming** `HANZO` (repo L1) vs `$AI` (HIP-1) — confirm single canonical user-facing symbol before Phase 0 ships.
- **Safe deployment cost/gas** on 36963 for every agent/preset — decide lazy (deploy on first settle) vs eager.
