/** How far above a preferred port another instance may step. */
export const PORT_SPAN = 40;

/**
 * Built CLI (`runny`, `dist/cli.js`).
 * Further instances use 3718, 3719, … through 3717 + PORT_SPAN - 1.
 */
export const BUILD_PORT = 3717;

/**
 * `npm run dev` API. 4717 is one thousand above the build port, outside
 * the build scan, so a dev server and a built `runny` can listen together.
 */
export const DEV_API_PORT = 4717;

/**
 * Rspack dev UI. 6173 is one thousand above the usual 5173 frontend port
 * so this dashboard does not take another app's dev server.
 */
export const DEV_UI_PORT = 6173;
