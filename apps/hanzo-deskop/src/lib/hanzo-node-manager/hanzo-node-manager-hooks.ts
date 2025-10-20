import { type Event, type EventCallback, listen } from '@tauri-apps/api/event';
import { warn } from '@tauri-apps/plugin-log';
import { useEffect, useState } from 'react';

import {
  HanzoNodeManagerEvent,
  type HanzoNodeManagerEventMap,
} from './hanzo-node-manager-client-types';
import {
  // ollamaStartedToast,
  ollamaStartErrorToast,
  ollamaStopErrorToast,
  ollamaStoppedToast,
  // pullingModelDoneToast,
  pullingModelErrorToast,
  hanzoNodeStartedToast,
  // pullingModelProgressToast,
  // pullingModelStartToast,
  // hanzoNodeStartedToast,
  hanzoNodeStartErrorToast,
  hanzoNodeStopErrorToast,
  hanzoNodeStoppedToast,
  // startingOllamaToast,
  // startingHanzoNodeToast,
  stoppingOllamaToast,
  stoppingHanzoNodeToast,
} from './hanzo-node-manager-toasts-utils';

/**
 * Custom React hook to subscribe to Tauri events.
 * @param eventName The name of the event to subscribe to.
 * @param callback The callback function to execute when the event is received.
 */
const useTauriEvent = <T>(eventName: string, callback: EventCallback<T>) => {
  useEffect(() => {
    // Subscribe to the Tauri event
    const unsubscribe = listen(eventName, (event: Event<T>) => {
      callback(event);
    });

    // Cleanup subscription on component unmount
    return () => {
      void unsubscribe.then((unsub) => unsub());
    };
  }, [eventName, callback]);
};

export const useHanzoNodeStateChange = (
  callback: EventCallback<HanzoNodeManagerEventMap>,
) => {
  return useTauriEvent<HanzoNodeManagerEventMap>(
    'hanzo-node-state-change',
    callback,
  );
};

export const mapEvent = (
  event: object | string,
): HanzoNodeManagerEventMap => {
  if (typeof event === 'object') {
    return {
      type: Object.keys(event)[0] as HanzoNodeManagerEvent,
      payload: Object.values(event)[0],
    } as any;
  } else {
    return { type: event as HanzoNodeManagerEvent } as any;
  }
};

export const useHanzoNodeEventsToast = () => {
  const [hanzoNodeEventState, setHanzoNodeEventState] = useState({
    type: '' as HanzoNodeManagerEvent,
    payload: {} as any,
  });
  useHanzoNodeStateChange((event) => {
    const hanzoNodeEvent = mapEvent(event.payload);
    setHanzoNodeEventState(hanzoNodeEvent);
    switch (hanzoNodeEvent.type) {
      // case HanzoNodeManagerEvent.StartingHanzoNode:
      //   startingHanzoNodeToast();
      //   break;
      case HanzoNodeManagerEvent.HanzoNodeStarted:
        hanzoNodeStartedToast();
        break;
      case HanzoNodeManagerEvent.HanzoNodeStartError:
        hanzoNodeStartErrorToast();
        break;

      case HanzoNodeManagerEvent.StoppingHanzoNode:
        stoppingHanzoNodeToast();
        break;
      case HanzoNodeManagerEvent.HanzoNodeStopped:
        hanzoNodeStoppedToast();
        break;
      case HanzoNodeManagerEvent.HanzoNodeStopError:
        hanzoNodeStopErrorToast();
        break;

      // case HanzoNodeManagerEvent.StartingOllama:
      //   startingOllamaToast();
      //   break;
      // case HanzoNodeManagerEvent.OllamaStarted:
      //   ollamaStartedToast();
      //   break;
      case HanzoNodeManagerEvent.OllamaStartError:
        ollamaStartErrorToast();
        break;

      case HanzoNodeManagerEvent.StoppingOllama:
        stoppingOllamaToast();
        break;
      case HanzoNodeManagerEvent.OllamaStopped:
        ollamaStoppedToast();
        break;
      case HanzoNodeManagerEvent.OllamaStopError:
        ollamaStopErrorToast();
        break;

      // case HanzoNodeManagerEvent.PullingModelStart:
      //   pullingModelStartToast(hanzoNodeEvent.payload.model);
      //   break;
      // case HanzoNodeManagerEvent.PullingModelProgress:
      //   pullingModelProgressToast(
      //     hanzoNodeEvent.payload.model,
      //     hanzoNodeEvent.payload.progress,
      //   );
      //   break;
      // case HanzoNodeManagerEvent.PullingModelDone:
      //   pullingModelDoneToast(hanzoNodeEvent.payload.model);
      //   break;
      case HanzoNodeManagerEvent.PullingModelError:
        pullingModelErrorToast(hanzoNodeEvent.payload.model);
        break;
      default:
        void warn(
          `unhandled hanzo node state change:${hanzoNodeEvent.type}`,
        );
    }
  });
  return hanzoNodeEventState;
};
