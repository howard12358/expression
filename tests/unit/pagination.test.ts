import { describe, expect, it } from 'vitest'
import { generatePaginationArray } from '../../.vitepress/theme/pagination'

describe('generatePaginationArray', () => {
    it('returns all pages when the page count is small', () => {
        expect(generatePaginationArray(5, 3)).toEqual([1, 2, 3, 4, 5])
    })

    it('keeps the current page window near the start', () => {
        expect(generatePaginationArray(10, 2)).toEqual([1, 2, 3, 4, '...', 10])
    })

    it('adds ellipses around a middle current page', () => {
        expect(generatePaginationArray(10, 5)).toEqual([1, 2, '...', 4, 5, 6, '...', 9, 10])
    })

    it('keeps the trailing pages visible near the end', () => {
        expect(generatePaginationArray(10, 9)).toEqual([1, '...', 7, 8, 9, 10])
    })
})
