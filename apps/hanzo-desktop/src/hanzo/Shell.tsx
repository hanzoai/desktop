import { useState } from 'react';
import { getBrand } from '@hanzo/desktop-brand-config';
import { BrandMark } from '@hanzo/desktop-logo';
import { Input, Text, XStack, YStack } from '@hanzo/gui';
import {
  ContextMenu,
  EmptyState,
  type MenuItemSpec,
  ThemeToggle,
} from '@hanzo/ui/product';
import { Chat } from '@hanzo/ui/chat';
import { ModelSelector } from '@hanzo/ui/models';
import { ExternalLink } from '@hanzogui/lucide-icons-2';

import { DockGroup } from './Dock';
import { useChat } from './useChat';
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
  const chat = useChat();
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

          {/* The node, in the words it answers with. A bare "Local node" label
              said the same thing whether the node was serving or absent. */}
          <XStack items="center" gap="$2" px="$2">
            <YStack
              width={6}
              height={6}
              rounded={999}
              bg={chat.ready ? '$green10' : '$color8'}
            />
            <Text fontSize="$2" color="$color10" numberOfLines={1}>
              {chat.ready ? (chat.where?.version ?? 'Local node') : 'Offline'}
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
            {section === 'chat' ? (
              /* The dock's Panel is not a flex parent, so a child asking for
                 flex:1 inside it takes its content's height and leaves the
                 composer floating a third of the way down the window. Fill it
                 by height and flex from there. */
              <YStack height="100%" minH={0} data-testid="chat">
                {chat.fault ? (
                  <XStack
                    items="center"
                    justify="space-between"
                    gap="$3"
                    px="$4"
                    py="$2"
                    bg="$red3"
                    borderBottomWidth={1}
                    borderColor="$borderColor"
                  >
                    <Text fontSize="$2" color="$red11" flex={1}>
                      {chat.fault}
                    </Text>
                    <Text
                      fontSize="$2"
                      color="$red11"
                      cursor="pointer"
                      textDecorationLine="underline"
                      onPress={chat.repair}
                    >
                      Reset and pair
                    </Text>
                  </XStack>
                ) : null}
                <Chat
                  messages={chat.messages}
                  streaming={chat.streaming}
                  send={chat.send}
                  stop={chat.stop}
                  maxWidth={maximized ? 0 : BODY_MEASURE}
                  /* The composer takes the thread's measure. Left uncapped it
                     runs to both window edges under a centred column, and the
                     send control ends up in a corner of its own. */
                  composer={{
                    disabled: !chat.ready,
                    width: '100%',
                    maxW: maximized ? undefined : BODY_MEASURE,
                    self: 'center',
                    mb: '$4',
                  }}
                  empty={
                    /* `empty` stands in for the thread, so it has to take the
                       thread's room. Handed over bare it sizes to its content
                       and leaves the composer stranded under it, halfway up a
                       blank window. */
                    <YStack flex={1} items="center" justify="center" p="$6">
                      <EmptyState
                        icon={current.icon}
                        title={current.title}
                        description={current.description}
                        bullets={current.bullets}
                        secondary={{ label: 'Docs', href: docs }}
                      />
                    </YStack>
                  }
                />
              </YStack>
            ) : (
              <YStack height="100%" minH={0} items="center" justify="center" p="$6">
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
                    /* No primary action, deliberately. A section body without a
                       feature page behind it has nothing for a New agent / Add
                       tool button to do, and one shipped filled, enabled and
                       inert reads as a broken app rather than an unfinished
                       one. Docs is kept because it goes somewhere. Give a
                       section its `primary` back in the same change that gives
                       it a destination — as chat just got. */
                    secondary={{ label: 'Docs', href: docs }}
                  />
                </YStack>
              </YStack>
            )}
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
            {/* The catalog is whatever the node reports, so there is no list
                of model names in this file to go stale. ModelSelector is the
                one picker every Hanzo surface uses. */}
            <ModelSelector
              models={chat.catalog}
              value={chat.model}
              onChange={chat.setModel}
              disabled={!chat.ready}
              size="sm"
              placeholder={chat.ready ? 'Select model' : 'Node offline'}
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
