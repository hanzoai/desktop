/**
 * The @hanzo/ui primitives, exercised through the barrel the app imports.
 *
 * @hanzo/gui SILENTLY DROPS props it does not recognise — no throw, no type
 * error, just an element that never got the style or the handler. A green
 * `vite build` therefore proves nothing about a component swap. These assertions
 * are the proof: for every primitive the desktop moved off Radix, the props its
 * call sites actually pass have to reach the DOM (roles, aria state, `htmlFor`,
 * `className`) and the callbacks have to fire.
 */
import { render, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { GuiProvider } from '@hanzo/gui';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogTitle,
  Avatar,
  AvatarFallback,
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Checkbox,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
  DialogTrigger,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
  Label,
  Popover,
  PopoverClose,
  PopoverContent,
  PopoverTrigger,
  Progress,
  RadioGroup,
  RadioGroupItem,
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
  ScrollArea,
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
  Separator,
  Slider,
  Switch,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Textarea,
  ToggleGroup,
  ToggleGroupItem,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@hanzo/desktop-ui';
import { createRef, type ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

import config from '../../gui.config';

// Mirrors apps/hanzo-desktop/index.html. gui's Portal host is
// pointerEvents="box-none"; FloatingMenu puts a wrapper between it and the
// panel, so the panel inherits pointer-events:none and every menu row is
// unclickable. The app repairs it with this one inherited rule — jsdom never
// loads index.html, so the tests have to carry the same rule to exercise what
// actually ships.
const menuPointerEvents = document.createElement('style');
menuPointerEvents.textContent = "[role='menu'] { pointer-events: auto; }";
document.head.appendChild(menuPointerEvents);

const wrap = (ui: ReactNode) =>
  render(
    <GuiProvider config={config} defaultTheme="dark">
      {ui}
    </GuiProvider>,
  );

describe('ui primitives on @hanzo/gui', () => {
  it('Separator keeps orientation and the caller className', () => {
    // Orientation is a STYLE VARIANT here, not `data-orientation` — gui's
    // Separator is a styled View and emits no such attribute, so asserting one
    // can only ever fail. What the variant actually moves is the 1px rule, from
    // the bottom edge to the right one. `vertical` is also exactly the shape of
    // prop gui drops in silence, so both orientations are rendered and compared:
    // a dropped `vertical` renders the horizontal geometry and fails here.
    const rule = (ui: Parameters<typeof wrap>[0]) => {
      const el = wrap(ui).container.querySelector('[data-slot="separator"]');
      expect(el).not.toBeNull();
      return el!.className;
    };

    const vertical = rule(<Separator className="my-4" vertical />);
    expect(vertical).toContain('_brw-1px');
    expect(vertical).toContain('_borderBottomWidth-0px');
    expect(vertical).toContain('my-4');

    const horizontal = rule(<Separator className="my-4" />);
    expect(horizontal).toContain('_borderBottomWidth-1px');
    expect(horizontal).toContain('_brw-0px');
    expect(horizontal).toContain('my-4');
  });

  it('Progress reports its value and honours minW={0}', () => {
    const { container } = wrap(<Progress minW={0} value={42} />);
    expect(container.querySelector('[aria-valuenow="42"]')).not.toBeNull();
    // gui's Progress carries a 220px floor; the desktop's bars are narrower.
    expect(container.innerHTML).not.toContain('_minW-220px');
  });

  it('Checkbox reflects checked and fires onCheckedChange', async () => {
    const onCheckedChange = vi.fn();
    const { container } = wrap(
      <Checkbox checked id="terms" onCheckedChange={onCheckedChange} />,
    );
    const box = container.querySelector('[role="checkbox"]') as HTMLElement;
    expect(box.getAttribute('aria-checked')).toBe('true');
    await userEvent.click(box);
    expect(onCheckedChange).toHaveBeenCalled();
  });

  it('Switch reflects checked and fires onCheckedChange', async () => {
    const onCheckedChange = vi.fn();
    const { container } = wrap(
      <Switch checked onCheckedChange={onCheckedChange} />,
    );
    const sw = container.querySelector('[role="switch"]') as HTMLElement;
    expect(sw.getAttribute('aria-checked')).toBe('true');
    await userEvent.click(sw);
    expect(onCheckedChange).toHaveBeenCalled();
  });

  it('Slider takes the array value / onValueChange shape', () => {
    const { container } = wrap(
      <Slider
        max={1}
        min={0}
        onValueChange={() => {}}
        step={0.1}
        value={[0.7]}
      />,
    );
    expect(container.querySelector('[role="slider"]')).not.toBeNull();
  });

  it('Label binds htmlFor', () => {
    const { container } = wrap(<Label htmlFor="terms">Accept</Label>);
    expect(container.querySelector('label')?.getAttribute('for')).toBe('terms');
  });

  it('Avatar sizes from gui props', () => {
    const { container } = wrap(
      <Avatar size={20}>
        <AvatarFallback>ZZ</AvatarFallback>
      </Avatar>,
    );
    expect(container.innerHTML).toContain('_width-20px');
    expect(container.textContent).toContain('ZZ');
  });

  it('Collapsible shows its content when open', () => {
    const { container } = wrap(
      <Collapsible open>
        <CollapsibleTrigger>more</CollapsibleTrigger>
        <CollapsibleContent>body</CollapsibleContent>
      </Collapsible>,
    );
    expect(container.textContent).toContain('body');
  });

  it('Tabs select by value and report onValueChange', async () => {
    const onValueChange = vi.fn();
    const { container } = wrap(
      <Tabs onValueChange={onValueChange} value="a">
        <TabsList>
          <TabsTrigger value="a">A</TabsTrigger>
          <TabsTrigger value="b">B</TabsTrigger>
        </TabsList>
        <TabsContent value="a">panel A</TabsContent>
        <TabsContent value="b">panel B</TabsContent>
      </Tabs>,
    );
    expect(container.textContent).toContain('panel A');
    const tabs = [
      ...container.querySelectorAll('[role="tab"]'),
    ] as HTMLElement[];
    expect(tabs[0].getAttribute('aria-selected')).toBe('true');
    await userEvent.click(tabs[1]);
    expect(onValueChange).toHaveBeenCalledWith('b');
  });

  it('Popover takes placement on the ROOT and sizes from gui props', () => {
    const { baseElement } = wrap(
      <Popover open placement="bottom-start">
        <PopoverTrigger>open</PopoverTrigger>
        <PopoverContent p={0} width={500}>
          <PopoverClose>x</PopoverClose>
          panel
        </PopoverContent>
      </Popover>,
    );
    // Radix took `align` on the content; @hanzo/ui accepts it and THROWS IT
    // AWAY (`align: _align`), so the value has to ride on the root.
    expect(
      baseElement.querySelector('[data-placement="bottom-start"]'),
    ).not.toBeNull();
    // gui's PopoverContent hardcodes width:288 — a `w-[500px]` class would have
    // lost to it, so the width is a prop and this is the proof it took.
    expect(
      baseElement.querySelector('[data-slot="popover-content"]')?.className,
    ).toContain('_width-500px');
    expect(baseElement.textContent).toContain('panel');
  });

  it('Resizable keeps direction, sizes panels from defaultSize, and reports onResize', () => {
    const onResize = vi.fn();
    const { container } = wrap(
      <ResizablePanelGroup direction="horizontal">
        <ResizablePanel defaultSize={70} minSize={50} onResize={onResize}>
          left
        </ResizablePanel>
        <ResizableHandle className="bg-bg-darker" width={8} />
        <ResizablePanel collapsible defaultSize={30} maxSize={50} minSize={20}>
          right
        </ResizablePanel>
      </ResizablePanelGroup>,
    );
    // The fork's `data-[panel-group-direction=vertical]:` selectors relied on
    // this attribute; gui still emits it.
    expect(
      container.querySelector('[data-panel-group-direction="horizontal"]'),
    ).not.toBeNull();
    // The handle is a real separator with a resize state, and it is reachable.
    const handle = container.querySelector('[role="separator"]') as HTMLElement;
    expect(handle.getAttribute('aria-orientation')).toBe('vertical');
    expect(handle.getAttribute('data-resize-handle-state')).toBe('idle');
    expect(handle.getAttribute('tabindex')).toBe('0');
    // gui bakes a 4px thickness as a style prop, so `w-2` would have lost the
    // tie — the width has to ride as a gui prop, and this is the proof it took.
    expect(handle.className).toContain('_width-8px');
    expect(handle.className).toContain('bg-bg-darker');
    // defaultSize becomes flexGrow, so the 70/30 split is real and not 50/50.
    expect(container.innerHTML).toContain('_grow-70');
    expect(container.innerHTML).toContain('_grow-30');
    expect(onResize).toHaveBeenCalledWith(70);
  });

  it('ResizablePanelGroup only sees panels that are its DIRECT children', () => {
    // gui builds the layout by scanning children for `type === ResizablePanel`,
    // and `Children.toArray` does not flatten a fragment. A panel wrapped in one
    // is invisible to that scan: it loses its size and the handle beside it goes
    // dead — with no error. agent-form.tsx had exactly that shape.
    const { container } = wrap(
      <ResizablePanelGroup direction="horizontal">
        <ResizablePanel defaultSize={70}>left</ResizablePanel>
        <>
          <ResizableHandle />
          <ResizablePanel defaultSize={30}>right</ResizablePanel>
        </>
      </ResizablePanelGroup>,
    );
    // One spec only => the whole group is one 100% panel and the handle is off.
    expect(container.innerHTML).not.toContain('_grow-30');
    expect(
      container.querySelector('[role="separator"]')?.getAttribute('tabindex'),
    ).toBe('-1');
  });

  it('Textarea reaches the real <textarea>: id, rows, value, onChangeText, onKeyDown', async () => {
    const onChangeText = vi.fn();
    const onKeyDown = vi.fn();
    const { container } = wrap(
      <Textarea
        className="!min-h-[130px] resize-y text-sm"
        defaultValue="ab"
        id="prompt"
        onChangeText={onChangeText}
        onKeyDown={onKeyDown}
        placeholder="say something"
        rows={4}
      />,
    );
    const ta = container.querySelector('textarea') as HTMLTextAreaElement;
    expect(ta).not.toBeNull();
    // `htmlFor` on the label needs this to survive the gui hop.
    expect(ta.id).toBe('prompt');
    expect(ta.rows).toBe(4);
    expect(ta.placeholder).toBe('say something');
    // The caller className lands, so `!min-h-*` (important) still beats gui's
    // baked minH:64 and `resize-y` still governs — gui sets no resize itself.
    expect(ta.className).toContain('!min-h-[130px]');
    expect(ta.className).toContain('resize-y');
    expect(ta.style.resize).toBe('');
    await userEvent.click(ta);
    await userEvent.keyboard('c');
    // gui's field speaks onChangeText(string), not a DOM change event.
    expect(onChangeText).toHaveBeenCalledWith('abc');
    expect(onKeyDown).toHaveBeenCalled();
  });

  it('Textarea keeps an inline -webkit-text-security mask but DROPS spellCheck', () => {
    const { container } = wrap(
      <Textarea
        spellCheck={false}
        style={{ WebkitTextSecurity: 'disc' } as never}
        value="secret phrase"
      />,
    );
    const ta = container.querySelector('textarea') as HTMLTextAreaElement;
    // crypto-wallet.tsx masks a seed phrase with this. It survives.
    expect(ta.getAttribute('style')).toContain('-webkit-text-security: disc');
    // ...but the camelCase spellCheck does NOT reach the DOM. It typechecks and
    // vanishes, which is why the seed-phrase field passes the lowercase
    // attribute instead. Asserted so nobody assumes the camelCase one works.
    expect(ta.getAttribute('spellcheck')).toBeNull();
  });

  it('Textarea forwards a lowercase spellcheck attribute (the seed-phrase path)', () => {
    const { container } = wrap(
      <Textarea {...({ spellcheck: 'false' } as object)} value="secret" />,
    );
    expect(
      container.querySelector('textarea')?.getAttribute('spellcheck'),
    ).toBe('false');
  });

  it('Badge renders a span, keeps variant + className, and fires onClick', async () => {
    const onClick = vi.fn();
    const { container } = wrap(
      <Badge className="border-divider rounded-md border" onClick={onClick}>
        Active
      </Badge>,
    );
    const el = container.querySelector('[data-slot="badge"]') as HTMLElement;
    // The host element changed <div> -> <span>; callers style it either way.
    expect(el.tagName).toBe('SPAN');
    expect(el.className).toContain('border-divider');
    expect(el.textContent).toBe('Active');
    await userEvent.click(el);
    expect(onClick).toHaveBeenCalled();
  });

  it('Badge forwards ref to the measurable host element', () => {
    // libs/hanzo-ui/src/components/input.tsx reads `.offsetWidth` off the
    // adornment badges to compute the field's padding. gui's Badge is a plain
    // function component, so this rides React 19 ref-as-prop onto BadgeFrame.
    const ref = createRef<HTMLSpanElement>();
    const { container } = wrap(
      <Badge ref={ref as never} variant="inputAdornment">
        USD
      </Badge>,
    );
    expect(ref.current).toBe(container.querySelector('[data-slot="badge"]'));
    expect(typeof ref.current?.offsetWidth).toBe('number');
  });

  it('Badge geometry has to ride as INLINE STYLE, not utilities', () => {
    // gui bakes minH:24 / px:$2.5 / py:$1 / rounded:$2 as RUNTIME style props,
    // so `size-5 p-0 rounded-full` on a count bubble loses the tie and the circle
    // becomes a 24px pill. BadgeProps is ComponentProps<'span'>, so gui style
    // props do not typecheck — `style` does, and inline beats every class.
    const { container } = wrap(
      <Badge
        className="size-5 rounded-full p-0"
        style={{ minHeight: 0, padding: 0, borderRadius: 9999 }}
      >
        3
      </Badge>,
    );
    expect(
      (
        container.querySelector('[data-slot="badge"]') as HTMLElement
      ).getAttribute('style'),
    ).toBe('min-height: 0px; padding: 0px; border-radius: 9999px;');
  });

  it('ScrollArea puts the caller className on the root and scrolls in the VIEWPORT', () => {
    const ref = createRef<HTMLDivElement>();
    const { container } = wrap(
      <ScrollArea className="flex h-full flex-col px-5 pb-4" ref={ref as never}>
        <div style={{ height: 2000 }}>tall</div>
      </ScrollArea>,
    );
    const root = container.querySelector('[data-slot="scroll-area"]');
    expect((root as HTMLElement).className).toContain('px-5');
    // The fork put `ref` on the Radix VIEWPORT — the element that scrolls. gui
    // puts it on the outer box, which is overflow:hidden, so
    // `scrollRef.current.scrollTo(0, 0)` silently stopped working.
    // prompt-library.tsx reaches the viewport through it instead.
    expect(ref.current).toBe(root);
    const viewport = ref.current?.querySelector(
      '[data-slot="scroll-area-viewport"]',
    );
    expect(viewport).not.toBeNull();
    expect(typeof viewport?.scrollTo).toBe('function');
    expect(typeof (ref.current as HTMLElement).scrollTo).toBe('undefined');
  });

  it('Card keeps role + onClick, and the header axis rides as a gui prop', async () => {
    const onClick = vi.fn();
    const { container } = wrap(
      <Card className="max-w-sm border" onClick={onClick} role="button">
        <CardHeader
          className="flex flex-row items-center gap-3 p-4"
          flexDirection="row"
        >
          <CardTitle className="text-lg">Title</CardTitle>
        </CardHeader>
        <CardContent className="p-4" p={16}>
          body
        </CardContent>
      </Card>,
    );
    const card = container.querySelector('[data-slot="card"]') as HTMLElement;
    expect(card.getAttribute('role')).toBe('button');
    expect(card.className).toContain('max-w-sm');
    await userEvent.click(card);
    expect(onClick).toHaveBeenCalled();
    // gui's CardHeader is a YStack, so `flex-row` cannot beat it — the axis has
    // to be a prop or the title and description stack instead of sitting inline.
    const header = container.querySelector(
      '[data-slot="card-header"]',
    ) as HTMLElement;
    expect(header.className).toContain('_fd-row');
    // Same for padding: gui bakes px:24, so `p-4` loses unless it is a prop.
    expect(
      (container.querySelector('[data-slot="card-content"]') as HTMLElement)
        .className,
    ).toContain('_pl-16px');
    // CardTitle is a gui SizableText now, NOT an <h3> — heading semantics are
    // gone. Recorded so the loss is a decision, not a surprise.
    expect(
      (container.querySelector('[data-slot="card-title"]') as HTMLElement)
        .tagName,
    ).toBe('SPAN');
  });

  it('Dialog wires title semantics and hides its close button only when asked', async () => {
    const onInteractOutside = vi.fn((e: { preventDefault: () => void }) =>
      e.preventDefault(),
    );
    const { baseElement } = wrap(
      <Dialog open>
        <DialogContent
          className="max-w-screen-md"
          maxW={768}
          onInteractOutside={onInteractOutside as never}
          showCloseButton={false}
        >
          <DialogTitle className="text-lg">Heading</DialogTitle>
          <DialogDescription>desc</DialogDescription>
        </DialogContent>
      </Dialog>,
    );
    const content = baseElement.querySelector('[data-slot="dialog-content"]');
    const title = baseElement.querySelector('[data-slot="dialog-title"]');
    expect(content?.getAttribute('role')).toBe('dialog');
    // gui KEEPS the heading: an <h2 role=heading> wired to aria-labelledby.
    expect(title?.tagName).toBe('H2');
    expect(content?.getAttribute('aria-labelledby')).toBe(title?.id);
    expect((content as HTMLElement).className).toContain('max-w-screen-md');
    // gui bakes maxW:512, so a wider dialog has to say so as a prop.
    expect((content as HTMLElement).className).toContain('_maxW-768px');
    // gui DEFAULTS showCloseButton to true where the fork defaulted it to false;
    // every dialog that drew its own close control passes false explicitly.
    expect(baseElement.querySelector('[data-slot="dialog-close"]')).toBeNull();
    // onInteractOutside is a real Radix-shaped prop here: preventDefault holds.
    await userEvent.click(
      baseElement.querySelector('[data-slot="dialog-overlay"]') as HTMLElement,
    );
    expect(onInteractOutside).toHaveBeenCalled();
    expect(
      baseElement.querySelector('[data-slot="dialog-content"]'),
    ).not.toBeNull();
  });

  it('Dialog shows a close button by default', () => {
    const { baseElement } = wrap(
      <Dialog open>
        <DialogContent>
          <DialogTitle>t</DialogTitle>
        </DialogContent>
      </Dialog>,
    );
    expect(
      baseElement.querySelector('[data-slot="dialog-close"]'),
    ).not.toBeNull();
  });

  it('Command filters, navigates with arrows, and fires onSelect', async () => {
    const onKeyDown = vi.fn();
    const onSelect = vi.fn();
    const listRef = createRef<HTMLDivElement>();
    const { container } = wrap(
      <Command disablePointerSelection onKeyDown={onKeyDown}>
        <CommandInput placeholder="Search" />
        <CommandList ref={listRef as never}>
          <CommandEmpty>none</CommandEmpty>
          <CommandGroup heading="Tools">
            <CommandItem onSelect={onSelect} value="alpha">
              Alpha
            </CommandItem>
            <CommandItem onSelect={onSelect} value="beta">
              Beta
            </CommandItem>
          </CommandGroup>
        </CommandList>
      </Command>,
    );
    const items = () =>
      [
        ...container.querySelectorAll('[data-slot="command-item"]'),
      ] as HTMLElement[];
    const input = container.querySelector(
      '[data-slot="command-input"]',
    ) as HTMLInputElement;
    expect(items()).toHaveLength(2);
    input.focus();
    // gui puts its key handler on the INPUT as well as the root, so a caller's
    // own root onKeyDown (Escape, on 2 sites) does NOT cost arrow navigation.
    await userEvent.keyboard('{ArrowDown}');
    expect(items()[1].getAttribute('data-selected')).toBe('true');
    expect(onKeyDown).toHaveBeenCalled();
    await userEvent.keyboard('{Enter}');
    expect(onSelect).toHaveBeenCalledWith('beta');
    // Filtering hides rather than unmounts, so registration order stays true.
    await userEvent.type(input, 'bet');
    expect(items()[0].className).toContain('_dsp-none');
    expect(items()[1].className).toContain('_dsp-flex');
  });

  it('CommandList ref is the scrolling DOM element', () => {
    // 3 sites call `toolListRef.current?.scrollTo({ top: 0 })`. gui renders a
    // ScrollView, but on web the ref is the host DOM node, so the DOM
    // ScrollToOptions form still applies.
    const listRef = createRef<HTMLDivElement>();
    wrap(
      <Command>
        <CommandList ref={listRef as never}>
          <CommandItem value="a">A</CommandItem>
        </CommandList>
      </Command>,
    );
    expect(listRef.current?.getAttribute('data-slot')).toBe('command-list');
    expect(typeof listRef.current?.scrollTo).toBe('function');
  });

  it('DropdownMenu takes placement on the ROOT, not align on the content', async () => {
    const onClick = vi.fn();
    const onOpenChange = vi.fn();
    const { baseElement } = wrap(
      <DropdownMenu
        modal={false}
        onOpenChange={onOpenChange}
        open
        placement="bottom-end"
      >
        <DropdownMenuTrigger>open</DropdownMenuTrigger>
        <DropdownMenuContent className="w-[200px] px-2.5" sideOffset={10}>
          <DropdownMenuItem className="rowcls" onClick={onClick}>
            Row one
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>,
    );
    // `align`/`side` on the CONTENT are Radix props gui's menu never reads; the
    // whole surface spreads them onto a styled component that neither uses nor
    // rejects them, so tsc cannot see the loss. Placement lives on the root.
    expect(
      baseElement.querySelector('[data-placement="bottom-end"]'),
    ).not.toBeNull();
    const menu = baseElement.querySelector('[role="menu"]') as HTMLElement;
    expect(menu.className).toContain('w-[200px]');
    const item = baseElement.querySelector('[role="menuitem"]') as HTMLElement;
    expect(item.className).toContain('rowcls');
    await userEvent.click(item);
    expect(onClick).toHaveBeenCalled();
    // The fork closed on activate via Radix; gui closes from onClick too.
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('DropdownMenu ignores align on the content (proof the hoist was needed)', () => {
    const { baseElement } = wrap(
      <DropdownMenu open>
        <DropdownMenuTrigger>t</DropdownMenuTrigger>
        <DropdownMenuContent align="end" side="top">
          <DropdownMenuItem>x</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>,
    );
    // Still gui's default, NOT top-end: both props were silently dropped.
    expect(
      baseElement
        .querySelector('[data-placement]')
        ?.getAttribute('data-placement'),
    ).toBe('bottom-start');
  });

  // The shape all-files-tab.tsx uses, which is the only consumer the compound
  // ContextMenu has: modal={false} on the root, a className on trigger and
  // content, and rows that report through onClick.
  it('ContextMenu is a menu whose rows fire onClick, and it keeps its trigger class', async () => {
    const onClick = vi.fn();
    const { baseElement } = wrap(
      <ContextMenu modal={false} open>
        <ContextMenuTrigger className="flex-1">target</ContextMenuTrigger>
        <ContextMenuContent className="p-2">
          <ContextMenuItem onClick={onClick}>rename</ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>,
    );
    // The trigger keeps the layout class the call site sets on it.
    expect(
      baseElement.querySelector('[data-slot="context-menu-trigger"]')
        ?.className,
    ).toContain('flex-1');
    await waitFor(() =>
      expect(baseElement.querySelector('[role="menu"]')).not.toBeNull(),
    );
    const row = baseElement.querySelector(
      '[role="menuitem"]',
    ) as HTMLElement | null;
    expect(row).not.toBeNull();
    expect(row).toHaveTextContent('rename');
    // Trap 5: a gui composite composes its behaviour as onPress. This proves
    // the row still reports through the onClick the call site passes.
    await userEvent.click(row as HTMLElement);
    expect(onClick).toHaveBeenCalled();
  });

  it('Select indexes mapped items, keeps trigger id, and reports onValueChange', async () => {
    const onValueChange = vi.fn();
    const opts = ['one', 'two', 'three'];
    const { baseElement } = wrap(
      <Select onValueChange={onValueChange} value="one">
        <SelectTrigger id="pick-trigger" width={220}>
          <SelectValue placeholder="Pick" />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            <SelectLabel>Group</SelectLabel>
            {opts.map((o) => (
              <SelectItem key={o} value={o}>
                {o}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>,
    );
    const trigger = baseElement.querySelector(
      '[data-slot="select-trigger"]',
    ) as HTMLElement;
    // 4 triggers are the target of a <label htmlFor>, so the id has to survive.
    expect(trigger.getAttribute('id')).toBe('pick-trigger');
    expect(trigger.getAttribute('role')).toBe('combobox');
    expect(trigger.textContent).toContain('one');
    // SelectTrigger DROPS className outright — not "loses the cascade tie", never
    // reaches the DOM — and gui bakes width:100%. Fixed widths ride as props.
    expect(trigger.className).toContain('_width-220px');
    await userEvent.click(trigger);
    const items = [
      ...baseElement.querySelectorAll('[data-slot="select-item"]'),
    ] as HTMLElement[];
    // gui's Item needs a positional index; SelectContent stamps it depth-first,
    // so items produced by .map() INSIDE a SelectGroup still number correctly.
    expect(items.map((i) => i.textContent)).toEqual(opts);
    await userEvent.click(items[2]);
    expect(onValueChange).toHaveBeenCalledWith('three');
  });

  it('Select mounts no phantom scroll buttons', () => {
    // gui renders SelectScrollUp/DownButton inside every content; they emit
    // nothing when the list does not overflow, so no new chevron rows appear.
    const { baseElement } = wrap(
      <Select value="a">
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="a">A</SelectItem>
        </SelectContent>
      </Select>,
    );
    expect(
      baseElement.querySelectorAll(
        '[data-slot="select-scroll-up-button"],[data-slot="select-scroll-down-button"]',
      ),
    ).toHaveLength(0);
  });

  it('Tooltip portals its content and takes placement on the ROOT', () => {
    const { baseElement } = wrap(
      <TooltipProvider delay={0}>
        <Tooltip open placement="right-start">
          <TooltipTrigger>t</TooltipTrigger>
          <TooltipContent>tip</TooltipContent>
        </Tooltip>
      </TooltipProvider>,
    );
    // Radix took `side`/`align` on the CONTENT; gui takes one `placement` on the
    // root and would have silently ignored the old props.
    expect(
      baseElement.querySelector('[data-placement="right-start"]'),
    ).not.toBeNull();
    // No <TooltipPortal> wrapper: TooltipContent mounts its own portal, so the
    // content is outside the trigger's subtree but inside the document.
    expect(baseElement.textContent).toContain('tip');
  });
  // ── The seven silent drops the migration shipped, as regressions ──────────
  // Each one FAILED before libs/hanzo-ui/src/components/gui-repairs.tsx and the
  // call-site conversions. They assert the CAUSE — the prop or role reaching the
  // DOM — because that is what a silent drop destroys; the pixel and media-query
  // consequences are measured in a real Chromium, which jsdom cannot model.

  it('DialogClose asChild actually closes, and the child keeps its own onClick', async () => {
    // gui composes the close as `onPress` and only translates it to a DOM
    // `onClick` for asChild='web'. With a plain `asChild` the handler reached
    // the child as `onPress`, React dropped it, and the modal stayed open — at
    // 3 sites this was the ONLY close affordance, because the same DialogContent
    // passes showCloseButton={false}.
    const onClick = vi.fn();
    const { baseElement } = wrap(
      <Dialog defaultOpen>
        <DialogContent showCloseButton={false}>
          <DialogTitle>Heading</DialogTitle>
          <DialogClose asChild>
            <Button onClick={onClick}>Cancel</Button>
          </DialogClose>
        </DialogContent>
      </Dialog>,
    );
    expect(
      baseElement.querySelector('[data-slot="dialog-content"]'),
    ).not.toBeNull();
    // showCloseButton={false}, so the only close is the slotted child: gui's
    // props land ON the caller's own button rather than on a frame of its own.
    const close = baseElement.querySelector(
      '[data-slot="dialog-close"]',
    ) as HTMLElement;
    expect(close.textContent).toBe('Cancel');
    await userEvent.click(close);
    expect(onClick).toHaveBeenCalled();
    expect(
      baseElement.querySelector('[data-slot="dialog-content"]'),
    ).toBeNull();
  });

  it('DialogTrigger asChild actually opens', async () => {
    // Same hole, wider blast radius: 18 dialogs could not be opened at all.
    const { baseElement } = wrap(
      <Dialog>
        <DialogTrigger asChild>
          <Button>open</Button>
        </DialogTrigger>
        <DialogContent showCloseButton={false}>
          <DialogTitle>Heading</DialogTitle>
        </DialogContent>
      </Dialog>,
    );
    await userEvent.click(baseElement.querySelector('button') as HTMLElement);
    expect(
      baseElement.querySelector('[data-slot="dialog-content"]'),
    ).not.toBeNull();
  });

  it('DialogFooter stacks by default and stands down when given a direction', () => {
    // The fork was `flex flex-col-reverse sm:flex-row sm:justify-end`; gui bakes
    // a plain row, so two footers passing `flex-col` rendered as rows and the
    // responsive stacking was gone everywhere. `$sm`, NOT `$gtSm` — v5's media
    // set has no gtSm, so `$gtSm` would be dropped in silence.
    const { container } = wrap(<DialogFooter />);
    const footer = container.querySelector(
      '[data-slot="dialog-footer"]',
    ) as HTMLElement;
    // gui hashes long atomic class names, so match the stable prefix.
    expect(footer.className).toMatch(/_fd-column-reve/);
    expect(footer.className).toContain('_fd-_sm_row');

    // A caller that names a direction keeps it at every width: a media style
    // always beats a base style, so the responsive default has to step aside.
    const fixed = wrap(<DialogFooter flexDirection="column" />);
    const col = fixed.container.querySelector(
      '[data-slot="dialog-footer"]',
    ) as HTMLElement;
    expect(col.className).toMatch(/_fd-column(\s|$)/);
    expect(col.className).not.toContain('_fd-_sm_row');
  });

  it('the command palette exposes combobox / listbox / option, and aria-selected tracks the cursor', async () => {
    // cmdk gave rows role=option + aria-selected, the list role=listbox and the
    // input role=combobox; gui renders <li role="listitem"> with only
    // data-selected, so assistive tech could not perceive the active command.
    const { container } = wrap(
      <Command>
        <CommandInput placeholder="Search" />
        <CommandList>
          <CommandGroup heading="Tools">
            <CommandItem value="alpha">Alpha</CommandItem>
            <CommandItem value="beta">Beta</CommandItem>
          </CommandGroup>
        </CommandList>
      </Command>,
    );
    const input = container.querySelector(
      '[data-slot="command-input"]',
    ) as HTMLInputElement;
    const list = container.querySelector(
      '[data-slot="command-list"]',
    ) as HTMLElement;
    const rows = () =>
      [
        ...container.querySelectorAll('[data-slot="command-item"]'),
      ] as HTMLElement[];

    expect(input.getAttribute('role')).toBe('combobox');
    expect(input.getAttribute('aria-expanded')).toBe('true');
    expect(input.getAttribute('aria-controls')).toBe(list.id);
    // ScrollView DROPS `role` and honours `accessibilityRole`, which
    // react-native-web emits as the DOM role. Asserting the DOM, not the prop.
    expect(list.getAttribute('role')).toBe('listbox');
    expect(rows()[0].getAttribute('role')).toBe('option');

    // aria-selected mirrors gui's own data-selected, and the input publishes the
    // active row — which is what actually announces the selection, since focus
    // stays in the input.
    // gui parks the cursor on the first row in an effect; the mirror observes
    // the resulting data-selected change, so this settles a tick later.
    await waitFor(() =>
      expect(rows()[0].getAttribute('aria-selected')).toBe('true'),
    );
    expect(input.getAttribute('aria-activedescendant')).toBe(rows()[0].id);
    input.focus();
    await userEvent.keyboard('{ArrowDown}');
    await waitFor(() =>
      expect(rows().map((r) => r.getAttribute('aria-selected'))).toEqual([
        'false',
        'true',
      ]),
    );
    expect(input.getAttribute('aria-activedescendant')).toBe(rows()[1].id);
  });

  it('CommandList takes its height as a gui prop, not a class', () => {
    // The fork merged the caller's class through tailwind-merge, so `max-h-full`
    // REPLACED the 300px default. gui discards className on a ScrollView and
    // pins maxH:300, so the height has to ride as a prop.
    const { container } = wrap(
      <Command>
        <CommandList maxH="100%">
          <CommandItem value="a">A</CommandItem>
        </CommandList>
      </Command>,
    );
    const list = container.querySelector(
      '[data-slot="command-list"]',
    ) as HTMLElement;
    expect(list.className).toContain('_maxH-100');
    expect(list.className).not.toContain('_maxH-300px');
  });

  it('DropdownMenuContent takes width and overflow as gui props', async () => {
    // gui bakes overflow:hidden on BOTH axes plus minW:200, so `overflow-y-auto`
    // and `min-w-[330px]` were inert and every row past the panel edge was
    // unreachable by pointer. The class still lands on the DOM — it just loses
    // to gui's runtime stylesheet, which is why this asserts the gui classes.
    const { baseElement } = wrap(
      <DropdownMenu open>
        <DropdownMenuTrigger>open</DropdownMenuTrigger>
        <DropdownMenuContent minW={330} overflow="scroll">
          <DropdownMenuItem>Row one</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>,
    );
    const menu = baseElement.querySelector('[role="menu"]') as HTMLElement;
    expect(menu.className).toContain('_minW-330px');
    expect(menu.className).toContain('_oy-scroll');
    expect(menu.className).not.toContain('_oy-hidden');
  });

  it('no @radix-ui component is rendered inside a gui parent', async () => {
    // Two files kept a Radix import whose parent had migrated: a
    // SelectPrimitive.Trigger inside a gui <Select> (agent side-chat) and a
    // Radix DialogClose inside the gui Dialog (FullscreenDialog). Both threw at
    // render because the Radix context no longer exists. This is the shape that
    // threw, driven through the app's own barrel.
    const { baseElement } = wrap(
      <Dialog defaultOpen>
        <DialogContent showCloseButton={false}>
          <DialogTitle>Preview</DialogTitle>
          <DialogClose>x</DialogClose>
        </DialogContent>
      </Dialog>,
    );
    expect(
      baseElement.querySelector('[data-slot="dialog-close"]'),
    ).not.toBeNull();
    await userEvent.click(
      baseElement.querySelector('[data-slot="dialog-close"]') as HTMLElement,
    );
    expect(
      baseElement.querySelector('[data-slot="dialog-content"]'),
    ).toBeNull();
  });

  // ── The five forks deleted on @hanzo/ui 8.0.68 ────────────────────────────
  // accordion · alert-dialog · hover-card · radio-group · toggle-group. Each
  // asserts the semantics the Radix fork carried and gui does NOT emit on its
  // own, plus every prop a call site had to hoist out of a className because
  // gui bakes the same thing as a style prop and wins the tie at runtime.

  it('RadioGroup keeps radiogroup/radio roles, the id a Label binds to, and fires onValueChange', async () => {
    const onValueChange = vi.fn();
    const { container } = wrap(
      <RadioGroup onValueChange={onValueChange} value="sm">
        <Label htmlFor="sm">Small</Label>
        <RadioGroupItem id="sm" value="sm" />
        <RadioGroupItem id="base" value="base" />
        <RadioGroupItem disabled id="lg" value="lg" />
      </RadioGroup>,
    );
    expect(
      container
        .querySelector('[data-slot="radio-group"]')
        ?.getAttribute('role'),
    ).toBe('radiogroup');
    const items = [
      ...container.querySelectorAll('[role="radio"]'),
    ] as HTMLElement[];
    expect(items).toHaveLength(3);
    // 6 sites label their radio with <Label htmlFor>, so the id has to survive
    // the gui hop or every one of them stops being clickable by its label.
    expect(items.map((i) => i.id)).toEqual(['sm', 'base', 'lg']);
    expect(container.querySelector('label')?.getAttribute('for')).toBe('sm');
    expect(items.map((i) => i.getAttribute('aria-checked'))).toEqual([
      'true',
      'false',
      'false',
    ]);
    await userEvent.click(items[1]);
    expect(onValueChange).toHaveBeenCalledWith('base');
    // publish-agent-dialog disables already-published rows.
    expect(items[2].getAttribute('aria-disabled')).toBe('true');
  });

  it('RadioGroupItem takes its sr-only geometry as PROPS', () => {
    // appearance.tsx hides four radios behind Card affordances with `sr-only`.
    // gui bakes width/height 16 and borderWidth 1 as style props, so sr-only's
    // 1px box lost the tie and a dot painted inside every card.
    const { container } = wrap(
      <RadioGroup value="sm">
        <RadioGroupItem
          borderWidth={0}
          className="sr-only"
          height={1}
          id="sm"
          value="sm"
          width={1}
        />
      </RadioGroup>,
    );
    const item = container.querySelector('[role="radio"]') as HTMLElement;
    expect(item.className).toContain('sr-only');
    expect(item.className).toContain('_width-1px');
    expect(item.className).toContain('_height-1px');
    expect(item.className).not.toContain('_width-16px');
  });

  it('Accordion is a heading + a real button, and toggles a labelled region', async () => {
    const { container } = wrap(
      <Accordion collapsible type="single">
        <AccordionItem borderBottomWidth={0} value="a">
          <AccordionTrigger className="py-3">Head A</AccordionTrigger>
          <AccordionContent>Body A</AccordionContent>
        </AccordionItem>
      </Accordion>,
    );
    // gui's Accordion.Header is an <h1> at $10 — every row shipped a competing
    // document heading. @hanzo/ui re-hosts it at h3 with the matching aria-level.
    const header = container.querySelector('[data-slot="accordion-header"]');
    expect(header?.tagName).toBe('H3');
    expect(header?.getAttribute('aria-level')).toBe('3');
    const trigger = container.querySelector(
      '[data-slot="accordion-trigger"]',
    ) as HTMLButtonElement;
    // A BARE <button> inside a form is a SUBMIT button: conversation-header's
    // accordion lives in one. This is the same defect that kept `button` local.
    expect(trigger.tagName).toBe('BUTTON');
    expect(trigger.type).toBe('button');
    expect(trigger.className).toContain('py-3');
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(
      container.querySelector('[data-slot="accordion-content"]'),
    ).toBeNull();
    await userEvent.click(trigger);
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    const content = container.querySelector('[data-slot="accordion-content"]');
    expect(content?.getAttribute('role')).toBe('region');
    expect(content?.getAttribute('aria-labelledby')).toBe(trigger.id);
    expect(container.textContent).toContain('Body A');
    // `border-b-0` lost to gui's baked borderBottomWidth:1 — conversation-header
    // hoisted it to a prop so its four rows do not each grow a rule.
    expect(
      (container.querySelector('[data-slot="accordion-item"]') as HTMLElement)
        .className,
    ).toContain('_borderBottomWidth-0px');
  });

  it('AccordionTrigger hides the chevron through hideArrow, not a child selector', () => {
    // gui wraps the chevron in its own XStack, so message.tsx's
    // `[&>svg]:hidden` (an unfinished tool call) no longer matches anything.
    const shown = wrap(
      <Accordion collapsible type="single">
        <AccordionItem value="a">
          <AccordionTrigger>Head</AccordionTrigger>
        </AccordionItem>
      </Accordion>,
    );
    expect(
      shown.container.querySelectorAll('[data-slot="accordion-chevron"]'),
    ).toHaveLength(1);
    const hidden = wrap(
      <Accordion collapsible type="single">
        <AccordionItem value="a">
          <AccordionTrigger hideArrow>Head</AccordionTrigger>
        </AccordionItem>
      </Accordion>,
    );
    expect(
      hidden.container.querySelectorAll('[data-slot="accordion-chevron"]'),
    ).toHaveLength(0);
  });

  it('HoverCard opens on HOVER through an asChild trigger', async () => {
    // All 9 call sites wrap a slider row in `<HoverCardTrigger asChild>`. Press
    // is disabled by design here (the trigger must stay clickable), so the open
    // path is hover — and hover has to survive the asChild hop or the help text
    // is unreachable while the control looks perfect.
    const { baseElement } = wrap(
      <HoverCard openDelay={0}>
        <HoverCardTrigger asChild>
          <div className="grid w-full gap-1.5">Temperature</div>
        </HoverCardTrigger>
        <HoverCardContent align="start" side="left" width={300}>
          what temperature does
        </HoverCardContent>
      </HoverCard>,
    );
    const trigger = baseElement.querySelector(
      '[data-slot="hover-card-trigger"]',
    ) as HTMLElement;
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    await userEvent.hover(trigger);
    await waitFor(() =>
      expect(trigger.getAttribute('aria-expanded')).toBe('true'),
    );
    const content = baseElement.querySelector(
      '[data-slot="hover-card-content"]',
    ) as HTMLElement;
    expect(content.textContent).toContain('what temperature does');
    // Radix left its hover card roleless; riding gui's popper it announces.
    expect(content.parentElement?.getAttribute('role')).toBe('dialog');
    // gui bakes width:256, so `w-[300px]` lost the tie at every call site.
    expect(content.className).toContain('_width-300px');
    expect(content.className).not.toContain('_width-256px');
  });

  it('HoverCardContent side+align hoist to ONE placement on the root', async () => {
    // The floating trap: Radix put side/align on the Content, gui takes one
    // `placement` on the root — and PopoverContent ACCEPTS `align` before
    // discarding it. HoverCardContent publishes both up instead, so the call
    // sites keep the Radix spelling and still land left-start.
    const { baseElement } = wrap(
      <HoverCard open openDelay={0}>
        <HoverCardTrigger asChild>
          <div>t</div>
        </HoverCardTrigger>
        <HoverCardContent align="start" side="left">
          body
        </HoverCardContent>
      </HoverCard>,
    );
    await waitFor(() =>
      expect(
        baseElement
          .querySelector('[data-slot="hover-card-content"]')
          ?.getAttribute('data-placement'),
      ).toBe('left-start'),
    );
  });

  it('AlertDialog is an alertdialog, and its two buttons are real buttons that fire and close', async () => {
    const onAction = vi.fn();
    const { baseElement } = wrap(
      <AlertDialog defaultOpen>
        <AlertDialogContent width="75%">
          <AlertDialogTitle>Reset your Node</AlertDialogTitle>
          <AlertDialogDescription>This cannot be undone</AlertDialogDescription>
          <AlertDialogFooter gap={16} justify="space-between">
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="min-w-[120px]" onClick={onAction}>
              Reset
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>,
    );
    const content = baseElement.querySelector(
      '[data-slot="alert-dialog-content"]',
    ) as HTMLElement;
    // NOT role="dialog": this is the modal that interrupts, and the role is the
    // whole difference between it and Dialog.
    expect(content.getAttribute('role')).toBe('alertdialog');
    // gui bakes width:100%, so `w-[75%]` lost the tie at 3 sites.
    expect(content.className).toContain('_width-7537');
    const action = baseElement.querySelector(
      '[data-slot="alert-dialog-action"]',
    ) as HTMLButtonElement;
    const cancel = baseElement.querySelector(
      '[data-slot="alert-dialog-cancel"]',
    ) as HTMLButtonElement;
    // A real <button type="button">: a <div role="button"> takes a click but
    // NOT Enter, and a bare <button> in a form would submit it.
    expect([action.tagName, cancel.tagName]).toEqual(['BUTTON', 'BUTTON']);
    expect(action.type).toBe('button');
    // gui's close part hardcodes aria-label="Dialog Close", which would rename
    // every choice in the dialog — including the destructive one.
    expect(action.getAttribute('aria-label')).toBeNull();
    expect(action.textContent).toContain('Reset');
    // buttonVariants() in a className would still typecheck and still lose to
    // gui's runtime sheet; the variant is a PROP now. This class does not
    // collide with anything gui bakes, so it still lands.
    expect(action.className).toContain('min-w-[120px]');
    // gui bakes justify:flex-end + gap:$2, so mcp.tsx's `justify-between gap-4`
    // had to become props.
    const footer = baseElement.querySelector(
      '[data-slot="alert-dialog-footer"]',
    ) as HTMLElement;
    // gui hashes long atomic class names, so match the stable prefix — the
    // same idiom the DialogFooter spec above uses.
    expect(footer.className).toMatch(/_justify-sp/);
    expect(footer.className).toContain('_gap-16px');
    await userEvent.click(action);
    expect(onAction).toHaveBeenCalled();
    expect(
      baseElement.querySelector('[data-slot="alert-dialog-content"]'),
    ).toBeNull();
  });

  it('a disabled AlertDialogAction announces it and cannot be fired by mouse OR keyboard', async () => {
    // mcp.tsx disables the confirm until there is JSON to copy. gui does NOT
    // set the DOM `disabled` attribute — it publishes aria-disabled and
    // pointer-events:none — so the keyboard path is the one worth proving.
    const onAction = vi.fn();
    const { baseElement } = wrap(
      <AlertDialog defaultOpen>
        <AlertDialogContent>
          <AlertDialogTitle>t</AlertDialogTitle>
          <AlertDialogFooter>
            <AlertDialogAction disabled onClick={onAction}>
              Copy
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>,
    );
    const action = baseElement.querySelector(
      '[data-slot="alert-dialog-action"]',
    ) as HTMLButtonElement;
    expect(action.getAttribute('aria-disabled')).toBe('true');
    expect(action.className).toContain('_pe-none');
    action.focus();
    await userEvent.keyboard('{Enter}');
    expect(onAction).not.toHaveBeenCalled();
    expect(
      baseElement.querySelector('[data-slot="alert-dialog-content"]'),
    ).not.toBeNull();
  });

  it('ToggleGroup single-select carries radiogroup/radio + aria-checked, and both callbacks fire', async () => {
    // gui keeps role="group" and, for single, deletes aria-pressed without
    // putting the radio semantics back — the selected segment announced as an
    // unlabelled button with no state. @hanzo/ui restores what Radix had.
    const onValueChange = vi.fn();
    const onClick = vi.fn();
    const { container } = wrap(
      <ToggleGroup
        gap={0}
        onValueChange={onValueChange}
        type="single"
        value="grid"
      >
        <ToggleGroupItem value="grid">Grid</ToggleGroupItem>
        <ToggleGroupItem onClick={onClick} value="list">
          List
        </ToggleGroupItem>
        <ToggleGroupItem disabled value="table">
          Table
        </ToggleGroupItem>
      </ToggleGroup>,
    );
    const root = container.querySelector(
      '[data-slot="toggle-group"]',
    ) as HTMLElement;
    expect(root.getAttribute('role')).toBe('radiogroup');
    // The segments must TOUCH: gui bakes gap:$1, so conversation-footer's
    // `gap-0`/`-space-x-px` joinery lost the tie.
    expect(root.className).toContain('_gap-0px');
    const items = [
      ...container.querySelectorAll('[data-slot="toggle-group-item"]'),
    ] as HTMLButtonElement[];
    expect(items.map((i) => i.tagName)).toEqual(['BUTTON', 'BUTTON', 'BUTTON']);
    expect(items.map((i) => i.getAttribute('role'))).toEqual([
      'radio',
      'radio',
      'radio',
    ]);
    expect(items.map((i) => i.getAttribute('aria-checked'))).toEqual([
      'true',
      'false',
      'false',
    ]);
    expect(items[0].getAttribute('data-state')).toBe('on');
    await userEvent.click(items[1]);
    expect(onValueChange).toHaveBeenCalledWith('list');
    // vector-fs-toggle-layout drives its store from the item's OWN onClick and
    // passes no onValueChange at all, so both paths have to reach the DOM.
    expect(onClick).toHaveBeenCalled();
    expect(items[2].disabled).toBe(true);
  });

  it('ToggleGroupItem takes its segmented-control corners as props', () => {
    // gui bakes rounded:$3, so `rounded-none first:rounded-s-lg` lost the tie
    // and both halves of the chat tool switcher came out fully rounded.
    const { container } = wrap(
      <ToggleGroup type="single" value="form">
        <ToggleGroupItem
          borderBottomRightRadius={0}
          borderTopRightRadius={0}
          rounded={8}
          size="sm"
          value="form"
        >
          Form
        </ToggleGroupItem>
      </ToggleGroup>,
    );
    const item = container.querySelector(
      '[data-slot="toggle-group-item"]',
    ) as HTMLElement;
    expect(item.className).toContain('_btrr-0px');
    expect(item.className).toContain('_bbrr-0px');
    expect(item.className).toContain('_btlr-8px');
  });
});
