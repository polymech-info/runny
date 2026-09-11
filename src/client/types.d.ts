declare module "*.svg" {
  const src: string;
  export default src;
}

/** Dev: `ws://127.0.0.1:3717/ws`. Production: empty (same origin). */
declare const __RUNNY_WS_URL__: string;
