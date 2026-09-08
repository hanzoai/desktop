import { useCallback, useEffect, useRef, useState } from 'react';
import { type GuiElement, Text, XStack } from '@hanzo/gui';
import { FloatingMenu, type MenuItemSpec } from '@hanzo/ui/product';
import {
  Maximize2,
  Minimize2,
  Monitor,
  PanelLeft,
  PanelRight,
} from '@hanzogui/lucide-icons-2';

import { ChromeButton } from './ChromeButton';
import { usePanels } from './panels';
import { SECTIONS, type SectionKey } from './sections';
import { CHROME_CONTROL, CHROME_RADIUS, FOCUS_RING } from './theme';

/** Only the item variant of the shared spec — this menu has no separators. */
type ChromeMenuItem = Extract<MenuItemSpec, { type?: 'item' }>;

/** gui's element type spans web and native; this app only ever renders web. */
const asHtml = (el: GuiElement | null | undefined): HTMLElement | null =>
  el instanceof HTMLElement ? el : null;

/** Menu rows are chrome, so they are the chrome square tall, not the 30px a
 *  form menu uses. Fixed width, which is also what right-aligns it (see below). */
const MENU_WIDTH = 232;

/**
 * A chrome dropdown: rows at the chrome square's height, hung from the RIGHT
 * edge of its trigger.
 *
 * It composes the shared `FloatingMenu` rather than the shared `DropdownMenu`,
 * and both halves of that are deliberate:
 *
 *   - `FloatingMenu` is the fleet's ONE floating-panel mechanism (gui Portal,
 *     theme forwarding, outside-dismiss, Escape, edge-flip, arrow-key roving
 *     over `[role="menuitem"]`). All of that is reused verbatim; none of it is
 *     rewritten here.
 *   - `DropdownMenu` is not usable for a labelled trigger. It wraps whatever
 *     you hand it in its own pressable `XStack`, so the accessible name,
 *     `aria-expanded` and `aria-haspopup` would sit on an inner element while
 *     the outer one takes the press — and a gui `onPress` fired by Enter does
 *     not dispatch a DOM click, so a keyboard user's Enter would never reach
 *     the wrapper at all. Owning the open state puts the state on the button
 *     that announces it.
 */
