import { defineConfig } from '@rslib/core';

export default defineConfig({
  lib: [
    {
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
