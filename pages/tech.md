---
layout: page
title: 技术
description: Tech
aside: false
comment: false
---
<script setup>
import Archives from '../.vitepress/theme/components/Archives.vue'
import { useData } from 'vitepress'

const { theme } = useData()
const posts = theme.value.posts.filter((post) => post.frontMatter.category === '技术')
</script>

<Archives :posts="posts" />
