const path = require('path');
const webpack = require('webpack');
const TsconfigPathsPlugin = require('tsconfig-paths-webpack-plugin');

module.exports = {
  mode: 'development',
  target: 'electron-preload',
  devtool: 'source-map',
  entry: './src/preload/index.ts',
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: 'preload.js',
  },
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        use: [
          {
            loader: 'ts-loader',
            options: {
              configFile: 'tsconfig.json',
              transpileOnly: true,
            },
          },
        ],
        exclude: /node_modules/,
      },
    ],
  },
  resolve: {
    extensions: ['.tsx', '.ts', '.js', '.json'],
    plugins: [
      new TsconfigPathsPlugin({
        configFile: './tsconfig.json',
      }),
    ],
  },
  externals: {
    electron: 'commonjs2 electron',
  },
  plugins: [
    new webpack.ExternalsPlugin('commonjs', [
      'electron'
    ]),
  ],
};
