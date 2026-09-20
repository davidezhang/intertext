import { defineConfig } from 'vite';
export default defineConfig({
  plugins: [{
    name: 'preserve-react-client-boundary',
    enforce: 'pre',
    transform(code, id) {
      // Rollup drops module directives; restore it only on the React entry below.
      if (id.endsWith('/src/lib/react.tsx')) return { code: code.replace(/^'use client';\n/, ''), map: null };
    }
  }],
  build: {
    outDir: 'dist/lib', copyPublicDir: false,
    lib: { entry: { 'artifact-pill': 'src/lib/artifact-pill.ts', react: 'src/lib/react.tsx' }, formats: ['es'] },
    rollupOptions: {
      external: ['react', 'react-dom', 'react/jsx-runtime'],
      onwarn(warning, warn) { if (warning.code !== 'MODULE_LEVEL_DIRECTIVE') warn(warning); },
      output: { entryFileNames: '[name].js', banner: chunk => chunk.name === 'react' ? "'use client';" : '' }
    }
  }
});
