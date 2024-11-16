import {defineConfig} from 'vitepress'
import {getPosts} from './theme/serverUtils'

//每页的文章数量
const pageSize = 10

export default defineConfig({
  title: '衣戈猜想',
  base: '/',
  cacheDir: './node_modules/vitepress_cache',
  description: 'vitepress,blog,thoughts',
  ignoreDeadLinks: true,
  themeConfig: {
    posts: await getPosts(pageSize),
    website: 'https://github.com/weedsx', //copyright link
    // 评论的仓库地址
    comment: {
      repo: 'weedsx/expression',
      themes: 'github-light',
      issueTerm: 'pathname'
    },
    nav: [
      {text: '首页', link: '/'},
      {text: '分类', link: '/pages/category'},
      {text: '时间线', link: '/pages/archives'},
      {text: '标签', link: '/pages/tags'},
      {text: '关于', link: '/pages/about'}
      // { text: 'Airene', link: 'http://airene.net' }  -- External link test
    ],
    search: {
      provider: 'local',
    },
    //outline:[2,3],
    outline: {
      label: '目录',

    },
    socialLinks: [{icon: 'github', link: 'https://github.com/weedsx/expression'}]
  } as any,
  srcExclude: ['README.md'], // exclude the README.md , needn't to compiler

  vite: {
    //build: { minify: false }
    server: {port: 5000}
  },
  cleanUrls: true
  /*
    optimizeDeps: {
        keepNames: true
    }
    */
})
