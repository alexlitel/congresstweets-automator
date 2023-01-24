const path = require('path')
const externalmodules = require('webpack-node-externals')

module.exports = {
  entry: './cli/cli.js',
  target: 'node',
  mode: 'development',
  optimization: {
    minimize: false
  },
  devtool: false,
  externals: [externalmodules()],
  module: {
    rules: [
      {
        test: /\.js$/,
        exclude: /node_modules/,
        use: [
          {
            loader: 'babel-loader',
            options: {
              presets: [['@babel/env']]
            }
          }
        ]
      }
    ]
  },
  output: {
    libraryTarget: 'commonjs2',
    path: path.join(__dirname, '/build'),
    filename: 'cli.js',
    sourceMapFilename: '[file].map'
  }
}
