declare module "*.svg" {
  const src: string;
  export default src;
}

/** Dev: `ws://127.0.0.1:<dev API>/ws`. Production: empty (same origin). */
declare const __RUNNY_WS_URL__: string;
/** Dev API port. Production: empty. */
declare const __RUNNY_DEV_API_PORT__: string;
/** Dev UI port. Production: empty. */
declare const __RUNNY_DEV_UI_PORT__: string;
