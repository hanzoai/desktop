import { useState } from 'react';
import { getBrand } from '@hanzo/desktop-brand-config';
import { BrandMark } from '@hanzo/desktop-logo';
import { Button, Input, Text, XStack, YStack } from '@hanzo/gui';
import {
  ContextMenu,
  DropdownMenu,
  EmptyState,
  type MenuItemSpec,
  ThemeToggle,
} from '@hanzo/ui/product';
import { ChevronDown, ExternalLink } from '@hanzogui/lucide-icons-2';

import { DockGroup } from './Dock';
import { usePanels } from './panels';
import { PanelControls, SidebarToggle } from './PanelControls';
import { SECTION, SECTIONS, type SectionKey } from './sections';
import {
  ACCENT,
  ACCENT_SOFT,
  CHROME_ROW,
  CONTROL_RADIUS,
  CONTROL_SIZE,
  RIGHT_PANEL_WIDTH,
  SIDEBAR_WIDTH,
  TRAFFIC_LIGHTS,
  type ThemeMode,
} from './theme';

const MODELS = [
  { key: 'zen-nano', label: 'Zen Nano 0.6B' },
  { key: 'zen-mini', label: 'Zen Mini 4B' },
  { key: 'zen-omni', label: 'Zen Omni' },
];

/** The body's readable measure, released by the full-width control. */
const BODY_MEASURE = 880;

