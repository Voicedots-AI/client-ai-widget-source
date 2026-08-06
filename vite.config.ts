import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';
import cssInjectedByJsPlugin from 'vite-plugin-css-injected-by-js';
import postcssPrefixSelector from 'postcss-prefix-selector';
import { resolve } from 'path';

export default defineConfig({
  plugins: [
    preact(),
    cssInjectedByJsPlugin(),
  ],
  resolve: {
    alias: {
      'react': 'preact/compat',
      'react-dom': 'preact/compat',
      'react-dom/test-utils': 'preact/test-utils',
      'react/jsx-runtime': 'preact/jsx-runtime',
    },
  },
  build: {
    lib: {
      entry: resolve(__dirname, 'src/web-component/index.ts'), 
      name: 'VoiceDots',
      fileName: (format) => `voicedots-widget.${format === 'es' ? 'js' : 'umd.cjs'}`,
      formats: ['es', 'umd'], 
    },
    rollupOptions: {
      external: [],
      output: {
        globals: {
        },
      },
    },
    minify: 'terser', 
    sourcemap: false,
  },
  css: {
    postcss: {
      plugins: [
        postcssPrefixSelector({
          prefix: '.voicedots-widget-host',
          
          transform(prefix, selector) {
            if (selector.includes('.voicedots-widget-host')) {
              return selector;
            }
            // Skip global things that should NOT be prefixed
            if (
              selector.startsWith('@keyframes') ||
              selector.startsWith('html') ||
              selector.startsWith('body') ||
              selector.includes(':root') ||
              selector.includes('::selection') ||
              selector.includes('@font-face') ||
              selector.includes('vd-portal-host')
            ) {
              return selector;
            }
            return `${prefix} ${selector}`;
          },
        }),
      ],
    },
  },
});