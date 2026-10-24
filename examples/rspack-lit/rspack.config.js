const { HtmlRspackPlugin } = require('@rspack/core')

module.exports = {
  entry: './src/main.ts',
  output: {
    filename: 'bundle.[contenthash].js',
    clean: true,
  },
  module: {
    rules: [
      {
        test: /\.ts$/,
        loader: 'builtin:swc-loader',
        options: {
          jsc: {
            parser: { syntax: 'typescript', decorators: true },
            transform: { legacyDecorator: true, useDefineForClassFields: false },
            target: 'es2020',
          },
        },
        type: 'javascript/auto',
      },
    ],
  },
  resolve: {
    extensions: ['.ts', '.js'],
  },
  plugins: [new HtmlRspackPlugin({ template: './index.html' })],
  devServer: {
    port: 5186,
    host: '0.0.0.0',
    allowedHosts: 'all',
    hot: true,
  },
}
