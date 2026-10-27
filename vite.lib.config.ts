import { defineConfig } from 'vite';
import { readFileSync } from 'node:fs';

const license = readFileSync(new URL('./LICENSE', import.meta.url), 'utf8');
const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));
const licenseBanner = `/*! Intertext ${version}\n${license.trim()}\n*/`;

export default defineConfig(({ mode }) => ({
  esbuild: { legalComments: 'inline' },
  plugins: [{
    name: 'preserve-react-client-boundary',
    enforce: 'pre',
    transform(code, id) {
      // Rollup drops module directives; restore it only on the React entry below.
      if (id.endsWith('/src/lib/react.tsx')) return { code: code.replace(/^'use client';\n/, ''), map: null };
    }
  }],
  build: {
    outDir: 'dist/lib', copyPublicDir: false, emptyOutDir: mode !== 'react',
    // Separate builds guarantee the browser module is a self-contained file.
    // The React adapter imports that same module instead of embedding a second runtime.
    lib: {
      entry: mode === 'react' ? 'src/lib/react.tsx' : 'src/lib/artifact-pill.ts',
      formats: ['es'],
      fileName: () => mode === 'react' ? 'react.js' : 'artifact-pill.js',
    },
    rollupOptions: {
      external: mode === 'react' ? ['react', 'react-dom', 'react/jsx-runtime', './artifact-pill.js'] : [],
      onwarn(warning, warn) { if (warning.code !== 'MODULE_LEVEL_DIRECTIVE') warn(warning); },
      output: {
        inlineDynamicImports: true,
        banner: mode === 'react' ? `'use client';\n${licenseBanner}` : licenseBanner,
      }
    }
  }
}));
