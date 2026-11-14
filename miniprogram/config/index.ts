import { defineConfig } from '@tarojs/cli'

export default defineConfig({
  projectName: 'zhoumoju',
  date: '2026-11-14',
  designWidth: 750,
  deviceRatio: {640: 2.34, 750: 1, 828: 1.81},
  sourceRoot: 'src',
  outputRoot: 'dist',
  framework: 'react',
  compiler: 'webpack5',
  plugins: ['@tarojs/plugin-framework-react', '@tarojs/plugin-platform-weapp'],
  mini: {postcss: {pxtransform: {enable: true, config: {}}}},
  h5: {}
})
