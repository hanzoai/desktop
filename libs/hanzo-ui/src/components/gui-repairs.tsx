/**
 * The repairs the desktop applies to @hanzo/ui's gui backends.
 *
 * Everything here wraps an upstream component, changes ONE thing, and forwards
 * the rest. Nothing is reimplemented — a reimplementation would be a fork, which
 * is the bug `./index.ts` exists to prevent. Each repair carries the condition
 * under which it gets deleted.
 *
 * These names are exported by `./index.ts` INSTEAD of the `@hanzo/ui` originals,
 * never alongside them, so a call site cannot reach the unrepaired component.
 */
import {
  CollapsibleTrigger as GuiCollapsibleTrigger,
  Command as GuiCommand,
  CommandInput as GuiCommandInput,
  CommandItem as GuiCommandItem,
  CommandList as GuiCommandList,
  DialogClose as GuiDialogClose,
  DialogFooter as GuiDialogFooter,
  DialogTrigger as GuiDialogTrigger,
  PopoverClose as GuiPopoverClose,
  PopoverTrigger as GuiPopoverTrigger,
  TooltipTrigger as GuiTooltipTrigger,
} from '@hanzo/ui';
import {
  type ComponentProps,
  type ComponentType,
  createContext,
  useContext,
  useEffect,
  useId,
} from 'react';

// ── Repair 1: `asChild` is press-dead on the web ────────────────────────────
//
// A gui composite part composes its behaviour as an `onPress`, and
// `createComponent` only translates that to a DOM `onClick` when `asChild` is
// `'web'` or `'except-style-web'` — see `getWebEvents(events, webStyle)` in
// @hanzogui/web, where `webStyle = asChild === 'web' || asChild ===
// 'except-style-web'`. With a plain `asChild` the handler reaches the child as
// `onPress`, a prop no DOM node understands, and React drops it in silence: the
// child renders, its own onClick still fires, and the trigger never opens / the
// close never closes.
//
// Normalising `true` → `'web'` is the entire repair, and it belongs in one
// place because every part with a press has the same hole. `undefined` stays
// `undefined` — without `asChild` the part renders its own button and works.
// Slot composes handlers rather than replacing them, so the child keeps its own
// onClick.
//
// NOT DropdownMenuTrigger: @hanzogui/menu's trigger implements `asChild` itself
// (`Comp = asChild ? Slot : View`) and binds a real `onPointerDown`/`onClick`, so
// it never reaches this code path and opens either way — measured in Chromium,
// raw and wrapped. It does emit one React "Unknown event handler property
// onPress" warning per asChild trigger, from the `asChild` that @hanzogui/menu
// hardcodes on its own MenuTriggerFrame; that is upstream's and identical with
// or without this file.
//
// Delete when @hanzo/ui (or gui) maps press → click for a boolean `asChild`.

type AsChild = boolean | 'except-style' | 'except-style-web' | 'web';

// Typed from the component rather than from a constraint. Written as
// `ComponentType<P>` with `P extends { asChild?: AsChild }`, inference has
// nothing to take P from when the part is a gui component — its type is not a
// plain function component — so P fell back to the constraint, and the repaired
// export accepted `asChild` and NOTHING else. Every call site passing children
// or a className failed to typecheck: 121 errors from this one signature, in
// files whose markup was correct.
const pressable = <C extends ComponentType<never>>(Part: C, displayName: string) => {
  type P = ComponentProps<C> & { asChild?: AsChild };
  const Repaired = ({ asChild, ...rest }: P) => (
    <Part
      {...(rest as ComponentProps<C>)}
      asChild={asChild === true ? 'web' : asChild}
    />
  );
  Repaired.displayName = displayName;
  return Repaired;
};

export const CollapsibleTrigger = pressable(
  GuiCollapsibleTrigger,
  'CollapsibleTrigger',
);
export const DialogClose = pressable(GuiDialogClose, 'DialogClose');
export const DialogTrigger = pressable(GuiDialogTrigger, 'DialogTrigger');
export const PopoverClose = pressable(GuiPopoverClose, 'PopoverClose');
export const PopoverTrigger = pressable(GuiPopoverTrigger, 'PopoverTrigger');
export const TooltipTrigger = pressable(GuiTooltipTrigger, 'TooltipTrigger');

