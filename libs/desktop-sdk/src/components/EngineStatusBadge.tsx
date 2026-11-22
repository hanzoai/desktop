export interface EngineStatusBadgeProps {
  online: boolean;
  label?: string;
  modelCount?: number;
}

/**
 * Compact status indicator showing whether a local or remote OpenAI-compatible
 * inference engine is reachable.
 */
export function EngineStatusBadge({
  online,
  label,
  modelCount,
}: EngineStatusBadgeProps) {
  const text =
    label ??
    (online
      ? modelCount && modelCount > 0
        ? `Engine online (${modelCount} models)`
        : 'Engine online'
      : 'Engine offline');

  return (
    <span
      aria-live="polite"
      data-online={online ? 'true' : 'false'}
      role="status"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '2px 8px',
        borderRadius: 999,
        fontSize: 12,
        border: '1px solid rgba(128, 128, 128, 0.25)',
      }}
    >
      <span
        aria-hidden="true"
        style={{
          width: 7,
          height: 7,
          borderRadius: '50%',
          backgroundColor: online ? '#22c55e' : '#71717a',
        }}
      />
      {text}
    </span>
  );
}
