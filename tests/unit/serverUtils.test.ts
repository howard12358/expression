import { describe, expect, it, vi, afterEach } from 'vitest'
import { getIgnorePaths, normalizeFrontMatter } from '../../.vitepress/theme/serverUtils'

describe('normalizeFrontMatter', () => {
    afterEach(() => {
        vi.useRealTimers()
    })

    it('falls back to the mocked current day when date is invalid', () => {
        vi.useFakeTimers()
        vi.setSystemTime(new Date('2026-06-12T08:00:00.000Z'))

        expect(
            normalizeFrontMatter({
                date: 'not-a-date',
                order: 'oops',
                title: 'Sample'
            })
        ).toMatchObject({
            date: '2026-06-12',
            order: 0,
            title: 'Sample'
        })
    })

    it('preserves valid values and coerces numeric order strings', () => {
        expect(
            normalizeFrontMatter({
                date: '2025-05-01',
                order: '3'
            })
        ).toMatchObject({
            date: '2025-05-01',
            order: 3
        })
    })
})

describe('getIgnorePaths', () => {
    it('returns draft and private filters for production builds', () => {
        expect(getIgnorePaths(true)).toEqual([
            'posts/draft/**/*.md',
            'posts/private-notes/**/*.md',
            'posts/trash/**/*.md'
        ])
    })

    it('returns no ignored paths for local development', () => {
        expect(getIgnorePaths(false)).toEqual([])
    })
})
