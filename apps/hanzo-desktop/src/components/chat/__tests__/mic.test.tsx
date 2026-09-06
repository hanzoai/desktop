import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// The gateway, standing in. Every case below drives the real `@hanzo/voice`
// machine; only the wire and the browser's own audio are stubbed.
const wire = vi.fn();
vi.mock('@tauri-apps/plugin-http', () => ({ fetch: (...a: unknown[]) => wire(...a) }));

const toasted = vi.fn();
vi.mock('sonner', () => ({ toast: { error: (...a: unknown[]) => toasted(...a) } }));

// The auth store keeps its tokens in the OS keychain, and reading it back is
// asynchronous. That read is not what these cases are about, and letting it
// land mid-test would rewrite the sign-in they just set up.
vi.mock('../../../lib/secure-storage', () => ({
  secureStorage: {
    getItem: () => Promise.resolve(null),
    setItem: () => Promise.resolve(),
    removeItem: () => Promise.resolve(),
  },
}));

const { Mic } = await import('../mic');
const { useAuth } = await import('../../../store/auth');

/** A browser that can record and can speak: the shape every desktop webview has. */
function browser() {
  const track = { stop: vi.fn() };
  Object.defineProperty(globalThis.navigator, 'mediaDevices', {
    configurable: true,
    value: { getUserMedia: vi.fn().mockResolvedValue({ getTracks: () => [track] }) },
  });

  const recording = vi.fn();
  class Recorder {
    static isTypeSupported = () => true;
    state = 'recording';
    mimeType = 'audio/webm';
    ondataavailable: unknown = null;
    onstop: unknown = null;
    start = recording;
    stop = vi.fn();
  }
  vi.stubGlobal('MediaRecorder', Recorder);

  vi.stubGlobal(
    'AudioContext',
    class {
      createAnalyser = () => ({ fftSize: 0, frequencyBinCount: 0, getByteTimeDomainData: vi.fn() });
      createMediaStreamSource = () => ({ connect: vi.fn() });
      close = vi.fn();
    },
  );

  const spoken = vi.fn();
  vi.stubGlobal('speechSynthesis', {
    cancel: vi.fn(),
    getVoices: () => [],
    speak: (line: { onend?: () => void }) => {
      spoken(line);
      queueMicrotask(() => line.onend?.());
    },
  });
  vi.stubGlobal(
    'SpeechSynthesisUtterance',
    class {
      onend: (() => void) | null = null;
      onerror: (() => void) | null = null;
    },
  );
  // No recogniser: a WKWebView / WebKitGTK shell has none, and the platform ear
  // is what this app is meant to use anyway.
  vi.stubGlobal('SpeechRecognition', undefined);
  vi.stubGlobal('webkitSpeechRecognition', undefined);

  vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: () => 'blob:x', revokeObjectURL: vi.fn() }));
  vi.stubGlobal(
    'Audio',
    class {
      onended: (() => void) | null = null;
      onerror: (() => void) | null = null;
      pause = vi.fn();
      play = () => Promise.resolve(this.onended?.());
    },
  );

  return { spoken, recording };
}

const signedIn = () =>
  useAuth.setState({
    auth: {
      profile: 'main',
      node_address: '',
      hanzo_identity: '',
      encryption_pk: '',
      identity_pk: '',
      api_v2_key: '',
      hanzo_token: 'a-real-user-token',
    },
  });

/** Open the conversation and let the ear settle. */
async function talk() {
  await act(async () => undefined);
  await act(async () => {
    screen.getByRole('button').click();
    await Promise.resolve();
  });
}

