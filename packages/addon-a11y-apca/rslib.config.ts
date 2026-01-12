import { defineConfig } from '@rslib/core';
import { pluginPublint } from 'rsbuild-plugin-publint';

export default defineConfig({
  plugins: [pluginPublint()],
  lib: [
    {
      bundle: false,
      format: 'esm',
      dts: true,
      autoExtension: false,
      source: {
        entry: {
          index: './src/index.ts',
          manager: './src/manager.tsx',
          preview: './src/preview.tsx',
          postinstall: './src/postinstall.ts',
        },
      },
      output: {
        target: 'web',
      },
    },
  ],
});
