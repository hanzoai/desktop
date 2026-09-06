import { beforeEach, describe, expect, it, vi } from 'vitest';

// The desktop must not reach api.hanzo.ai with the webview's own fetch: the
// gateway answers `tauri://localhost` with no CORS headers, so the request never
// leaves. Standing in for the Tauri HTTP client here is also what proves the
// transport uses it.
const wire = vi.fn();
vi.mock('@tauri-apps/plugin-http', () => ({ fetch: (...args: unknown[]) => wire(...args) }));

const { speech } = await import('../speech');

function answer(body: BodyInit, init?: ResponseInit) {
  wire.mockResolvedValueOnce(new Response(body, { status: 200, ...init }));
}

describe('platform speech', () => {
  beforeEach(() => wire.mockReset());

  it('transcribes through the Tauri client, not the webview', async () => {
    answer(JSON.stringify({ text: 'hello' }));
    const heard = await speech(() => 'tok')
      .transcribe(new Blob(['x'], { type: 'audio/webm' }), {});

    expect(heard).toBe('hello');
    expect(wire).toHaveBeenCalledTimes(1);
    const [url, init] = wire.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.hanzo.ai/v1/audio/transcriptions');
    expect(new Headers(init.headers).get('Authorization')).toBe('Bearer tok');
  });

  it('asks for a model this gateway actually serves', async () => {
    answer(JSON.stringify({ text: '' }));
    await speech(() => 'tok').transcribe(new Blob(['x'], { type: 'audio/webm' }), {});

    const form = (wire.mock.calls[0] as [string, RequestInit])[1].body as FormData;
    // `whisper-1` is the package's OpenAI-shaped default and is a 404 here.
    expect(form.get('model')).toBe('whisper');
  });

  it('speaks in a voice this gateway actually has', async () => {
    answer(new Blob([new Uint8Array([1])], { type: 'audio/wav' }));
    await speech(() => 'tok').speak!('hi', {});

    const [url, init] = wire.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.hanzo.ai/v1/audio/speech');
    // `tts-1` / `alloy` are the package's defaults and neither exists here.
    expect(JSON.parse(init.body as string)).toMatchObject({
      model: 'kokoro',
      voice: 'af_heart',
      response_format: 'wav',
      input: 'hi',
    });
  });

  it('sends no bearer when nobody is signed in', async () => {
    answer(JSON.stringify({ text: '' }));
    await speech(() => null).transcribe(new Blob(['x'], { type: 'audio/webm' }), {});

    const init = (wire.mock.calls[0] as [string, RequestInit])[1];
    expect(new Headers(init.headers).has('Authorization')).toBe(false);
  });

  it('names no org: the payer comes from the signed principal', async () => {
    answer(JSON.stringify({ text: '' }));
    await speech(() => 'tok').transcribe(new Blob(['x'], { type: 'audio/webm' }), {});

    const init = (wire.mock.calls[0] as [string, RequestInit])[1];
    expect(new Headers(init.headers).has('X-Org-Id')).toBe(false);
  });

  it('reports a refusal instead of returning empty text', async () => {
    answer(JSON.stringify({ status: 'error', msg: 'API key is not recognized' }), {
      status: 401,
    });
    await expect(
      speech(() => 'dead').transcribe(new Blob(['x'], { type: 'audio/webm' }), {}),
    ).rejects.toThrow(/401/);
  });
});
