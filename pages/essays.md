---
page: true
pageClass: listing-page
title: 随笔
description: Essays
aside: false
comment: false
---
<script setup>
import Archives from '../.vitepress/theme/components/Archives.vue'
import { useData } from 'vitepress'

const { theme } = useData()
const posts = theme.value.posts.filter((post) => post.frontMatter.category === '一个猜想')
</script>

<Archives :posts="posts" />
