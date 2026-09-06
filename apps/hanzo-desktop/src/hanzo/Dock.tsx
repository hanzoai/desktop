import type { ReactNode } from 'react';
import { Button, Text, XStack, YStack } from '@hanzo/gui';
import { EmptyState } from '@hanzo/ui/product';
import { Plus, X } from '@hanzogui/lucide-icons-2';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';

import { ChromeButton } from './ChromeButton';
import { usePanels } from './panels';
import { SECTION, type SectionKey } from './sections';
import { CHROME_RADIUS, FOCUS_RING } from './theme';

/** Percent of the content column below which the strip has nowhere to sit. */
const MIN_DOCK = 15;
/** Percent of the content column the body always keeps. */
const MIN_BODY = 30;

/**
 * The strip's height is a BUDGET, not a preference. The body sits directly
 * above it, so every pixel the strip grows is a pixel the body loses — which
 * is why the buttons in it are bled into the strip's own padding rather than
 * allowed to push it taller. 32px of content + 4px padding either side + the
 * 1px rule = 41.
 */
const STRIP_PAD = 4;
/** The largest square that fits the strip's padding edge to edge. */
const STRIP_BUTTON = 32 + STRIP_PAD * 2;
/** A tab's close button. Under the 44 floor, over the 24 one — see below. */
const TAB_CLOSE = 24;

function DockTab({
  id,
  section,
  active,
}: {
  id: string;
  section: SectionKey;
  active: boolean;
}) {
  const setActiveTab = usePanels((state) => state.setActiveTab);
  const closeTab = usePanels((state) => state.closeTab);
  const { label, icon: Icon } = SECTION[section];

  /* The tab and its close button are SIBLINGS, not nested: a button inside a
     button is invalid markup, and the inner one would swallow the tab's own
     activation on the way past. */
  return (
    <XStack
      maxW={176}
      shrink={1}
      items="center"
      gap={4}
      pr={4}
      rounded={CHROME_RADIUS}
      bg={active ? '$color3' : 'transparent'}
      hoverStyle={{ bg: active ? '$color3' : '$color2' }}
    >
      <Button
        role="tab"
        id={`dock-tab-${id}`}
        data-testid={`dock-tab-${id}`}
        aria-selected={active}
        aria-controls="dock-tabpanel"
        tabIndex={active ? 0 : -1}
        minW={0}
        shrink={1}
        /* Explicit, because the tab is the TALLEST thing in the strip and so
           the thing that would silently spend the strip's budget: left to size
           itself off its own line-height it came out at 35 and pushed the strip
           to 44. At 32 it matches the +/× buttons' margin box exactly, which is
           what makes the strip's height the 41 its budget says it is. */
        height={STRIP_BUTTON - STRIP_PAD * 2}
        items="center"
        justify="flex-start"
        gap={6}
        py={0}
        pl={8}
        pr={0}
        borderWidth={0}
        bg="transparent"
        rounded={CHROME_RADIUS}
        cursor="pointer"
        focusVisibleStyle={FOCUS_RING}
        onPress={() => setActiveTab(id)}
      >
        <Icon size={14} color="$color11" />
        <Text fontSize={13} color="$color12" numberOfLines={1}>
          {label}
        </Text>
      </Button>
      {/* 24, not 20: 24px is the pointer-target floor a control may not go
          under (WCAG 2.5.8). The bleed gives back the 4px it grew by, so the
          tab measures what it did at 20 — the 2px it overhangs on each side
          land inside the tab's own gap and padding, never outside its box. */}
      <ChromeButton
        testId={`dock-tab-close-${id}`}
        label={`Close ${label}`}
        size={TAB_CLOSE}
        bleed={2}
        radius={6}
        icon={<X size={13} color="$color11" />}
        onPress={() => closeTab(id)}
      />
    </XStack>
  );
}

