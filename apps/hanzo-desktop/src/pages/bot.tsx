import { useEffect, useState } from 'react';

const BOT_GATEWAY_URL = 'http://127.0.0.1:18789';

const BotPage = () => {
  const [status, setStatus] = useState<'checking' | 'online' | 'offline'>(
    'checking',
  );

  useEffect(() => {
    const check = async () => {
      try {
        const res = await fetch(BOT_GATEWAY_URL, { mode: 'no-cors' });
        setStatus('online');
      } catch {
        setStatus('offline');
      }
    };
    void check();
    const interval = setInterval(() => void check(), 5000);
    return () => clearInterval(interval);
  }, []);

  if (status === 'offline') {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 p-8">
        <div className="text-2xl font-bold">Hanzo Bot</div>
        <div className="text-text-secondary text-sm">
          Bot gateway is not running. Start it with:
        </div>
        <code className="bg-bg-secondary rounded-lg px-4 py-2 text-sm">
          hanzo-bot gateway --port 18789 --allow-unconfigured
        </code>
        <button
          className="bg-bg-quaternary hover:bg-bg-tertiary rounded-lg px-4 py-2 text-sm transition-colors"
          onClick={() => setStatus('checking')}
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="border-divider flex items-center justify-between border-b px-4 py-2 pt-8">
        <div className="flex items-center gap-2">
          <span className="text-lg font-semibold">Bot</span>
          <span
            className={`inline-block h-2 w-2 rounded-full ${
              status === 'online' ? 'bg-green-500' : 'bg-yellow-500'
            }`}
          />
        </div>
        <a
          className="text-text-secondary hover:text-text-default text-xs transition-colors"
          href={BOT_GATEWAY_URL}
          rel="noreferrer"
          target="_blank"
        >
          Open in browser
        </a>
      </div>
      <iframe
        className="flex-1 border-none"
        src={BOT_GATEWAY_URL}
        title="Hanzo Bot Control Plane"
      />
    </div>
  );
};

export default BotPage;