// ── Repair 2: DialogFooter does not stack ───────────────────────────────────
//
// gui's DialogFooter is a plain row. The shadcn fork it replaced was
// `flex flex-col-reverse sm:flex-row sm:justify-end` — buttons stacked with the
// primary on top on a narrow window, a right-aligned row above 640px. Expressed
// as gui props so the runtime stylesheet cannot override them.
//
// `$sm` and NOT `$gtSm`: this app's config is @hanzogui/config/v5, whose media
// keys are `sm`/`md`/`lg`/`xl` (`sm` = minWidth 640) plus the `max-*` family.
// There is no `gtSm` in v5, so `$gtSm` is silently dropped — v5's `$sm` is the
// exact equivalent of Tailwind's `sm:`.
//
// A media style always beats a base style, so a caller could not opt out of the
// responsive default by setting `flexDirection` alone. Naming a direction
// therefore stands the default down entirely — "responsive unless you say
// otherwise", which is the contract the call sites were written against.
//
// Delete when @hanzo/ui's DialogFooter stacks on its own.

export const DialogFooter = ({
  flexDirection,
  ...props
}: ComponentProps<typeof GuiDialogFooter>) =>
  flexDirection ? (
    <GuiDialogFooter flexDirection={flexDirection} {...props} />
  ) : (
    <GuiDialogFooter
      // Shorthands, not longhands: a media object's type is
      // `Omit<StackStyleBase, Longhands> & WithShorthands<…>`, so `alignItems` /
      // `justifyContent` are excess properties there even though they resolve at
      // runtime.
      $sm={{ flexDirection: 'row', items: 'center', justify: 'flex-end' }}
      flexDirection="column-reverse"
      items="stretch"
      {...props}
    />
  );

// ── Repair 3: the command palette lost its listbox semantics ────────────────
//
// cmdk gave the palette the combobox/listbox/option triple. gui renders an
// `Input`, a `ScrollView` and `ListItem`s, i.e. `<li role="listitem">` with a
// `data-selected` attribute and nothing a screen reader can use to say which
// command is active.
//
// The roles go on as ordinary props — gui forwards what it does not recognise
// to the DOM node — with ONE exception: `ScrollView` drops `role` and honours
// `accessibilityRole`, which react-native-web emits as the DOM `role`.
//
// `aria-selected` has to MIRROR gui's own `data-selected`, because the cursor
// lives in gui's Command context and nothing exports it. One MutationObserver
// per list rather than one per row, reading a published attribute instead of
// reimplementing the cursor, and it also publishes the active row as the
// input's `aria-activedescendant` — which is what actually announces the
// selection, since focus stays in the input.
//
// Delete when @hanzo/ui's Command carries the ARIA itself.

const PaletteId = createContext('');
const listId = (id: string) => `${id}list`;
const inputId = (id: string) => `${id}input`;

// react-native's AccessibilityRole union predates the ARIA roles the web needs
// and has no `listbox`; react-native-web accepts it and emits it as the DOM
// `role` (measured). This cast is the whole reason the line below is not simply
// `role="listbox"` — ScrollView drops `role` and honours only this prop.
const LISTBOX = 'listbox' as ComponentProps<
  typeof GuiCommandList
>['accessibilityRole'];

export const Command = (props: ComponentProps<typeof GuiCommand>) => {
  const id = useId();
  return (
    <PaletteId.Provider value={id}>
      <GuiCommand {...props} />
    </PaletteId.Provider>
  );
};

export const CommandInput = (props: ComponentProps<typeof GuiCommandInput>) => {
  const id = useContext(PaletteId);
  return (
    <GuiCommandInput
      aria-autocomplete="list"
      aria-controls={listId(id)}
      aria-expanded
      id={inputId(id)}
      role="combobox"
      {...props}
    />
  );
};

export const CommandList = (props: ComponentProps<typeof GuiCommandList>) => {
  const id = useContext(PaletteId);
  useEffect(() => {
    const list = document.getElementById(listId(id));
    if (!list) return;
    const input = document.getElementById(inputId(id));
    const sync = () => {
      let active = '';
      list
        .querySelectorAll<HTMLElement>('[data-slot="command-item"]')
        .forEach((row, i) => {
          if (!row.id) row.id = `${id}opt${i}`;
          const on = row.getAttribute('data-selected') === 'true';
          row.setAttribute('aria-selected', String(on));
          if (on) active = row.id;
        });
      input?.setAttribute('aria-activedescendant', active);
    };
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(list, {
      attributeFilter: ['data-selected'],
      childList: true,
      subtree: true,
    });
    return () => observer.disconnect();
  }, [id]);
  return (
    <GuiCommandList accessibilityRole={LISTBOX} id={listId(id)} {...props} />
  );
};

export const CommandItem = (props: ComponentProps<typeof GuiCommandItem>) => (
  <GuiCommandItem role="option" {...props} />
);
