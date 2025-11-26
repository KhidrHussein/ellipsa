import { defineConfig } from 'tsup';
import path from 'path';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  dts: {
    resolve: true,
    entry: 'src/index.ts',
  },
  sourcemap: true,
  clean: true,
  outDir: 'dist',
  target: 'es2020',
  tsconfig: './tsconfig.json',
  bundle: true,
  minify: false,
  skipNodeModulesBundle: true,
  external: ['electron'],
  esbuildOptions(options) {
    options.resolveExtensions = ['.ts', '.js', '.json'];
    options.platform = 'node';
    // Ensure proper handling of .js extensions in imports
    options.define = {
      ...options.define,
      'import.meta.url': 'import_meta_url',
    };
  },
  onSuccess: 'tsc --emitDeclarationOnly --declaration --declarationMap',
  // Ensure all files are included in the build
  noExternal: ['@ellipsa/shared', '@ellipsa/action'],
});
