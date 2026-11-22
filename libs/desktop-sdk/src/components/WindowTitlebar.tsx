import type { CSSProperties, ReactNode } from 'react';
import { getTitlebarInset } from '../runtime';

export interface WindowTitlebarProps {
  title: string;
  icon?: ReactNode;
  status?: ReactNode;
  actions?: ReactNode;
  userAgent?: string;
  className?: string;
  style?: CSSProperties;
}

/**
 * Reusable cross-platform Tauri v2 window titlebar.
 * Carries `data-tauri-drag-region` so frameless or overlay windows can be
 * dragged natively while keeping interactive child controls clickable, and
 * reserves left clearance for macOS traffic-light controls automatically.
 */
export function WindowTitlebar({
  title,
  icon,
  status,
  actions,
  userAgent,
  className,
  style,
}: WindowTitlebarProps) {
  const inset = getTitlebarInset(userAgent);
  return (
    <header
      className={className}
      data-tauri-drag-region=""
      role="banner"
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        height: 40,
        paddingLeft: inset + 12,
        paddingRight: 12,
        userSelect: 'none',
        borderBottom: '1px solid rgba(128, 128, 128, 0.2)',
        ...style,
      }}
    >
      <div
        data-tauri-drag-region=""
        style={{ display: 'flex', alignItems: 'center', gap: 8 }}
      >
        {icon}
        <span style={{ fontWeight: 600, fontSize: 13 }}>{title}</span>
        {status}
      </div>
      {actions ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {actions}
        </div>
      ) : null}
    </header>
  );
}
