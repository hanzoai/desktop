// One gui config for every window: @hanzo/ui's monochrome, the one hanzo.ai
// renders with, so the main window (hanzo.ai's app) and the small windows
// (spotlight, coordinator, node manager) share its tokens, themes and media.
import { monochrome } from '@hanzo/ui/gui-config';

export const config = monochrome;
export default monochrome;

// Importing @hanzo/ui/gui-config registers this config with the type system (its
// `GuiCustomConfig` augmentation), so the shorthand style props resolve here too.
