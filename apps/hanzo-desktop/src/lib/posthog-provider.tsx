import React from 'react';

export const AnalyticsEvents = {
  chatWithFiles: 'chat_with_files',
  UploadFiles: 'upload_files',
} as const;

export const AnalyticsProvider = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  return children;
};

export type AnalyticEventName =
  | 'Chat with Pre-built Agents'
  | 'Chat with Custom Agents'
  | 'Agent Created'
  | 'Agent Imported'
  | 'Custom Tool Created'
  | 'MCP Server Added'
  | 'Chat with AI Model'
  | 'Chat with Files'
  | 'Scheduled Task Created'
  | 'AI Chat with Files'
  | 'Upload Files'
  | 'Ask Local Files'
  | 'Edit and Regenerate Message';

export type AnalyticEventProps<TEventName extends AnalyticEventName> =
  TEventName extends 'Chat with Pre-built Agents'
    ? {
        agentName: string;
      }
    : TEventName extends 'AI Chat with Files'
      ? {
          filesCount: number;
        }
      : TEventName extends 'Upload Files'
        ? {
            filesCount: number;
          }
        : TEventName extends 'Ask Local Files'
          ? {
              foldersCount: number;
              filesCount: number;
            }
          : undefined;

export const useAnalytics = () => {
  function captureAnalyticEvent<TEventName extends AnalyticEventName>(
    _eventName: TEventName,
    _eventProps: AnalyticEventProps<TEventName>,
  ) {
    // Analytics removed — no-op stub
  }

  return {
    captureAnalyticEvent,
  };
};
