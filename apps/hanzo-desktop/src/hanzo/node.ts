/**
 * The local node — the one place that knows its wire.
 *
 * Two ports: the HTTP API on 3690, and the token stream on 3691, which is the
 * API port plus one and is where the node binds its WebSocket.
 *
 * Paths are `/v1/node/*`, and a 404 there is retried once against the node's
 * older `/v2` spelling, so one client covers both vintages.
 *
 * A conversation is a job: it is created against one provider, messages are
 * posted to it, and the answer comes back over the socket a token at a time.
 */
// The `@hanzo/desktop-node-state/*` alias maps onto a FILE (`src/*.ts`), so a
// directory import does not resolve here and the `/index` is load-bearing.
import { generateMyEncryptionKeys } from '@hanzo/desktop-node-state/v2/queries/getEncryptionKeys/index';

import { fetch as tauriFetch } from '@tauri-apps/plugin-http';

import { type Auth } from '../store/auth';
import { isTauriAvailable } from '../utils/tauri-check';

export const LOCAL_NODE = 'http://127.0.0.1:3690';

/** The profile a desktop pairing registers under, and the sender the node
 *  stamps on our own messages — which is how a turn's side is decided. */
const PROFILE = 'main';

export type Health = {
  status: string;
  is_pristine: boolean;
  node_name: string;
  version: string;
};

/** A configured provider. A conversation is bound to exactly one. */
export type Provider = {
  id: string;
  name: string;
  model: string;
  description?: string;
};

export type Conversation = { inbox: string; name: string };

export type Turn = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  error?: string;
};

/** Address plus the key the node minted for us. */
export type Session = { address: string; token: string };

type Fault = { message?: string; error?: string | { message?: string } };

const getFetch = () => (isTauriAvailable() ? tauriFetch : fetch);

async function decodeResponseBody(response: Response): Promise<string> {
  const buffer = await response.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  const contentEncoding = response.headers.get('content-encoding')?.toLowerCase();
  const isGzip =
    (contentEncoding && contentEncoding.includes('gzip')) ||
    (bytes.length >= 2 && bytes[0] === 0x1f && bytes[1] === 0x8b);

  if (isGzip && typeof DecompressionStream !== 'undefined') {
    try {
      const ds = new DecompressionStream('gzip');
      const writer = ds.writable.getWriter();
      writer.write(bytes);
      writer.close();
      return await new Response(ds.readable).text();
    } catch {
      // Fall through to plain text decoder if decompression fails
    }
  }
  return new TextDecoder().decode(bytes);
}

async function ask<T>(url: string, init?: RequestInit): Promise<T> {
  const doFetch = getFetch();
  let response: Response;
  try {
    response = await doFetch(url, init);
  } catch {
    // fetch rejects with "Failed to fetch" when nothing is listening. That is
    // the browser talking about itself; name the node and the address instead.
    throw new Error(`No node answering at ${new URL(url).origin}`);
  }
  if (response.status === 404 && url.includes('/v1/node/')) {
    const fallbackUrl = url.replace('/v1/node/', '/v2/');
    try {
      const fallbackResp = await doFetch(fallbackUrl, init);
      if (fallbackResp.ok) {
        response = fallbackResp;
      }
    } catch {
      // Keep original 404 response
    }
  }
  const text = await decodeResponseBody(response);
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    // Every node path answers JSON, so a body that is not JSON is itself the
    // failure and the raw text is the most useful thing to put on screen.
    throw new Error(text.slice(0, 200) || `${response.status} ${response.statusText}`);
  }
  if (!response.ok) {
    const fault = body as Fault | null;
    const detail =
      fault?.message ??
      (typeof fault?.error === 'string' ? fault.error : fault?.error?.message);
    throw new Error(detail ?? `${response.status} ${response.statusText}`);
  }
  return body as T;
}

