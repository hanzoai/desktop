// It safe join url chunks avoiding double '/' between paths
// Warning: It doesn't supports all cases but it's enough for join hanzo-node api urls
export const urlJoin = (...chunks: string[]): string => {
  // If the first (base) chunk is empty/undefined, the caller wants a same-origin
  // path. Preserve the leading '/' from the next non-empty chunk so the result
  // is a valid absolute path rather than a relative one.
  const baseEmpty = !chunks[0] || chunks[0].trim() === '';
  const trimmed = chunks
    .map((chunk) => chunk.replace(/(^\/+|\/+$)/gm, ''))
    .filter((chunk) => !!chunk)
    .join('/');
  return baseEmpty ? `/${trimmed}` : trimmed;
};
