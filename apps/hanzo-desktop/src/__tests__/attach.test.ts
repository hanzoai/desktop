/**
 * Attaching a file through the PATCHED @hanzo/app pane (patches/@hanzo__app@0.3.149.patch):
 * signed out, the file is read in the window; signed in, it goes to the workspace upload.
 * Before the patch's local-read hunk was restored, hold() passed an undefined `org` to
 * transfer(), so every attachment threw `ReferenceError: org is not defined`.
 */
import { hold, landed, paneOf } from '@hanzo/app/pane';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/** The workspace API the pane uploads through; every call is recorded and refused. */
function api() {
  const json = vi.fn(async () => {
    throw new Error('offline');
  });
  return { json, via: (org?: string) => ({ org, api: { http: { json } } }) as never };
}

describe('attaching a file', () => {
  beforeEach(() => {
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:held') }));
  });
  afterEach(() => vi.unstubAllGlobals());

  it('signed out, reads a text file in the window and uploads nothing', async () => {
    const { json, via } = api();
    await hold('signed-out-text', [new File(['hello from a file'], 'notes.txt', { type: 'text/plain' })], via());
    const [held] = paneOf('signed-out-text').held;
    const got = (await landed(held)) as { localText?: string; status?: string } | null;
    expect(got?.localText).toBe('hello from a file');
    expect(paneOf('signed-out-text').held[0].state).toBe('ready');
    expect(json).not.toHaveBeenCalled();
  });

  it('signed out, reads a picture as a data URL', async () => {
    const { via } = api();
    await hold('signed-out-image', [new File([new Uint8Array([137, 80, 78, 71])], 'shot.png', { type: 'image/png' })], via());
    const got = (await landed(paneOf('signed-out-image').held[0])) as { dataUrl?: string } | null;
    expect(got?.dataUrl).toMatch(/^data:image\/png;base64,/);
  });

  it('signed out, says in a sentence why a PDF or a video cannot be read, and reads nothing', async () => {
    const { json, via } = api();
    const files = [
      new File(['%PDF-1.7'], 'contract.pdf', { type: 'application/pdf' }),
      new File([new Uint8Array(16)], 'clip.mp4', { type: 'video/mp4' }),
    ];
    await hold('signed-out-other', files, via());
    const held = paneOf('signed-out-other').held;
    for (const [i, h] of held.entries()) {
      expect(await landed(h)).toBeNull();
      expect(paneOf('signed-out-other').held[i].state).toBe('failed');
      expect(paneOf('signed-out-other').held[i].error).toBe(
        `Sign in to attach ${files[i].name}: without an account only pictures and text files can be read here.`,
      );
    }
    expect(json).not.toHaveBeenCalled();
  });

  it('signed out, will not read a text file over 1 MB', async () => {
    const { via } = api();
    const big = new File([new Uint8Array(1024 * 1024 + 1)], 'dump.log', { type: 'text/plain' });
    await hold('signed-out-big', [big], via());
    expect(await landed(paneOf('signed-out-big').held[0])).toBeNull();
    expect(paneOf('signed-out-big').held[0].error).toBe(
      'dump.log is too large to attach without signing in (text files up to 1 MB).',
    );
  });

  it('signed in, sends the file to the workspace upload, and a failure is the upload’s own', async () => {
    const { json, via } = api();
    await hold('signed-in', [new File(['x'], 'report.txt', { type: 'text/plain' })], via('acme'));
    const [held] = paneOf('signed-in').held;
    expect(await landed(held)).toBeNull();
    expect(json).toHaveBeenCalledWith({ path: '/v1/s3/buckets' });
    const chip = paneOf('signed-in').held[0];
    expect(chip.state).toBe('failed');
    expect(chip.error).toBe('offline');
  });
});