function ChromeMenu({
  open,
  onClose,
  anchor,
  items,
}: {
  open: boolean;
  onClose: () => void;
  anchor: React.RefObject<GuiElement | null>;
  items: ChromeMenuItem[];
}) {
  /**
   * `FloatingMenu` hangs the panel's LEFT edge off `anchorRect().left`, so an
   * anchor shifted left by the panel's width right-aligns it to the trigger.
   * Passing a synthetic rect is the mechanism's own idiom — `ContextMenu`
   * passes a zero-size rect at the cursor. It is exact because the panel's
   * width is fixed at MENU_WIDTH; the rows shrink to it rather than widen it.
   */
  const anchorRect = useCallback(() => {
    const rect = asHtml(anchor.current)?.getBoundingClientRect();
    if (!rect) return null;
    return {
      left: rect.right - MENU_WIDTH,
      top: rect.top,
      right: rect.right,
      bottom: rect.bottom,
      width: rect.width,
      height: rect.height,
    };
  }, [anchor]);

  const anchorEl = useCallback(() => asHtml(anchor.current), [anchor]);

  /**
   * Move focus into the menu when it opens.
   *
   * `FloatingMenu` tries to do this by focusing its PANEL, but it does so in
   * the same layout effect that computes the panel's position — and until that
   * position lands the panel is `visibility: hidden`, which cannot take focus.
   * Measured: the keystroke that opened the menu left focus on the trigger and
   * the arrow keys went nowhere. Focusing the first ROW is both the repair and
   * what the ARIA menu-button pattern asks for. The panel is portalled out of
   * this tree, so it is reached by role rather than by ref; only one menu in
   * this window is ever open.
   */
  useEffect(() => {
    if (!open) return;
    const frame = requestAnimationFrame(() => {
      document
        .querySelector<HTMLElement>('[role="menu"] [role="menuitem"]')
        ?.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, [open]);

  return (
    <FloatingMenu
      open={open}
      onClose={onClose}
      anchorRect={anchorRect}
      anchorEl={anchorEl}
      minWidth={MENU_WIDTH}
      gap={6}
    >
      {items.map((item) => (
        <XStack
          key={item.key}
          role="menuitem"
          tabIndex={0}
          data-testid={`companion-${item.key}`}
          items="center"
          gap={10}
          px={10}
          height={CHROME_CONTROL}
          rounded={CHROME_RADIUS}
          cursor="pointer"
          select="none"
          hoverStyle={{ bg: '$color3' }}
          focusVisibleStyle={{ bg: '$color3', ...FOCUS_RING }}
          onPress={() => {
            item.onSelect();
            onClose();
          }}
          onKeyDown={(event: React.KeyboardEvent) => {
            if (event.key !== 'Enter' && event.key !== ' ') return;
            event.preventDefault();
            item.onSelect();
            onClose();
          }}
        >
          <XStack
            width={16}
            height={16}
            items="center"
            justify="center"
            shrink={0}
          >
            {item.icon}
          </XStack>
          <Text flex={1} fontSize={13} color="$color12" numberOfLines={1}>
            {item.label}
          </Text>
          {/* The shortcut, one rung under the label. `$color12` is the label's
              rung and would read as a second label; `$color11` is the muted
              rung the shared menu already uses for exactly this. */}
          {item.shortcut ? (
            <Text fontSize={12} color="$color11" shrink={0}>
              {item.shortcut}
            </Text>
          ) : null}
        </XStack>
      ))}
    </FloatingMenu>
  );
}

/** The sidebar toggle, at the left end of the chrome row. */
export function SidebarToggle() {
  const sidebarOpen = usePanels((state) => state.sidebarOpen);
  const toggle = usePanels((state) => state.toggle);

  return (
    <ChromeButton
      testId="toggle-sidebar"
      label={sidebarOpen ? 'Close sidebar' : 'Open sidebar'}
      expanded={sidebarOpen}
      active={false}
      icon={<PanelLeft size={17} color="$color11" />}
      onPress={() => toggle('sidebarOpen')}
    />
  );
}

/**
 * The cluster at the right end of the chrome row: width, companions, controls.
 *
 * It also owns the app's shortcuts, because the shortcut and the control it
 * duplicates have to agree and this is where the control is. `event.code`
 * rather than `event.key` — a digit typed with a modifier still reports its
 * physical key, and `key` varies by layout.
 */
export function PanelControls() {
  const [menuOpen, setMenuOpen] = useState(false);
  const companionsRef = useRef<GuiElement | null>(null);

  const maximized = usePanels((state) => state.maximized);
  const rightOpen = usePanels((state) => state.rightOpen);
  const dockOpen = usePanels((state) => state.dockOpen);
  const toggle = usePanels((state) => state.toggle);
  const openTab = usePanels((state) => state.openTab);

  const dock = useCallback(
    (section: SectionKey) => {
      openTab(section);
    },
    [openTab],
  );

  /* ⌘1…⌘5 dock the matching section — the same shortcut the menu row beside
     each section prints, doing the same thing the row does. */
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.altKey || event.shiftKey) {
        return;
      }
      const digit = /^Digit([1-9])$/.exec(event.code);
      const section = digit ? SECTIONS[Number(digit[1]) - 1] : undefined;
      if (!section) return;
      event.preventDefault();
      dock(section.key);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [dock]);

  const items: ChromeMenuItem[] = SECTIONS.map((section, index) => ({
    key: section.key,
    label: section.label,
    icon: <section.icon size={16} color="$color11" />,
    shortcut: `⌘${index + 1}`,
    onSelect: () => dock(section.key),
  }));

  return (
    <>
      <ChromeButton
        testId="maximize-content"
        label={maximized ? 'Restore content width' : 'Use full width'}
        expanded={maximized}
        active={maximized}
        icon={
          maximized ? (
            <Minimize2 size={17} color="$color11" />
          ) : (
            <Maximize2 size={17} color="$color11" />
          )
        }
        onPress={() => toggle('maximized')}
      />
      <ChromeButton
        testId="companions-menu"
        buttonRef={companionsRef}
        label="Companions"
        hasPopup="menu"
        expanded={menuOpen}
        /* Painted while the DOCK is open, not while the menu is: the button
           reports the state of the panel it opens things into. */
        active={dockOpen}
        icon={<Monitor size={17} color="$color11" />}
        onPress={() => setMenuOpen((open) => !open)}
      />
      <ChromeMenu
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        anchor={companionsRef}
        items={items}
      />
      <ChromeButton
        testId="toggle-right-panel"
        label={rightOpen ? 'Close controls' : 'Open controls'}
        expanded={rightOpen}
        active={rightOpen}
        icon={<PanelRight size={17} color="$color11" />}
        onPress={() => toggle('rightOpen')}
      />
    </>
  );
}
