import { defineConfig } from '@rslib/core';
import { pluginPublint } from 'rsbuild-plugin-publint';

export default defineConfig({
  plugins: [pluginPublint()],
  source: {
    entry: {
      index: './src/**/*.{ts,tsx}',
    },
  },
  lib: [
    {
      bundle: false,
      format: 'esm',
      dts: true,
      autoExtension: false,
    },
  ],
  output: {
    target: 'web',
  },
});
