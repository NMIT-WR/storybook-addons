import { defineConfig } from '@rslib/core';
import { pluginPublint } from 'rsbuild-plugin-publint';

export default defineConfig({
  plugins: [pluginPublint()],
  lib: [
    {
      format: 'esm',
      dts: true,
      autoExtension: false,
      source: {
        entry: {
          index: './src/index.ts'
        },
      },
      output: {
        target: 'node'
      }
    },
    {
      format: 'esm',
      dts: false,
      autoExtension: false,
      source: {
        entry: {
          cli: './src/cli.ts'
        },
      },
      banner: {
        js: '#!/usr/bin/env node',
      },
      output: {
        target: 'node'
      }
    },
  ]
});
