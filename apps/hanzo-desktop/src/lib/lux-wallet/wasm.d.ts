// The luxfi/crypto WASM binary, resolved to a served asset URL by Vite's `?url`
// suffix. Passed to `init()` so the Go/WASM core loads via fetch in the webview.
declare module '@luxfi/crypto/crypto.wasm?url' {
  const url: string;
  export default url;
}