function Dock({ section }: { section: SectionKey }) {
  const tabs = usePanels((state) => state.dockTabs);
  const active = usePanels((state) => state.dockActive);
  const openTab = usePanels((state) => state.openTab);
  const toggle = usePanels((state) => state.toggle);
  const activeTab = tabs.find((tab) => tab.id === active);

  return (
    <YStack flex={1} minH={0} bg="$color1">
      <XStack
        role="tablist"
        aria-label="Dock"
        items="center"
        gap={4}
        px={STRIP_PAD}
        py={STRIP_PAD}
        borderBottomWidth={1}
        borderColor="$borderColor"
      >
        {tabs.map((tab) => (
          <DockTab
            key={tab.id}
            id={tab.id}
            section={tab.section}
            active={tab.id === active}
          />
        ))}
        {/* The box is 40 so the pointer has something to hit; the bleed gives
            the 8px back to the strip, so the strip stays the 41px tall it
            would be with a 32px button in it. It cannot reach 44 without
            overhanging the resize handle above and stealing its grab. */}
        <ChromeButton
          testId="dock-new-tab"
          label="Dock the current section"
          size={STRIP_BUTTON}
          bleed={STRIP_PAD}
          icon={<Plus size={15} color="$color11" />}
          onPress={() => openTab(section)}
        />
        <XStack flex={1} />
        <ChromeButton
          testId="dock-close"
          label="Close the dock"
          expanded={true}
          size={STRIP_BUTTON}
          bleed={STRIP_PAD}
          icon={<X size={15} color="$color11" />}
          onPress={() => toggle('dockOpen')}
        />
      </XStack>

      <YStack
        role="tabpanel"
        id="dock-tabpanel"
        aria-labelledby={activeTab ? `dock-tab-${activeTab.id}` : undefined}
        flex={1}
        minH={0}
        items="center"
        justify="center"
        p="$4"
        overflow="hidden"
      >
        {activeTab ? (
          <EmptyState
            icon={SECTION[activeTab.section].icon}
            title={SECTION[activeTab.section].title}
            description={SECTION[activeTab.section].description}
          />
        ) : (
          <Text fontSize={13} color="$color11">
            No tabs. Use + to dock a section.
          </Text>
        )}
      </YStack>
    </YStack>
  );
}

/**
 * The content body with the dock under it.
 *
 * The group is mounted whether or not the dock is open, so toggling the dock
 * never remounts the body — only the handle and the dock panel come and go.
 * `minSize` on the body panel is what keeps it on screen: the dock takes height
 * from the column, it never floats over it.
 */
export function DockGroup({
  section,
  children,
}: {
  section: SectionKey;
  children: ReactNode;
}) {
  const open = usePanels((state) => state.dockOpen);
  const size = usePanels((state) => state.dockSize);
  const setDockSize = usePanels((state) => state.setDockSize);

  return (
    <PanelGroup
      direction="vertical"
      style={{ height: '100%', width: '100%' }}
      onLayout={(sizes) => {
        if (sizes.length === 2) setDockSize(sizes[1]);
      }}
    >
      <Panel id="content-body" order={1} minSize={MIN_BODY}>
        {children}
      </Panel>
      {open && (
        /* The seam paints ONE rule — the handle's own 1px line — and the grab
           is an 8px band centred on it. A 1px target is not a target; the band
           overhangs 4px into the panel above and below, which is where a
           pointer aiming at the seam actually lands. */
        <PanelResizeHandle
          style={{ position: 'relative', height: 1, overflow: 'visible' }}
        >
          {/* The rule itself — the seam's one hairline, on the token. */}
          <YStack
            bg="$borderColor"
            style={{ position: 'absolute', inset: 0 }}
          />
          {/* The grab band. Transparent, so it carries no colour of its own. */}
          <div
            aria-hidden="true"
            data-testid="dock-resize-grab"
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              top: -4,
              height: 8,
              cursor: 'row-resize',
            }}
          />
        </PanelResizeHandle>
      )}
      {open && (
        <Panel
          id="dock"
          order={2}
          defaultSize={size}
          minSize={MIN_DOCK}
          style={{ display: 'flex' }}
        >
          <Dock section={section} />
        </Panel>
      )}
    </PanelGroup>
  );
}
