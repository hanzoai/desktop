/**
 * `react-native`, for a tree that never imports it.
 *
 * The workspace overrides `react-native` to `@hanzogui/react-native-web-lite`,
 * whose entry is an `.mjs` with no declarations beside it. `@hanzogui/element`
 * ships its `.ts` sources and imports two TYPES from that name, so under
 * `noImplicitAny` they resolve to nothing and the build reports errors in a
 * dependency that no app file can reach.
 *
 * Two names, declared as types rather than as a bare `declare module`: the bare
 * form makes every export a namespace, and `View` used as a type is then a
 * different error in the same place.
 */
declare module 'react-native' {
  export type View = unknown;
  export type TextInput = unknown;
}
