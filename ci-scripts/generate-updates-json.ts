import fs from 'fs';
import { formatRFC3339 } from 'date-fns';
import z from 'zod';

const envSchema = z.object({
  JSON_PATH: z.string().min(1),
  VERSION: z.string().min(5),
  NOTES: z.string().min(1),
  PUB_DATE: z.string().optional(),
  DARWIN_AARCH64_SIGNATURE: z.string().optional(),
  DARWIN_AARCH64_URL: z.string().optional(),
  LINUX_x86_64_SIGNATURE: z.string().optional(),
  LINUX_x86_64_URL: z.string().optional(),
  LINUX_AARCH64_SIGNATURE: z.string().optional(),
  LINUX_AARCH64_URL: z.string().optional(),
  WINDOWS_x86_64_SIGNATURE: z.string().optional(),
  WINDOWS_x86_64_URL: z.string().optional(),
});

const env = envSchema.parse(process.env);

// Only list a platform when this run actually produced a signed updater bundle
// for it. The release matrix is fail-fast:false, so a leg can legitimately be
// absent (e.g. an offline self-hosted runner). The Tauri updater treats a
// missing platform as "no update available" for that OS — the correct graceful
// behaviour — so a partial matrix must NOT fail the rollout.
const platforms: Record<string, { signature: string; url: string }> = {};
const add = (key: string, signature?: string, url?: string) => {
  if (signature && signature.length > 0 && url && url.length > 0) {
    platforms[key] = { signature, url };
  }
};

// The macOS build is a UNIVERSAL bundle (arm64 + x86_64), so the single signed
// .app.tar.gz serves both darwin architectures.
add('darwin-aarch64', env.DARWIN_AARCH64_SIGNATURE, env.DARWIN_AARCH64_URL);
add('darwin-x86_64', env.DARWIN_AARCH64_SIGNATURE, env.DARWIN_AARCH64_URL);
add('linux-x86_64', env.LINUX_x86_64_SIGNATURE, env.LINUX_x86_64_URL);
add('linux-aarch64', env.LINUX_AARCH64_SIGNATURE, env.LINUX_AARCH64_URL);
add('windows-x86_64', env.WINDOWS_x86_64_SIGNATURE, env.WINDOWS_x86_64_URL);

if (Object.keys(platforms).length === 0) {
  throw new Error(
    'No platform produced a signed updater bundle; refusing to write an empty updates.json',
  );
}

const updatesJson = {
  version: env.VERSION,
  notes: env.NOTES,
  pub_date: env.PUB_DATE || formatRFC3339(new Date()),
  platforms,
};

fs.writeFileSync(env.JSON_PATH, JSON.stringify(updatesJson, null, 2));
