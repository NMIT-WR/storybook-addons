import { defineConfig } from '@rslib/core';
import { pluginPublint } from 'rsbuild-plugin-publint';

export default defineConfig({
  plugins: [pluginPublint()],
  lib: [
    {
      format: 'esm',
      dts: true,
      autoExtension: false,
      autoExternal: {
        devDependencies: true,
      },
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
        externals: ['react', 'react-dom', 'react/jsx-runtime', 'react/jsx-dev-runtime'],
      },
    },
  ],
});