describe('the composer microphone', () => {
  let audio: ReturnType<typeof browser>;

  beforeEach(() => {
    wire.mockReset();
    toasted.mockReset();
    useAuth.setState({ auth: null });
    audio = browser();
  });

  // A conversation belongs to the page, not to the component drawing it, so it
  // outlives an unmount on purpose — and would be picked back up by the next
  // test's first render. Hang up the way a person does.
  afterEach(async () => {
    const button = screen.queryByRole('button');
    if (button?.getAttribute('aria-pressed') === 'true') {
      await act(async () => {
        button.click();
      });
    }
    await act(async () => {
      cleanup();
    });
    vi.unstubAllGlobals();
  });

  it('will not listen without a sign-in, even where the browser could do it alone', () => {
    // WebView2 brings its own recogniser, so the package would happily let a
    // signed-out person talk — to Chromium, in Chromium's voice, with nothing
    // reaching Hanzo and no bill to show that nothing did. The case that the
    // same button works once someone signs in is the next one down.
    vi.stubGlobal('webkitSpeechRecognition', class {});

    render(<Mic onPartial={vi.fn()} onUtterance={vi.fn()} />);
    const button = screen.getByRole('button');

    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('title', expect.stringContaining('Sign in'));
  });

  it('opens the microphone once someone is signed in', async () => {
    signedIn();
    render(<Mic onPartial={vi.fn()} onUtterance={vi.fn()} />);
    await talk();

    expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledWith({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });
    expect(screen.getByRole('button')).toHaveAttribute('aria-pressed', 'true');
  });

  it('listens with Hanzo even where the webview brings its own recogniser', async () => {
    // WebView2 ships `webkitSpeechRecognition`. Taking it would keep every
    // desktop turn inside Chromium: Hanzo transcribes nothing, improves on
    // nothing, and the bill reads zero whether or not voice is working — which
    // is indistinguishable from voice nobody used. The recorder leg is the one
    // that reaches api.hanzo.ai, so it is the one that must win here.
    const recogniser = vi.fn();
    vi.stubGlobal(
      'webkitSpeechRecognition',
      class {
        constructor() {
          recogniser();
        }
        start = vi.fn();
        stop = vi.fn();
        abort = vi.fn();
      },
    );

    signedIn();
    render(<Mic onPartial={vi.fn()} onUtterance={vi.fn()} />);
    await talk();

    expect(audio.recording).toHaveBeenCalled();
    expect(recogniser).not.toHaveBeenCalled();
  });

  it('never lets a refused Hanzo voice pass for a working one', async () => {
    signedIn();
    wire.mockResolvedValue(
      new Response(JSON.stringify({ status: 'error', msg: 'API key is not recognized' }), {
        status: 401,
      }),
    );

    const { rerender } = render(<Mic onPartial={vi.fn()} onUtterance={vi.fn()} reply={null} />);
    await talk();

    await act(async () => {
      rerender(<Mic onPartial={vi.fn()} onUtterance={vi.fn()} reply="the answer" />);
    });
    await waitFor(() => expect(toasted).toHaveBeenCalled());

    // The browser did read the reply — the conversation is not left mute — but
    // the refusal is on the button and in a toast carrying what IAM said.
    expect(audio.spoken).toHaveBeenCalled();
    expect(screen.getByRole('button')).toHaveAttribute('data-refusal', 'mouth');
    expect(toasted).toHaveBeenCalledWith(
      expect.stringContaining('Hanzo speech is unavailable'),
      expect.objectContaining({
        description: expect.stringContaining('API key is not recognized'),
      }),
    );
  });

  it('does not replay a reply the composer already had when it remounted', async () => {
    signedIn();
    wire.mockResolvedValue(new Response(new Blob([new Uint8Array([1])], { type: 'audio/wav' })));

    render(<Mic onPartial={vi.fn()} onUtterance={vi.fn()} reply={null} />);
    await talk();

    // Sending the first turn is what swaps `/c/new` for `/c/<id>`, which
    // remounts the composer in the middle of the conversation. The reply
    // already on screen is not news, and must not be read out a second time.
    cleanup();
    const { rerender } = render(
      <Mic onPartial={vi.fn()} onUtterance={vi.fn()} reply="said before you arrived" />,
    );
    await act(async () => undefined);
    expect(wire).not.toHaveBeenCalled();

    // The next one is news.
    await act(async () => {
      rerender(<Mic onPartial={vi.fn()} onUtterance={vi.fn()} reply="a new answer" />);
    });
    await waitFor(() =>
      expect(wire).toHaveBeenCalledWith(
        'https://api.hanzo.ai/v1/audio/speech',
        expect.anything(),
      ),
    );
  });
});
