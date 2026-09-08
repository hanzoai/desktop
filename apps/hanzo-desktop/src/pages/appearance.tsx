import { useTranslation } from '@hanzo/desktop-i18n';
import { Card, RadioGroup, RadioGroupItem, Label } from '@hanzo/desktop-ui';
import { cn } from '@hanzo/desktop-ui/utils';

import { type ChatFontSize, useSettings } from '../store/settings';
import { SimpleLayout } from './layout/simple-layout';

/**
 * The four cards, once. `preview` is a literal class per row because Tailwind
 * scans source text — a computed `text-${value}` is never emitted.
 */
const CHAT_FONT_SIZES = [
  {
    label: 'settings.appearance.chatFontSize.small',
    preview: 'text-sm',
    value: 'sm',
  },
  {
    label: 'settings.appearance.chatFontSize.medium',
    preview: 'text-base',
    value: 'base',
  },
  {
    label: 'settings.appearance.chatFontSize.large',
    preview: 'text-lg',
    value: 'lg',
  },
  {
    label: 'settings.appearance.chatFontSize.extraLarge',
    preview: 'text-xl',
    value: 'xl',
  },
  // `as const` so each `label` keeps its literal type and still resolves
  // against the translation key union; `satisfies` still checks every `value`.
] as const satisfies readonly {
  label: string;
  preview: string;
  value: ChatFontSize;
}[];

const AppearancePage = () => {
  const { t } = useTranslation();

  const chatFontSize = useSettings((state) => state.chatFontSize);
  const setChatFontSize = useSettings((state) => state.setChatFontSize);

  return (
    <SimpleLayout classname="max-w-xl" title={t('settings.appearance.label')}>
      <div className="space-y-6">
        <div>
          <h2 className="text-lg font-semibold text-white">Chat font</h2>
          <p className="text-text-secondary text-sm">
            {t('settings.appearance.chatFontSize.description')}
          </p>
        </div>

        <RadioGroup
          onValueChange={(value) => setChatFontSize(value as ChatFontSize)}
          // gui's frame is `display:flex` (`.is_View`) with a baked `gap:$2`,
          // and its stylesheet is injected at runtime — after the bundled CSS —
          // so `grid grid-cols-4 gap-4` lost both ties and the four cards
          // stacked in a column. Inline style beats every class.
          style={{
            display: 'grid',
            gap: 16,
            gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
          }}
          value={chatFontSize}
        >
          {CHAT_FONT_SIZES.map(({ label, preview, value }) => (
            <Label
              className={cn(
                'cursor-pointer space-y-2',
                chatFontSize === value && '[&_div]:border-brand',
              )}
              htmlFor={value}
              key={value}
            >
              {/*
                `sr-only`'s 1px box loses to gui's baked 16px width/height and
                1px border — the dot painted inside every card. Those three ride
                as props; the rest of sr-only (position, clip, overflow) has no
                gui counterpart and still comes from the class.
              */}
              <RadioGroupItem
                borderWidth={0}
                className="sr-only"
                height={1}
                id={value}
                value={value}
                width={1}
              />
              <Card className="flex aspect-square flex-col items-center justify-center gap-2 rounded-lg border-2 p-4">
                <span
                  className={cn(
                    'font-sans flex min-h-[40px] items-center justify-center',
                    preview,
                  )}
                >
                  Aa
                </span>
                <span className="text-sm font-medium">{t(label)}</span>
              </Card>
            </Label>
          ))}
        </RadioGroup>
      </div>
    </SimpleLayout>
  );
};

export default AppearancePage;
