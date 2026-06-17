import { globby } from 'globby'
import matter from 'gray-matter'
import fs from 'fs-extra'
import { resolve } from 'path'

async function getPosts(pageSize: number) {
    const isProd = process.env.NODE_ENV === 'production'
    const ignorePaths = getIgnorePaths(isProd)

    let paths = await globby(['posts/**/**.md'], {
        ignore: ignorePaths
    })

    let posts = (
        await Promise.all(
        paths.map(async (item) => {
            const content = await fs.readFile(item, 'utf-8')
            const { data } = matter(content)
            return {
                frontMatter: normalizeFrontMatter(data),
                regularPath: `/${item.replace('.md', '.html')}`
            }
        })
        )
    ).filter((post) => shouldIncludePost(post.frontMatter))

    // 这里只是生成分页时才用到
    await generatePaginationPages(posts.length, pageSize)

    posts.sort(_compareDate as any)
    return posts
}

async function generatePaginationPages(total: number, pageSize: number) {
    //  pagesNum
    let pagesNum = total % pageSize === 0 ? total / pageSize : Math.floor(total / pageSize) + 1
    const paths = resolve('./')

    if (total > 0) {
        for (let i = 1; i < pagesNum + 1; i++) {
            const page = `
---
layout: page
title: ${i === 1 ? '首页' : '第 ' + i + ' 页'}
aside: false
comment: false
---
<script setup>
import Page from "./.vitepress/theme/components/Page.vue";
import { useData } from "vitepress";
const { theme } = useData();
const posts = theme.value.posts.slice(${pageSize * (i - 1)},${pageSize * i})
</script>
<Page :posts="posts" :pageCurrent="${i}" :pagesNum="${pagesNum}" />
`.trim()

            const file = paths + `/page_${i}.md`
            await fs.writeFile(file, page)
        }
    }
    // rename page_1 to index for homepage
    await fs.move(paths + '/page_1.md', paths + '/index.md', { overwrite: true })
}

function _convertDate(date = new Date().toString()) {
    const parsedDate = new Date(date)
    const json_date = Number.isNaN(parsedDate.getTime()) ? new Date().toJSON() : parsedDate.toJSON()
    return json_date.split('T')[0]
}

function _compareDate(
    obj1: { frontMatter: { date: number; order: number } },
    obj2: { frontMatter: { date: number; order: number } }
) {
    const orderCompare = obj2.frontMatter.order - obj1.frontMatter.order
    if (orderCompare !== 0) return orderCompare
    return obj1.frontMatter.date < obj2.frontMatter.date ? 1 : -1
}

function _convertOrder(input?: unknown): number {
    if (input === undefined || input === null) return 0
    if (typeof input === 'number') return input
    const num = Number(input)
    return isNaN(num) ? 0 : num
}

function getIgnorePaths(isProd: boolean) {
    return isProd ? ['posts/draft/**/*.md', 'posts/private-notes/**/*.md', 'posts/trash/**/*.md'] : []
}

function shouldIncludePost(frontMatter: Record<string, any>) {
    return frontMatter.hidden !== true
}

function normalizeFrontMatter(data: Record<string, any>) {
    return {
        ...data,
        date: _convertDate(data.date),
        order: _convertOrder(data.order)
    }
}

export { getIgnorePaths, getPosts, normalizeFrontMatter, shouldIncludePost }
