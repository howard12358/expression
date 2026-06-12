<template>
    <div v-for="(article, index) in posts" :key="index" class="post-list">
        <div class="post-header">
            <div class="post-title">
                {{ article.frontMatter.order > 0 ? '📌' : '' }}
                <a :href="withBase(article.regularPath)"> {{ article.frontMatter.title }}</a>
            </div>
        </div>
        <p class="describe" v-html="article.frontMatter.description"></p>
        <div class="post-info">
            {{ article.frontMatter.date }}
            <span v-for="item in article.frontMatter.tags"
                ><a :href="withBase(`/pages/tags.html?tag=${item}`)"> {{ item }}</a></span
            >
        </div>
    </div>

    <div class="pagination" v-if="pagesNum > 1">
        <a
            v-if="pageCurrent > 1"
            class="pager pager-nav"
            :href="withBase(pageCurrent - 1 === 1 ? '/index.html' : `/page_${pageCurrent - 1}.html`)"
        >
            上一页
        </a>
        <span v-else class="pager pager-nav is-disabled">上一页</span>

        <div class="pager-numbers">
            <template v-for="(item, index) in pageArray" :key="index">
                <span v-if="item === '...'" class="pager pager-number pager-ellipsis">...</span>
                <span v-else-if="item === pageCurrent" class="pager pager-number active">
                    {{ item }}
                </span>
                <a
                    v-else
                    class="pager pager-number"
                    :href="withBase(item === 1 ? '/index.html' : `/page_${item}.html`)"
                >
                    {{ item }}
                </a>
            </template>
        </div>

        <a
            v-if="pageCurrent < pagesNum"
            class="pager pager-nav"
            :href="withBase(pageCurrent + 1 === 1 ? '/index.html' : `/page_${pageCurrent + 1}.html`)"
        >
            下一页
        </a>
        <span v-else class="pager pager-nav is-disabled">下一页</span>
    </div>
</template>

<script lang="ts" setup>
import { withBase } from 'vitepress'
import { PropType, computed } from 'vue'
import { generatePaginationArray } from '../pagination'

interface Article {
    regularPath: string
    frontMatter: {
        order: number
        title: string
        description: string
        date: string
        tags: string[]
    }
}

const props = defineProps({
    posts: {
        type: Array as PropType<Article[]>,
        required: true
    },
    pageCurrent: {
        type: Number as PropType<number>,
        required: true
    },
    pagesNum: {
        type: Number as PropType<number>,
        required: true
    }
})

const pageArray = computed(() => {
    return generatePaginationArray(props.pagesNum, props.pageCurrent)
})
</script>

<style scoped>
.post-list {
    border-bottom: 1px dashed var(--vp-c-divider);
    padding: 14px 0 14px 0;
}

.post-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
}

.post-title {
    font-size: 1.0625rem;
    font-weight: 500;
    color: var(--bt-theme-title) !important;
    margin: 0.1rem 0;
}

.post-title a {
    color: var(--bt-theme-title) !important;
}

.describe {
    font-size: 0.9375rem;
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 3;
    overflow: hidden;
    color: var(--vp-c-text-2);
    margin: 10px 0;
    line-height: 1.5rem;
}

.pagination {
    margin-top: 28px;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 12px;
    flex-wrap: wrap;
}

.pager {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 36px;
    height: 36px;
    padding: 0 12px;
    border-radius: 999px;
    font-size: 0.875rem;
    line-height: 1;
    transition:
        background-color 0.2s ease,
        border-color 0.2s ease,
        color 0.2s ease;
}

.pager-numbers {
    display: flex;
    align-items: center;
    gap: 8px;
}

.pager-number {
    border: 1px solid transparent;
    color: var(--vp-c-text-2);
    text-decoration: none;
}

.pager-number:not(.active):not(.pager-ellipsis):hover {
    background: var(--vp-c-bg-soft);
    border-color: var(--vp-c-divider);
    color: var(--vp-c-text-1);
}

.pager-nav {
    border: 1px solid var(--vp-c-divider);
    color: var(--vp-c-text-2);
    background: var(--vp-c-bg);
}

.pager-nav:hover {
    border-color: var(--vp-c-brand);
    color: var(--vp-c-brand);
}

.pager-ellipsis {
    min-width: 24px;
    padding: 0 4px;
    color: var(--vp-c-text-3);
}

.pager.active {
    background: color-mix(in srgb, var(--vp-c-brand) 10%, transparent);
    border: 1px solid color-mix(in srgb, var(--vp-c-brand) 28%, var(--vp-c-divider));
    color: var(--vp-c-brand);
    font-weight: 500;
}

.is-disabled {
    border: 1px solid var(--vp-c-divider);
    color: var(--vp-c-text-3);
    background: var(--vp-c-bg-soft);
    cursor: default;
}

@media screen and (max-width: 768px) {
    .post-list {
        padding: 14px 0 14px 0;
    }

    .post-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
    }

    .post-title {
        font-size: 1.0625rem;
        font-weight: 400;
        display: -webkit-box;
        -webkit-box-orient: vertical;
        -webkit-line-clamp: 2;
        overflow: hidden;
        width: 17rem;
    }

    .describe {
        font-size: 0.9375rem;
        display: -webkit-box;
        -webkit-box-orient: vertical;
        -webkit-line-clamp: 3;
        overflow: hidden;
        margin: 0.5rem 0 1rem;
    }

    .pagination {
        gap: 8px;
    }

    .pager {
        min-width: 32px;
        height: 32px;
        padding: 0 10px;
        font-size: 0.8125rem;
    }

    .pager-numbers {
        gap: 4px;
    }
}
</style>
