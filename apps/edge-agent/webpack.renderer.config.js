const path = require('path');
const webpack = require('webpack');
const TsconfigPathsPlugin = require('tsconfig-paths-webpack-plugin');

module.exports = {
  mode: 'development',
  target: 'web',
  devtool: 'source-map',
  entry: './src/renderer/index.ts',
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: 'renderer.js',
    library: 'EllipsaRenderer',
    libraryTarget: 'window',
    globalObject: 'this',
  },
  externals: {
    electron: 'commonjs electron',
  },
  resolve: {
    extensions: ['.tsx', '.ts', '.js', '.json'],
    plugins: [
      new TsconfigPathsPlugin({
        configFile: './tsconfig.renderer.json',
        extensions: ['.ts', '.tsx', '.js'],
      }),
    ],
    alias: {
      '@': path.resolve(__dirname, 'src'),
      '@ellipsa/shared': path.resolve(__dirname, '../../packages/shared/src'),
      '@ellipsa/action': path.resolve(__dirname, '../../packages/action/src'),
      '@ellipsa/prompt': path.resolve(__dirname, '../../packages/prompt/src'),
    },
    fallback: {
      path: require.resolve('path-browserify'),
      os: require.resolve('os-browserify/browser'),
      crypto: require.resolve('crypto-browserify'),
      stream: require.resolve('stream-browserify'),
      buffer: require.resolve('buffer/'),
      events: require.resolve('events/'),
      fs: false,
      net: false,
      tls: false,
      child_process: false,
    },
  },
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        use: [
          {
            loader: 'ts-loader',
            options: {
              configFile: 'tsconfig.renderer.json',
              transpileOnly: true,
            },
          },
        ],
        exclude: /node_modules/,
      },
      {
        test: /\.css$/,
        use: ['style-loader', 'css-loader'],
      },
      {
        test: /\.(png|jpe?g|gif|svg)$/i,
        type: 'asset/resource',
      },
    ],
  },
  plugins: [
    new webpack.ProvidePlugin({
      process: 'process/browser',
      Buffer: ['buffer', 'Buffer'],
    }),
    new webpack.DefinePlugin({
      'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV || 'development'),
      'process.type': '"renderer"',
    }),
  ],
};
