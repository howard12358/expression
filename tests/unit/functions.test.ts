import { describe, expect, it } from 'vitest'
import { getCategoryLabel, initCategory } from '../../.vitepress/theme/functions'

describe('getCategoryLabel', () => {
    it('maps the essay category to a clearer label', () => {
        expect(getCategoryLabel('一个猜想')).toBe('随笔')
        expect(getCategoryLabel('技术')).toBe('技术')
    })

    it('falls back to the original category when no mapping exists', () => {
        expect(getCategoryLabel('阅读')).toBe('阅读')
    })
})

describe('initCategory', () => {
    it('keeps the preferred category order when building category groups', () => {
        const grouped = initCategory([
            {
                regularPath: '/posts/essay.html',
                frontMatter: {
                    date: '2025-01-02',
                    title: 'Essay',
                    category: '一个猜想',
                    tags: [],
                    description: 'Essay post'
                }
            },
            {
                regularPath: '/posts/tech.html',
                frontMatter: {
                    date: '2025-01-03',
                    title: 'Tech',
                    category: '技术',
                    tags: [],
                    description: 'Tech post'
                }
            }
        ])

        expect(Object.keys(grouped)).toEqual(['技术', '一个猜想'])
    })
})
