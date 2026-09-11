import path from "path";
import { fileURLToPath } from "url";
import { rspack } from "@rspack/core";
import { ReactRefreshRspackPlugin } from "@rspack/plugin-react-refresh";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

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
          isDev ? "ws://127.0.0.1:3717/ws" : ""
        ),
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
          port: 5173,
          hot: true,
          allowedHosts: "all",
          proxy: [
            {
              context: ["/api"],
              target: "http://127.0.0.1:3717",
            },
          ],
        }
      : undefined,
  };
};
