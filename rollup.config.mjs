import commonjs from "@rollup/plugin-commonjs";
import json from "@rollup/plugin-json";
import nodeResolve from "@rollup/plugin-node-resolve";
import typescript from "@rollup/plugin-typescript";
import { builtinModules } from "node:module";

export default {
  input: "src/plugin.ts",
  output: {
    file: "com.chzzk.livestatus.sdPlugin/bin/plugin.js",
    format: "cjs",
    sourcemap: true,
  },
  external: [
    ...builtinModules,
    ...builtinModules.map((m) => `node:${m}`),
  ],
  plugins: [
    typescript({
      tsconfig: "./tsconfig.json",
    }),
    nodeResolve({
      preferBuiltins: true,
      browser: false,
    }),
    commonjs(),
    json(),
  ],
};