const post = <T>(at: Session, path: string, body: unknown) =>
  ask<T>(at.address + path, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${at.token}`,
    },
    body: JSON.stringify(body),
  });

const get = <T>(at: Session, path: string) =>
  ask<T>(at.address + path, { headers: { Authorization: `Bearer ${at.token}` } });

export const health = async (
  address: string = LOCAL_NODE,
  retries = 3,
  delayMs = 600,
): Promise<Health> => {
  let lastErr: unknown;
  for (let i = 0; i <= retries; i++) {
    try {
      return await ask<Health>(`${address}/v1/node/health_check`);
    } catch (err) {
      lastErr = err;
      if (i < retries) {
        await new Promise((r) => setTimeout(r, delayMs));
      }
    }
  }
  throw lastErr;
};

/**
 * Pair with a pristine node. The key it mints is the only way back in, so the
 * caller persists it; a node that has already paired will not mint a second.
 */
export async function pair(address: string = LOCAL_NODE): Promise<Auth> {
  const keys = await generateMyEncryptionKeys();
  const paired = await ask<{
    api_v2_key: string;
    node_name: string;
    encryption_public_key: string;
    identity_public_key: string;
  }>(`${address}/v1/node/initial_registration`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      profile_encryption_pk: keys.profile_encryption_pk,
      profile_identity_pk: keys.profile_identity_pk,
    }),
  });
  return {
    profile: PROFILE,
    node_address: address,
    api_v2_key: paired.api_v2_key,
    hanzo_identity: paired.node_name,
    encryption_pk: paired.encryption_public_key,
    identity_pk: paired.identity_public_key,
  };
}

/** What this node can actually answer with, as it reports it. */
export const providers = (at: Session) => get<Provider[]>(at, '/v1/node/available_models');

export async function conversations(at: Session): Promise<Conversation[]> {
  const inboxes = await get<
    { inbox_id: string; custom_name: string; datetime_created: string }[]
  >(at, '/v1/node/all_inboxes');
  return inboxes
    .filter((inbox) => inbox.inbox_id.startsWith('job_inbox::'))
    .map((inbox) => ({ inbox: inbox.inbox_id, name: inbox.custom_name || 'New chat' }));
}

export const inboxOf = (job: string) => `job_inbox::${job}::false`;
export const jobOf = (inbox: string) => inbox.split('::')[1] ?? '';

/** Open a conversation against one provider. */
export async function start(at: Session, provider: string): Promise<string> {
  const { job_id } = await post<{ job_id: string }>(at, '/v1/node/create_job', {
    llm_provider: provider,
    job_creation_info: {
      scope: {
        vector_fs_items: [],
        vector_fs_folders: [],
        vector_search_mode: 'FillUpTo25k',
      },
      is_hidden: false,
    },
  });
  return job_id;
}

export const say = (at: Session, job: string, content: string) =>
  post<{ message_id: string }>(at, '/v1/node/job_message', {
    job_message: {
      job_id: job,
      content,
      parent: null,
      tool_key: null,
      fs_files_paths: [],
      job_filenames: [],
    },
  });

export const halt = (at: Session, inbox: string) =>
  post<unknown>(at, '/v1/node/stop_llm', { inbox_name: inbox });

type Said = {
  job_message: { content: string };
  node_api_data: { node_message_hash: string };
  sender_subidentity: string;
};

export async function history(at: Session, inbox: string, limit = 40): Promise<Turn[]> {
  const said = await post<Said[]>(at, '/v1/node/last_messages', {
    inbox_name: inbox,
    limit,
    offset_key: null,
  });
  return said.map((one, index) => ({
    id: one.node_api_data?.node_message_hash || `${inbox}-${index}`,
    role: one.sender_subidentity === PROFILE ? 'user' : 'assistant',
    content: one.job_message?.content ?? '',
  }));
}

type Frame = {
  inbox: string;
  message_type: 'Stream' | 'HanzoMessage' | 'Widget';
  message: string;
  metadata?: { is_done: boolean; is_reasoning: boolean };
};

/** Unwrap the envelope the node puts a finished turn in. */
function spoken(raw: string): { from: string; content: string } | undefined {
  try {
    const envelope = JSON.parse(raw);
    const body = envelope?.body?.unencrypted;
    const said = JSON.parse(body?.message_data?.unencrypted?.message_raw_content ?? '');
    return {
      from: body?.internal_metadata?.sender_subidentity ?? '',
      content: said?.content ?? '',
    };
  } catch {
    return undefined;
  }
}

/**
 * The token stream for one conversation.
 *
 * `ready` resolves once the subscription is on the wire, which is what a caller
 * awaits before posting: a message posted first can be answered before anyone
 * is listening, and those tokens are gone.
 *
 * `settled` carries the node's own copy of the finished answer rather than what
 * the deltas accumulated, so a node or provider that does not stream still
 * produces a complete turn instead of an empty one.
 */
export function listen(
  at: Session,
  inbox: string,
  on: {
    delta: (text: string) => void;
    settled: (content: string) => void;
    failed: (why: string) => void;
  },
): { close: () => void; ready: Promise<void> } {
  const api = new URL(at.address);
  const socket = new WebSocket(`ws://${api.hostname}:${Number(api.port) + 1}/ws`);

  const ready = new Promise<void>((resolve, reject) => {
    socket.addEventListener('open', () => {
      socket.send(
        JSON.stringify({
          bearer_auth: at.token,
          message: {
            subscriptions: [{ topic: 'inbox', subtopic: inbox }],
            unsubscriptions: [],
          },
        }),
      );
      resolve();
    });
    socket.addEventListener('error', () => reject(new Error('The node closed the stream.')));
  });

  socket.addEventListener('message', (event) => {
    let frame: Frame;
    try {
      frame = JSON.parse(String(event.data));
    } catch {
      return;
    }
    if (frame.inbox !== inbox) return;

    if (frame.message_type === 'Stream') {
      // Reasoning rides the same topic and is not the answer.
      if (!frame.metadata?.is_reasoning && frame.message) on.delta(frame.message);
      return;
    }
    if (frame.message_type !== 'HanzoMessage') return;

    const said = spoken(frame.message);
    // The node echoes the question back before it answers it; whoever asked is
    // already looking at it.
    if (!said || said.from === PROFILE) return;
    on.settled(said.content);
  });

  socket.addEventListener('error', () => on.failed('Lost the connection to the node.'));

  return { close: () => socket.close(), ready };
}
