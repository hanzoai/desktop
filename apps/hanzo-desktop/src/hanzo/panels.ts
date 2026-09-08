import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';

import type { SectionKey } from './sections';

/**
 * Which chrome panels are open, and how tall the dock is.
 *
 * ONE store, so the chrome's toggles, the panels themselves and the keyboard
 * shortcuts all read and write the same value — a toggle in the header and a
 * toggle inside a panel are the same control, not two that have to be kept in
 * step. It is its own store rather than four more fields on `store/settings.ts`
 * because that one belongs to the app's five other windows; this is the main
 * window's chrome and nothing else reads it.
 *
 * Persistence is the repo's idiom: zustand `persist` over the default
 * localStorage under a bare key (`store/settings.ts` does exactly this). The
 * OS-keychain storage in `store/auth.ts` is for secrets; panel geometry is not
 * one.
 */

/** A docked tab. It frames a section, so a tab is (id, section) and nothing more. */
export type DockTab = { id: string; section: SectionKey };

/** The panels that are simply open or shut. Named so `toggle` can be one action. */
export type PanelFlag = 'sidebarOpen' | 'rightOpen' | 'dockOpen' | 'maximized';

type PanelsState = {
  /** The left sidebar. */
  sidebarOpen: boolean;
  /** The right-hand controls panel. */
  rightOpen: boolean;
  /** The dock — the tab strip under the body. */
  dockOpen: boolean;
  /** Release the body's readable-measure cap and use the full width. */
  maximized: boolean;
  /** Dock tabs, in strip order. */
  dockTabs: DockTab[];
  /** The focused tab's id; '' when the dock has no tabs. */
  dockActive: string;
  /** The dock's share of the content column, as a percentage of its height. */
  dockSize: number;
};

type PanelsStore = PanelsState & {
  toggle: (flag: PanelFlag) => void;
  setActiveTab: (id: string) => void;
  setDockSize: (size: number) => void;
  /** Open a tab on `section` and focus it. The ONE way a tab is created. */
  openTab: (section: SectionKey) => void;
  /** Close one tab. The ONE way a tab is destroyed. */
  closeTab: (id: string) => void;
};

const newId = () =>
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

export const usePanels = create<PanelsStore>()(
  devtools(
    persist(
      (set) => ({
        sidebarOpen: true,
        rightOpen: false,
        dockOpen: false,
        maximized: false,
        dockTabs: [],
        dockActive: '',
        dockSize: 35,

        toggle: (flag) => {
          set((state) => ({ [flag]: !state[flag] }) as Pick<PanelsState, PanelFlag>);
        },
        setActiveTab: (dockActive) => {
          set({ dockActive });
        },
        setDockSize: (dockSize) => {
          set({ dockSize });
        },

        openTab: (section) => {
          const tab = { id: newId(), section };
          set((state) => ({
            dockTabs: [...state.dockTabs, tab],
            dockActive: tab.id,
            dockOpen: true,
          }));
        },

        /**
         * Focus moves to the closed tab's neighbour. Closing the LAST tab
         * leaves an empty dock rather than closing it: the strip's `×` is what
         * closes the dock, and a tab's `×` must not silently do a second,
         * larger thing than the one it is labelled with.
         */
        closeTab: (id) => {
          set((state) => {
            const index = state.dockTabs.findIndex((tab) => tab.id === id);
            if (index === -1) return state;
            const dockTabs = state.dockTabs.filter((tab) => tab.id !== id);
            return {
              dockTabs,
              dockActive:
                state.dockActive === id
                  ? (dockTabs[Math.min(index, dockTabs.length - 1)]?.id ?? '')
                  : state.dockActive,
            };
          });
        },
      }),
      { name: 'panels' },
    ),
  ),
);
