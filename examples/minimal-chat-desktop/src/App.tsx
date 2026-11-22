import { type FormEvent, useEffect, useState } from 'react';
import { getBrand } from '@hanzo/desktop-brand-config';
import { BrandMark } from '@hanzo/desktop-logo';
import {
  DEFAULT_LOCAL_ENGINE_URL,
  EngineStatusBadge,
  isTauriAvailable,
  probeEngineHealth,
  safeInvoke,
  sendChatCompletion,
  WindowTitlebar,
  type ChatMessage,
  type EngineHealth,
} from '@hanzo/desktop-sdk';

export function App() {
  const brand = getBrand();
  const [engineUrl, setEngineUrl] = useState(DEFAULT_LOCAL_ENGINE_URL);
  const [health, setHealth] = useState<EngineHealth>({
    online: false,
    baseUrl: DEFAULT_LOCAL_ENGINE_URL,
    models: [],
  });
  const [model, setModel] = useState('default');
  const [prompt, setPrompt] = useState('');
  const [busy, setBusy] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [projects, setProjects] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const refreshEngine = async (targetUrl = engineUrl) => {
    const next = await probeEngineHealth(targetUrl);
    setHealth(next);
    if (next.models.length > 0 && (model === 'default' || !next.models.includes(model))) {
      setModel(next.models[0]);
    }
  };

  useEffect(() => {
    void refreshEngine(DEFAULT_LOCAL_ENGINE_URL);
    void safeInvoke<string[]>('list_recent_projects').then((found) => {
      if (found) setProjects(found);
    });
  }, []);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const trimmed = prompt.trim();
    if (!trimmed || busy) return;
    setError(null);
    const nextHistory: ChatMessage[] = [...messages, { role: 'user', content: trimmed }];
    setMessages(nextHistory);
    setPrompt('');
    setBusy(true);
    try {
      const reply = await sendChatCompletion({
        baseUrl: engineUrl,
        model,
        messages: nextHistory,
      });
      setMessages([...nextHistory, { role: 'assistant', content: reply }]);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="starter-shell">
      <WindowTitlebar
        actions={
          <span style={{ fontSize: 12, opacity: 0.7 }}>
            {isTauriAvailable() ? 'Tauri Host' : 'Web Preview'}
          </span>
        }
        icon={<BrandMark brand={brand.brand} size={18} />}
        status={<EngineStatusBadge modelCount={health.models.length} online={health.online} />}
        title={`${brand.name} Desktop Starter`}
      />

      <main className="starter-main">
        <div className="starter-toolbar">
          <input
            aria-label="Engine URL"
            className="starter-input"
            onChange={(e) => setEngineUrl(e.target.value)}
            placeholder="http://127.0.0.1:36900"
            value={engineUrl}
          />
          <input
            aria-label="Model ID"
            className="starter-input"
            onChange={(e) => setModel(e.target.value)}
            placeholder="Model ID"
            style={{ maxWidth: 200 }}
            value={model}
          />
          <button
            className="starter-btn"
            onClick={() => void refreshEngine(engineUrl)}
            type="button"
          >
            Check Engine
          </button>
        </div>

        {projects.length > 0 ? (
          <div style={{ fontSize: 12, opacity: 0.75 }}>
            Recent workspaces: {projects.slice(0, 3).join(', ')}
          </div>
        ) : null}

        <section aria-label="Conversation" className="starter-messages">
          {messages.length === 0 ? (
            <p style={{ margin: 0, opacity: 0.65, fontSize: 14 }}>
              Point at any local OpenAI-compatible inference server (such as hanzo-engine,
              Ollama, or llama.cpp) and send a message to start chatting.
            </p>
          ) : (
            messages.map((m, idx) => (
              <div className="starter-msg" data-role={m.role} key={idx}>
                {m.content}
              </div>
            ))
          )}
        </section>

        {error ? (
          <div role="alert" style={{ color: '#f87171', fontSize: 13 }}>
            {error}
          </div>
        ) : null}

        <form className="starter-toolbar" onSubmit={(e) => void onSubmit(e)}>
          <input
            aria-label="Prompt"
            className="starter-input"
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Ask your local model anything..."
            value={prompt}
          />
          <button className="starter-btn" disabled={busy || !prompt.trim()} type="submit">
            {busy ? 'Sending...' : 'Send'}
          </button>
        </form>
      </main>
    </div>
  );
}
