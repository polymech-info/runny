import path from "path";
import { fileURLToPath } from "url";
import { rspack } from "@rspack/core";
import { ReactRefreshRspackPlugin } from "@rspack/plugin-react-refresh";
import { DEV_API_PORT, DEV_UI_PORT } from "./scripts/ports.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const devApiPort = Number(process.env.RUNNY_API_PORT) || DEV_API_PORT;
const devUiPort = Number(process.env.RUNNY_UI_PORT) || DEV_UI_PORT;

/** Single all-in-one client bundle for npm publish + local `runny`. */
export default (env = {}, argv = {}) => {
  const isDev = argv.mode !== "production";

  return {
    target: "web",
    entry: path.resolve(__dirname, "src/client/main.tsx"),
    output: {
      path: path.resolve(__dirname, "dist/client"),
      publicPath: "auto",
      filename: "runny.bundle.js",
      chunkFilename: "runny.[name].js",
      assetModuleFilename: "runny.[name][ext]",
      clean: true,
    },
    resolve: {
      extensions: [".tsx", ".ts", ".jsx", ".js", ".json"],
      alias: {
        "@": path.resolve(__dirname, "src/client"),
      },
    },
    module: {
      rules: [
        {
          test: /\.[jt]sx?$/,
          include: [
            path.resolve(__dirname, "src/client"),
            path.resolve(__dirname, "src/shared"),
          ],
          loader: "builtin:swc-loader",
          options: {
            jsc: {
              parser: { syntax: "typescript", tsx: true },
              transform: {
                react: {
                  runtime: "automatic",
                  development: isDev,
                  refresh: isDev,
                },
              },
              target: "es2022",
            },
          },
        },
        {
          test: /\.css$/,
          use: ["style-loader", "css-loader", "postcss-loader"],
        },
        {
          test: /\.svg$/i,
          type: "asset/resource",
        },
      ],
    },
    plugins: [
      // Rspack HMR already owns /ws. Do not HPM-proxy it — the upgrade
      // target becomes undefined and the log socket never connects.
      new rspack.DefinePlugin({
        __RUNNY_WS_URL__: JSON.stringify(
          isDev ? `ws://127.0.0.1:${devApiPort}/ws` : ""
        ),
        __RUNNY_DEV_API_PORT__: JSON.stringify(isDev ? String(devApiPort) : ""),
        __RUNNY_DEV_UI_PORT__: JSON.stringify(isDev ? String(devUiPort) : ""),
      }),
      new rspack.HtmlRspackPlugin({
        template: path.resolve(__dirname, "src/client/index.html"),
        filename: "index.html",
        inject: "body",
        title: "Runny",
        minify: !isDev,
      }),
      new rspack.CopyRspackPlugin({
        patterns: [
          {
            from: path.resolve(__dirname, "src/client/public/favicon.svg"),
            to: "favicon.svg",
          },
        ],
      }),
      isDev && new ReactRefreshRspackPlugin(),
    ].filter(Boolean),
    devtool: isDev ? "eval-source-map" : false,
    performance: { hints: false },
    // One sync JS file — no async chunk fan-out for the published CLI UI.
    optimization: {
      splitChunks: false,
      runtimeChunk: false,
    },
    devServer: isDev
      ? {
          host: "127.0.0.1",
          port: devUiPort,
          hot: true,
          allowedHosts: "all",
          proxy: [
            {
              context: ["/api"],
              target: `http://127.0.0.1:${devApiPort}`,
              changeOrigin: true,
              // Survive brief API restarts (tsx watch) instead of hard-failing the browser.
              timeout: 30_000,
              proxyTimeout: 30_000,
              onError(err, _req, res) {
                const r = res;
                if (
                  r &&
                  typeof r.writeHead === "function" &&
                  !r.headersSent
                ) {
                  r.writeHead(502, { "Content-Type": "application/json" });
                  r.end(
                    JSON.stringify({
                      error: `API unreachable (is runny/server on :${devApiPort}?)`,
                      detail: String(err?.message ?? err),
                    })
                  );
                }
              },
            },
          ],
        }
      : undefined,
  };
};
