import { nodeResolve } from '@rollup/plugin-node-resolve'
import { babel } from '@rollup/plugin-babel'
import replace from '@rollup/plugin-replace'
import serve from 'rollup-plugin-serve'
import copy from 'rollup-plugin-copy'

const isWatch = !!process.env.ROLLUP_WATCH

export default {
  input: 'src/main.tsx',
  output: {
    dir: 'dist',
    format: 'es',
    entryFileNames: 'bundle.js',
    sourcemap: isWatch,
  },
  plugins: [
    replace({
      'process.env.NODE_ENV': JSON.stringify(isWatch ? 'development' : 'production'),
      preventAssignment: true,
    }),
    nodeResolve({ extensions: ['.tsx', '.ts', '.js', '.jsx'] }),
    babel({
      babelHelpers: 'bundled',
      extensions: ['.tsx', '.ts', '.jsx', '.js'],
      presets: ['@babel/preset-typescript', 'babel-preset-solid'],
    }),
    copy({
      targets: [{ src: 'index.html', dest: 'dist' }],
      hook: 'writeBundle',
      overwrite: true,
    }),
    isWatch &&
      serve({
        port: parseInt(process.env.CAPSULE_INTERNAL_PORT ?? '5186', 10),
        host: '0.0.0.0',
        contentBase: 'dist',
      }),
  ].filter(Boolean),
}
