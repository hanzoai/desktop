import {
  type WidgetToolType,
  type WsMessage,
} from '@hanzo_network/hanzo-message-ts/api/general/types';
import { extractJobIdFromInbox } from '@hanzo_network/hanzo-message-ts/utils/inbox_name_handler';
import {
  FunctionKeyV2,
  generateOptimisticAssistantMessage,
  OPTIMISTIC_ASSISTANT_MESSAGE_ID,
} from '@hanzo_network/hanzo-node-state/v2/constants';
import {
  type FormattedMessage,
  type ChatConversationInfiniteData,
  type ToolCall,
} from '@hanzo_network/hanzo-node-state/v2/queries/getChatConversation/types';
import { useGetProviderFromJob } from '@hanzo_network/hanzo-node-state/v2/queries/getProviderFromJob/useGetProviderFromJob';
import { useQueryClient } from '@tanstack/react-query';
import { produce } from 'immer';
import { createContext, useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router';
import useWebSocket, { ReadyState } from 'react-use-websocket';
import { create } from 'zustand';

import { useAuth } from '../../store/auth';
import { useToolsStore } from './context/tools-context';

type UseWebSocketMessage = {
  enabled?: boolean;
  inboxId: string;
};

// Robust reconnect options shared by every node WebSocket consumer.
// `react-use-websocket` does NOT reconnect by default (it only retries when
// `shouldReconnect` is provided and returns true). Without this, a node
// restart / re-pair silently kills the socket and the chat spinner hangs
// forever because streamed tokens and the "done" event never arrive.
// We always attempt to reconnect (including on error) with an exponential
// backoff capped at 10s, effectively forever, so the live stream survives
// node restarts and re-auth.
const WS_RECONNECT_OPTIONS = {
  share: true,
  shouldReconnect: () => true,
  retryOnError: true,
  reconnectAttempts: Number.MAX_SAFE_INTEGER,
  reconnectInterval: (attempt: number) =>
    Math.min(1000 * 2 ** attempt, 10_000),
} as const;

export const useWebSocketMessage = ({
  enabled,
  inboxId: defaultInboxId,
}: UseWebSocketMessage) => {
  const auth = useAuth((state) => state.auth);
  const nodeAddressUrl = new URL(auth?.node_address ?? 'http://localhost:3690');
  const socketUrl = ['localhost', '0.0.0.0', '127.0.0.1'].includes(
    nodeAddressUrl.hostname,
  )
    ? `ws://${nodeAddressUrl.hostname}:${Number(nodeAddressUrl.port) + 1}/ws`
    : `ws://${nodeAddressUrl.hostname}${Number(nodeAddressUrl.port) !== 0 ? `:${Number(nodeAddressUrl.port)}` : ''}/ws`;
  const queryClient = useQueryClient();
  const isStreamSupported = useRef(false);

  const { sendMessage, lastMessage, readyState } = useWebSocket(
    socketUrl,
    WS_RECONNECT_OPTIONS,
    enabled,
  );
  const { inboxId: encodedInboxId = '' } = useParams();
  const inboxId = defaultInboxId || decodeURIComponent(encodedInboxId);

  const queryKey = useMemo(() => {
    return [FunctionKeyV2.GET_CHAT_CONVERSATION_PAGINATION, { inboxId }];
  }, [inboxId]);

  const { data: provider } = useGetProviderFromJob({
    jobId: inboxId ? extractJobIdFromInbox(inboxId) : '',
    token: auth?.api_v2_key ?? '',
    nodeAddress: auth?.node_address ?? '',
  });

  useEffect(() => {
    if (!enabled || !auth) return;
    if (lastMessage?.data) {
      try {
        const parseData: WsMessage = JSON.parse(lastMessage.data);
        if (parseData.inbox !== inboxId) return;

        const isUserMessage =
          parseData.message_type === 'HanzoMessage' &&
          parseData.message &&
          JSON.parse(parseData.message)?.external_metadata.sender ===
            auth.hanzo_identity &&
          JSON.parse(parseData.message)?.body.unencrypted.internal_metadata
            .sender_subidentity === auth.profile;

        const isAssistantMessage =
          parseData.message_type === 'HanzoMessage' &&
          parseData.message &&
          !(
            JSON.parse(parseData.message)?.external_metadata.sender ===
              auth.hanzo_identity &&
            JSON.parse(parseData.message)?.body.unencrypted.internal_metadata
              .sender_subidentity === auth.profile
          );

        if (isUserMessage) {
          queryClient.setQueryData(
            queryKey,
            produce((draft: ChatConversationInfiniteData) => {
              if (!draft?.pages?.[0]) return;

              const lastPage = draft.pages[draft.pages.length - 1];
              const lastMessage = lastPage?.[lastPage.length - 1];

              // validate if optimistic message is already there
              if (
                lastMessage &&
                lastMessage.messageId === OPTIMISTIC_ASSISTANT_MESSAGE_ID &&
                lastMessage.role === 'assistant' &&
                lastMessage.status?.type === 'running'
              ) {
                lastMessage.content = '';
              } else {
                const newMessages = [
                  generateOptimisticAssistantMessage(provider),
                ];
                if (lastPage) {
                  lastPage.push(...newMessages);
                } else {
                  draft.pages.push(newMessages);
                }
              }
            }),
          );
          return;
        }
        if (isAssistantMessage && !isStreamSupported.current) {
          void queryClient.invalidateQueries({ queryKey: queryKey });
          return;
        }
        isStreamSupported.current = false;

        // finalize the optimistic assistant message immediately when the final assistant message arrives
        if (isAssistantMessage) {
          queryClient.setQueryData(
            queryKey,
            produce((draft: ChatConversationInfiniteData | undefined) => {
              if (!draft?.pages?.[0]) return;
              const lastMessage = draft.pages.at(-1)?.at(-1);
              if (
                lastMessage &&
                lastMessage.messageId === OPTIMISTIC_ASSISTANT_MESSAGE_ID &&
                lastMessage.role === 'assistant' &&
                lastMessage.status?.type === 'running'
              ) {
                // Mark as complete so the UI stops "thinking"
                lastMessage.status = { type: 'complete', reason: 'unknown' };
                // Optional: also close reasoning if it's still marked running
                if (lastMessage.reasoning?.status?.type === 'running') {
                  lastMessage.reasoning.status = {
                    type: 'complete',
                    reason: 'unknown',
                  };
                }
              }
            }),
          );

          // now fetch the authoritative message to replace optimistic state
          void queryClient.invalidateQueries({ queryKey });
          return;
        }

        if (parseData.message_type !== 'Stream') return;
        isStreamSupported.current = true;

        queryClient.setQueryData(
          queryKey,
          produce((draft: ChatConversationInfiniteData | undefined) => {
            if (!draft?.pages?.[0]) return;
            const lastMessage: FormattedMessage | undefined = draft.pages
              .at(-1)
              ?.at(-1);
            if (
              lastMessage &&
              lastMessage.messageId === OPTIMISTIC_ASSISTANT_MESSAGE_ID &&
              lastMessage.role === 'assistant' &&
              lastMessage.status?.type === 'running'
            ) {
              if (parseData.metadata?.is_reasoning) {
                if (!lastMessage.reasoning) {
                  lastMessage.reasoning = {
                    text: '',
                    status: { type: 'running' },
                  };
                }
                lastMessage.reasoning.text += parseData.message;
                lastMessage.reasoning.status = { type: 'running' };
              } else {
                if (lastMessage.reasoning) {
                  lastMessage.reasoning.status = {
                    type: 'complete',
                    reason: 'unknown',
                  };
                }
                lastMessage.content += parseData.message;
              }
            }
          }),
        );
      } catch (error) {
        console.error('Failed to parse ws message', error);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    auth?.hanzo_identity,
    auth?.profile,
    enabled,
    inboxId,
    lastMessage?.data,
    queryClient,
    queryKey,
  ]);

  useEffect(() => {
    if (!enabled) return;
    // Only (re)subscribe once the socket is actually OPEN. Re-running this on
    // `readyState` ensures we re-subscribe after every reconnect (node restart
    // / re-pair) with the current api_v2_key, instead of subscribing once on a
    // socket that may not be open yet and never recovering.
    if (readyState !== ReadyState.OPEN) return;
    const wsMessage = {
      bearer_auth: auth?.api_v2_key ?? '',
      message: {
        subscriptions: [{ topic: 'inbox', subtopic: inboxId }],
        unsubscriptions: [],
      },
    };
    const wsMessageString = JSON.stringify(wsMessage);
    sendMessage(wsMessageString);
  }, [
    auth?.api_v2_key,
    auth?.hanzo_identity,
    enabled,
    inboxId,
    readyState,
    sendMessage,
  ]);

  return {
    readyState,
  };
};

export const useWebSocketTools = ({
  enabled,
  inboxId: defaultInboxId,
}: UseWebSocketMessage) => {
  const auth = useAuth((state) => state.auth);
  const nodeAddressUrl = new URL(auth?.node_address ?? 'http://localhost:3690');
  const socketUrl = ['localhost', '0.0.0.0', '127.0.0.1'].includes(
    nodeAddressUrl.hostname,
  )
    ? `ws://${nodeAddressUrl.hostname}:${Number(nodeAddressUrl.port) + 1}/ws`
    : `ws://${nodeAddressUrl.hostname}${Number(nodeAddressUrl.port) !== 0 ? `:${Number(nodeAddressUrl.port)}` : ''}/ws`;
  const { sendMessage, lastMessage, readyState } = useWebSocket(
    socketUrl,
    WS_RECONNECT_OPTIONS,
    enabled,
  );
  const { inboxId: encodedInboxId = '' } = useParams();
  const inboxId = defaultInboxId || decodeURIComponent(encodedInboxId);
  const queryClient = useQueryClient();

  const setWidget = useToolsStore((state) => state.setWidget);

  const queryKey = useMemo(() => {
    return [FunctionKeyV2.GET_CHAT_CONVERSATION_PAGINATION, { inboxId }];
  }, [inboxId]);

  useEffect(() => {
    if (!enabled) return;
    if (lastMessage?.data) {
      try {
        const parseData: WsMessage = JSON.parse(lastMessage.data);
        if (parseData.inbox !== inboxId) return;

        if (
          parseData.message_type === 'Widget' &&
          parseData?.widget?.ToolRequest
        ) {
          const tool = parseData.widget.ToolRequest;
          queryClient.setQueryData(
            queryKey,
            produce((draft: ChatConversationInfiniteData | undefined) => {
              if (!draft?.pages?.[0]) return;
              const lastMessage = draft.pages.at(-1)?.at(-1);
              if (
                lastMessage &&
                lastMessage.messageId === OPTIMISTIC_ASSISTANT_MESSAGE_ID &&
                lastMessage.role === 'assistant' &&
                lastMessage.status?.type === 'running'
              ) {
                const existingToolCall: ToolCall | undefined =
                  lastMessage.toolCalls?.[tool.index];

                if (existingToolCall) {
                  lastMessage.toolCalls[tool.index] = {
                    ...lastMessage.toolCalls[tool.index],
                    status: tool.status.type_,
                    result: tool.result?.data.message,
                  };
                } else {
                  lastMessage.toolCalls.push({
                    name: tool.tool_name,
                    // TODO: fix this based on backend
                    args: tool?.args ?? tool?.args?.arguments,
                    status: tool.status.type_,
                    toolRouterKey: tool?.tool_router_key ?? '',
                    result: tool.result?.data.message,
                  });
                }
              }
            }),
          );
        }

        if (
          parseData.message_type === 'Widget' &&
          parseData?.widget?.PaymentRequest
        ) {
          const widgetName = Object.keys(parseData.widget)[0];
          setWidget({
            name: widgetName as WidgetToolType,
            data: parseData.widget[widgetName as WidgetToolType],
          });
        }
      } catch (error) {
        console.error('Failed to parse ws message', error);
      }
    }
  }, [enabled, inboxId, lastMessage?.data, queryClient]);

  useEffect(() => {
    if (!enabled) return;
    // Re-subscribe to the widget topic on every (re)connect once OPEN, with the
    // current api_v2_key, so tool/widget streams survive node restarts.
    if (readyState !== ReadyState.OPEN) return;
    const wsMessage = {
      bearer_auth: auth?.api_v2_key ?? '',
      message: {
        subscriptions: [{ topic: 'widget', subtopic: inboxId }],
        unsubscriptions: [],
      },
    };
    const wsMessageString = JSON.stringify(wsMessage);
    sendMessage(wsMessageString);
  }, [
    auth?.api_v2_key,
    auth?.hanzo_identity,
    enabled,
    inboxId,
    readyState,
    sendMessage,
  ]);

  return { readyState };
};

type ContentPartState = {
  type: 'text';
  text: string;
  part: {
    type: 'text';
    text: string;
  };
  status: {
    type: 'complete' | 'running';
  };
};

export const ContentPartContext = createContext({});
const COMPLETE_STATUS = {
  type: 'complete' as const,
};

const RUNNING_STATUS = {
  type: 'running' as const,
};

export const TextContentPartProvider = ({
  isRunning,
  text,
  children,
}: {
  text: string;
  isRunning?: boolean | undefined;
  children: React.ReactNode;
}) => {
  const [store] = useState(() => {
    return create<ContentPartState>(() => ({
      status: isRunning ? RUNNING_STATUS : COMPLETE_STATUS,
      part: { type: 'text', text },
      type: 'text',
      text: '',
    }));
  });

  useEffect(() => {
    const state = store.getState() as ContentPartState & {
      type: 'text';
    };

    const textUpdated = state.text !== text;
    const targetStatus = isRunning ? RUNNING_STATUS : COMPLETE_STATUS;
    const statusUpdated = state.status !== targetStatus;

    if (!textUpdated && !statusUpdated) return;

    store.setState(
      {
        type: 'text',
        text,
        part: { type: 'text', text },
        status: targetStatus,
      } satisfies ContentPartState,
      true,
    );
  }, [store, isRunning, text]);

  return (
    <ContentPartContext.Provider value={store}>
      {children}
    </ContentPartContext.Provider>
  );
};