// The converged app shell — sidebar + chrome row + body + dock + controls panel.
// Chrome is composed from @hanzo/gui primitives; every control runs through the
// ONE compact spec (CONTROL_SIZE / CONTROL_RADIUS) except the window chrome,
// which runs through CHROME_CONTROL (see theme.ts for why they differ). Menus
// are the shared @hanzo/ui v8 menu system — one MenuItemSpec array, one
// FloatingMenu. Section bodies render the shared EmptyState until the feature
// pages are ported into the shell.
export function Shell({
  productName,
  mode,
  onSetTheme,
}: {
  productName: string;
  mode: ThemeMode;
  onSetTheme: (next: ThemeMode) => void;
}) {
  const { brand, docs } = getBrand();
  const [section, setSection] = useState<SectionKey>('chat');
  const [query, setQuery] = useState('');
  const [model, setModel] = useState('zen-nano');
  const sidebarOpen = usePanels((state) => state.sidebarOpen);
  const rightOpen = usePanels((state) => state.rightOpen);
  const maximized = usePanels((state) => state.maximized);
  const current = SECTION[section];

  // Right-click actions for a sidebar section — the SAME declarative MenuItemSpec
  // shape as the dropdown, so both menus render pixel-identically.
  const navMenu = (key: SectionKey, label: string): MenuItemSpec[] => [
    {
      key: 'open',
      label: `Open ${label}`,
      icon: <ExternalLink size={16} />,
      onSelect: () => setSection(key),
    },
    { type: 'separator' },
    { key: 'pin', label: 'Pin to top', onSelect: () => setSection(key) },
    {
      key: 'hide',
      label: 'Hide from sidebar',
      destructive: true,
      onSelect: () => {},
    },
  ];

  const modelItems: MenuItemSpec[] = MODELS.map((m) => ({
    key: m.key,
    label: m.label,
    selected: m.key === model,
    onSelect: () => setModel(m.key),
  }));

  return (
    <XStack flex={1} bg="$background">
      {/* Sidebar. `pt` clears the macOS traffic lights, which are painted OVER
          this corner of the webview — see TRAFFIC_LIGHTS in theme.ts. */}
      {sidebarOpen ? (
        <YStack
          data-testid="sidebar"
          width={SIDEBAR_WIDTH}
          shrink={0}
          borderRightWidth={1}
          borderColor="$borderColor"
          bg="$color1"
          p="$2.5"
          pt={TRAFFIC_LIGHTS.height}
          gap="$4"
        >
          <XStack items="center" gap="$2.5" px="$2" pt="$1">
            <BrandMark brand={brand} size={18} />
            <Text
              fontSize="$4"
              fontWeight="700"
              letterSpacing={-0.3}
              color="$color"
            >
              {productName}
            </Text>
          </XStack>

          <YStack gap="$0.5" flex={1}>
            {SECTIONS.map(({ key, label, icon: Icon }) => {
              const active = key === section;
              return (
                <ContextMenu key={key} items={navMenu(key, label)}>
                  <XStack
                    items="center"
                    gap="$2.5"
                    px="$2.5"
                    py="$2"
                    rounded="$3"
                    cursor="pointer"
                    bg={active ? ACCENT_SOFT : 'transparent'}
                    hoverStyle={{ bg: active ? ACCENT_SOFT : '$color3' }}
                    onPress={() => setSection(key)}
                  >
                    <Icon size={16} color={active ? ACCENT : '$color10'} />
                    <Text
                      fontSize="$3"
                      color={active ? '$color' : '$color11'}
                      fontWeight={active ? '600' : '400'}
                    >
                      {label}
                    </Text>
                  </XStack>
                </ContextMenu>
              );
            })}
          </YStack>

          <XStack items="center" px="$2">
            <Text fontSize="$2" color="$color10">
              Local node
            </Text>
          </XStack>
        </YStack>
      ) : null}

      {/* Content */}
      <YStack flex={1} minW={0}>
        {/* The chrome row IS the title bar — it is what the window is dragged
            by, which is what `data-tauri-drag-region` says. Children carrying
            their own handlers are unaffected; only the bare row drags.
            `pl` reserves the traffic lights' corner when the sidebar is shut
            and this row is what sits at the window's left edge. */}
        <XStack
          data-tauri-drag-region={true}
          data-testid="chrome-row"
          items="center"
          gap="$2.5"
          px="$2"
          pl={sidebarOpen ? '$2' : TRAFFIC_LIGHTS.width}
          height={CHROME_ROW}
          borderBottomWidth={1}
          borderColor="$borderColor"
        >
          <SidebarToggle />
          <XStack flex={1} maxW={280} items="center">
            <Input
              size={CONTROL_SIZE}
              rounded={CONTROL_RADIUS}
              flex={1}
              placeholder="Search…"
              value={query}
              onChangeText={setQuery}
            />
          </XStack>
          <XStack flex={1} />
          <PanelControls />
        </XStack>

        <YStack flex={1} minH={0}>
          <DockGroup section={section}>
            <YStack flex={1} minH={0} items="center" justify="center" p="$6">
              {/* The full-width control releases THIS cap. It is the whole of
                  what "maximize" means here, so it is one value in one place —
                  a second cap further down would make the control look broken. */}
              <YStack
                data-testid="body-measure"
                width="100%"
                maxW={maximized ? undefined : BODY_MEASURE}
                items="center"
              >
                <EmptyState
                  icon={current.icon}
                  title={current.title}
                  description={current.description}
                  bullets={current.bullets}
                  /* No primary action, deliberately. Every section body
                     is an EmptyState standing in until the feature pages are
                     ported, so there is nothing behind a New chat / Create
                     agent / Add tool button — and each shipped filled, enabled
                     and inert, which reads as a broken app rather than an
                     unfinished one. Docs is kept because it goes somewhere.
                     Give a section its `primary` back in the same change that
                     gives it a destination. */
                  secondary={{ label: 'Docs', href: docs }}
                />
              </YStack>
            </YStack>
          </DockGroup>
        </YStack>
      </YStack>

      {/* Controls. The model picker and the theme toggle live HERE and nowhere
          else — they were a 168px dropdown wedged into the chrome row and a
          toggle squeezed into the sidebar's foot, which is what left the row no
          space for the window controls. One control, one place. */}
      {rightOpen ? (
        <YStack
          data-testid="right-panel"
          width={RIGHT_PANEL_WIDTH}
          shrink={0}
          borderLeftWidth={1}
          borderColor="$borderColor"
          bg="$color1"
          pt={TRAFFIC_LIGHTS.height}
          p="$4"
          gap="$5"
        >
          <YStack gap="$2">
            <Text fontSize="$2" color="$color10">
              Model
            </Text>
            <DropdownMenu
              trigger={
                <Button
                  size={CONTROL_SIZE}
                  rounded={CONTROL_RADIUS}
                  width={RIGHT_PANEL_WIDTH - 32}
                  justify="space-between"
                  borderWidth={1}
                  borderColor="$borderColor"
                  bg="transparent"
                  iconAfter={<ChevronDown size={14} opacity={0.6} />}
                >
                  <Text fontSize="$2" color="$color" numberOfLines={1} flex={1}>
                    {MODELS.find((m) => m.key === model)?.label ?? 'Model'}
                  </Text>
                </Button>
              }
              items={modelItems}
              minWidth={RIGHT_PANEL_WIDTH - 32}
            />
          </YStack>

          <XStack items="center" justify="space-between">
            <Text fontSize="$2" color="$color10">
              Appearance
            </Text>
            <ThemeToggle theme={mode} onToggle={onSetTheme} size="$2" />
          </XStack>
        </YStack>
      ) : null}
    </XStack>
  );
}
