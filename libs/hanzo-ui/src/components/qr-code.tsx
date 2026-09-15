import { Check, DownloadIcon } from 'lucide-react';
import React, { useState } from 'react';
import { QRCode as ReactQRCode } from 'react-qrcode-logo';

import hanzoLogo from '../assets/images/app-icon.png';

// Taken from the component rather than imported by name. The package declares
// its props in ./QRCode and does not re-export the type from its entry, so the
// name this file used to import was never there to import.
type QRCodeProps = React.ComponentProps<typeof ReactQRCode>;
import { Button } from './button';
import { Dialog, DialogContent } from '@hanzo/ui';

export function QRCode({
  value,
  size,
  id,
  ...props
}: {
  value: QRCodeProps['value'];
  size: QRCodeProps['size'];
  id?: QRCodeProps['id'];
} & React.HTMLAttributes<HTMLDivElement>): React.ReactElement {
  return (
    <div {...props}>
      <ReactQRCode
        ecLevel={'M'}
        eyeColor="black"
        eyeRadius={10}
        fgColor="black"
        id={id}
        logoHeight={size ? size * 0.2 : undefined}
        logoImage={hanzoLogo}
        logoPaddingStyle="circle"
        logoWidth={size ? size * 0.2 : undefined}
        qrStyle="dots"
        removeQrCodeBehindLogo
        size={size ?? 300}
        value={value}
      />
    </div>
  );
}

export function QrCodeModal({
  open,
  onOpenChange,
  value,
  onSave,
  title,
  description,
  modalClassName,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  value: QRCodeProps['value'];
  onSave: (key: string) => void;
  title: React.ReactNode;
  description: React.ReactNode;
  modalClassName?: string;
}) {
  const [saved, setSaved] = useState(false);
  const downloadCode = async () => {
    const canvas = document.querySelector('#registration-code-qr');
    if (canvas instanceof HTMLCanvasElement) {
      try {
        const pngUrl = canvas.toDataURL();
        onSave(pngUrl);
        setSaved(true);
      } catch (error) {
        console.error(error);
      } finally {
        setTimeout(() => {
          setSaved(false);
        }, 3000);
      }
    }
  };

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className={modalClassName} showCloseButton={false}>
        <div className="flex flex-col items-center py-4">
          <h2 className="mb-1 text-lg font-semibold">{title}</h2>
          <p className="text-text-secondary mb-5 text-center text-xs">
            {description}
          </p>
          <div className="mb-7 overflow-hidden rounded-lg shadow-2xl">
            <QRCode size={190} value={value} />
            <QRCode
              className="hidden"
              id="registration-code-qr"
              size={1024}
              value={value}
            />
          </div>
          <div className="flex flex-col gap-4">
            <Button className="flex gap-1" onClick={downloadCode}>
              {saved ? (
                <Check className="h-4 w-4" />
              ) : (
                <DownloadIcon className="h-4 w-4" />
              )}
              {saved ? 'Saved' : 'Download'}
            </Button>
            <Button
              className="flex gap-1"
              onClick={() => {
                onOpenChange(false);
              }}
              variant="tertiary"
            >
              I saved it, close
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
