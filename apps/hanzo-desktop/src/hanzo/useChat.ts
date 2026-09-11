import { useCallback, useEffect, useRef, useState } from 'react';
import { type ModelCatalogEntry } from '@hanzo/ui/models';

import { safeInvoke } from '../utils/tauri-check';
import { useAuth } from '../store/auth';
import {
  type Conversation,
  type Health,
  type Session,
  type Turn,
  conversations,
  halt,
  health,
  history,
  inboxOf,
  jobOf,
  listen,
  LOCAL_NODE,
  pair,
  providers,
  say,
  start,
} from './node';

let minted = 0;
const mint = () => `t${++minted}`;

/**
 * The conversation, held by the surface.
 *
 * `@hanzo/ui/chat`'s `Chat` takes the thread and does not own it, so this is
 * the whole of the state and the picture reads it. Nothing here draws.
 */
export function useChat() {
  const auth = useAuth((state) => state.auth);
  const setAuth = useAuth((state) => state.setAuth);

  const [session, setSession] = useState<Session | null>(null);
  const [where, setWhere] = useState<Health | null>(null);
  const [fault, setFault] = useState('');
  const [catalog, setCatalog] = useState<ModelCatalogEntry[]>([]);
  const [model, setModel] = useState('');
  const [chats, setChats] = useState<Conversation[]>([]);
  const [inbox, setInbox] = useState('');
  const [turns, setTurns] = useState<Turn[]>([]);
  const [streaming, setStreaming] = useState(false);
  // Bumped to ask the pairing effect to try again after a reset.
  const [attempt, setAttempt] = useState(0);

  const wire = useRef<{ close: () => void; ready: Promise<void>; inbox: string } | null>(null);
  // The turn the socket is currently filling, and the question that produced
  // it — a retry needs the question after the turn carrying it is gone.
  const filling = useRef('');
  const asked = useRef('');
  const pairing = useRef(false);

  const excuse = (why: unknown) => (why instanceof Error ? why.message : String(why));

  // Pair with the node, or use the key it minted for us last time. StrictMode
  // runs this twice on the same instance and only the first pairing can
  // succeed, so the ref — which survives that — is what stops the second.
  //
  // The ref is the ONLY guard: a cancelled-on-cleanup flag deadlocks here,
  // because StrictMode's second run finds the first still in flight and returns,
  // and the first then discards its own result as stale. Nothing sets state,
  // nothing re-runs, and the surface says "Connecting…" forever.
  useEffect(() => {
    if (session || pairing.current) return;
    pairing.current = true;
    void (async () => {
      try {
        const state = await health(LOCAL_NODE);
        setWhere(state);
        const known = state.is_pristine ? await pair(LOCAL_NODE) : auth;
        if (!known?.api_v2_key) {
          throw new Error(
            `The node at ${LOCAL_NODE} answered, but this install holds no key for it. Reset the node's storage to pair again.`,
          );
        }
        if (state.is_pristine) setAuth(known);
        setSession({ address: known.node_address, token: known.api_v2_key });
      } catch (why) {
        setFault(excuse(why));
      } finally {
        pairing.current = false;
      }
    })();
  }, [attempt, auth, session, setAuth]);

  const refresh = useCallback(async (at: Session) => {
    setChats(await conversations(at));
  }, []);

  // What the node can answer with, and what it has answered before. Both can
  // change while the app is open — a provider added in the node manager, a
  // conversation the node has just named — so this is a function, not a
  // one-shot effect body.
  const reload = useCallback(async (at: Session) => {
    const [found, existing] = await Promise.all([providers(at), conversations(at)]);
    setCatalog(
      found.map((one) => ({
        id: one.id,
        label: one.name,
        description: one.model,
        modality: 'chat',
      })),
    );
    setModel((current) => (found.some((one) => one.id === current) ? current : found[0]?.id || ''));
    setChats(existing);
  }, []);

  useEffect(() => {
    if (!session) return;
    let live = true;
    void reload(session).catch((why) => {
      if (live) setFault(excuse(why));
    });
    return () => {
      live = false;
    };
  }, [reload, session]);

  const fill = useCallback((edit: (turn: Turn) => Turn) => {
    setTurns((all) => all.map((turn) => (turn.id === filling.current ? edit(turn) : turn)));
  }, []);

  /** Subscribe to a conversation, and answer once the subscription is live. */
  const attach = useCallback(
    async (box: string) => {
      if (!session) return;
      if (wire.current?.inbox === box) {
        await wire.current.ready;
        return;
      }
      wire.current?.close();
      const socket = listen(session, box, {
        delta: (text) => fill((turn) => ({ ...turn, content: turn.content + text })),
        settled: (content) => {
          fill((turn) => ({ ...turn, content }));
          filling.current = '';
          setStreaming(false);
          // The node names a conversation from its first exchange.
          void refresh(session).catch(() => {});
        },
        failed: (why) => {
          fill((turn) => ({ ...turn, error: why }));
          filling.current = '';
          setStreaming(false);
        },
      });
      wire.current = { ...socket, inbox: box };
      await socket.ready;
    },
    [fill, refresh, session],
  );

  useEffect(
    () => () => {
      wire.current?.close();
      wire.current = null;
    },
    [],
  );

  const open = useCallback(
    async (box: string) => {
      if (!session) return;
      setInbox(box);
      setStreaming(false);
      filling.current = '';
      try {
        setTurns(await history(session, box));
        await attach(box);
      } catch (why) {
        setFault(excuse(why));
      }
    },
    [attach, session],
  );

  /** A fresh conversation has no job until the first message, so nothing is
   *  created on the node until there is something to say. */
  const fresh = useCallback(() => {
    wire.current?.close();
    wire.current = null;
    filling.current = '';
    setInbox('');
    setTurns([]);
    setStreaming(false);
    if (session) void reload(session).catch(() => {});
  }, [reload, session]);

  /**
   * Re-pair with a node we own but hold no key for.
   *
   * The key the node mints exists in exactly two places: the node's own
   * database and this install's keychain. `secure-storage` falls back to a
   * session-only map when the OS has no keyring, so a restart there loses the
   * key while the node stays paired, and a node that has paired will not mint a
   * second key — the app is then locked out of a node it spawned itself. The
   * only way back is to reset the node and pair again, which is why the failure
   * carries this rather than just naming the problem. It costs the
   * conversations stored on that node, so it is a press, never automatic.
   */
  const repair = useCallback(async () => {
    setFault('');
    try {
      await safeInvoke('hanzo_node_kill');
      await safeInvoke('hanzo_node_remove_storage', { preserveKeys: false });
      await safeInvoke('hanzo_node_spawn');
      setAttempt((n) => n + 1);
    } catch (why) {
      setFault(excuse(why));
    }
  }, []);

  const ask = useCallback(
    async (text: string) => {
      if (!session || !model) return;
      asked.current = text;
      const answer: Turn = { id: mint(), role: 'assistant', content: '' };
      filling.current = answer.id;
      setTurns((all) => [...all, { id: mint(), role: 'user', content: text }, answer]);
      setStreaming(true);
      try {
        let box = inbox;
        if (!box) {
          box = inboxOf(await start(session, model));
          setInbox(box);
        }
        await attach(box);
        await say(session, jobOf(box), text);
        void refresh(session).catch(() => {});
      } catch (why) {
        fill((turn) => ({ ...turn, error: excuse(why) }));
        filling.current = '';
        setStreaming(false);
      }
    },
    [attach, fill, inbox, model, refresh, session],
  );

  const stop = useCallback(async () => {
    filling.current = '';
    setStreaming(false);
    if (session && inbox) await halt(session, inbox).catch(() => {});
  }, [inbox, session]);

  const retry = useCallback(() => {
    const again = asked.current;
    setTurns((all) => all.slice(0, -2));
    void ask(again);
  }, [ask]);

  return {
    ready: Boolean(session),
    where,
    address: LOCAL_NODE,
    fault,
    catalog,
    model,
    setModel,
    chats,
    inbox,
    messages: turns,
    streaming,
    open,
    fresh,
    send: ask,
    stop,
    retry,
    repair,
  };
}
