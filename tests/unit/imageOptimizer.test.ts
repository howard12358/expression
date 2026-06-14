import { describe, expect, it } from 'vitest'
import {
    buildOptimizationPlan,
    formatBytes,
    OPTIMIZER_SIGNATURE,
    shouldSkipCachedEntry
} from '../../scripts/optimize-images-lib.mjs'

describe('buildOptimizationPlan', () => {
    it('skips unsupported files and files below the threshold', () => {
        expect(buildOptimizationPlan('public/posts/demo/icon.gif', 512_000)).toBeNull()
        expect(buildOptimizationPlan('public/posts/demo/photo.jpg', 128_000)).toBeNull()
    })

    it('returns png options for large png files', () => {
        expect(buildOptimizationPlan('public/posts/demo/cover.png', 900_000)).toEqual({
            format: 'png',
            inputPath: 'public/posts/demo/cover.png',
            minBytes: 512 * 1024,
            options: {
                compressionLevel: 9,
                effort: 10,
                palette: true,
                quality: 82
            }
        })
    })

    it('returns jpeg options for large jpeg files', () => {
        expect(buildOptimizationPlan('public/posts/demo/photo.jpeg', 900_000)).toEqual({
            format: 'jpeg',
            inputPath: 'public/posts/demo/photo.jpeg',
            minBytes: 512 * 1024,
            options: {
                mozjpeg: true,
                progressive: true,
                quality: 82
            }
        })
    })

    it('returns webp options for large webp files', () => {
        expect(buildOptimizationPlan('public/posts/demo/photo.webp', 900_000)).toEqual({
            format: 'webp',
            inputPath: 'public/posts/demo/photo.webp',
            minBytes: 512 * 1024,
            options: {
                effort: 6,
                quality: 80
            }
        })
    })
})

describe('formatBytes', () => {
    it('formats byte sizes for logging', () => {
        expect(formatBytes(512)).toBe('512 B')
        expect(formatBytes(2048)).toBe('2.0 KB')
        expect(formatBytes(1_572_864)).toBe('1.5 MB')
    })
})

describe('shouldSkipCachedEntry', () => {
    it('skips when hash, size and signature all match', () => {
        expect(
            shouldSkipCachedEntry(
                {
                    hash: 'abc123',
                    size: 2048,
                    signature: OPTIMIZER_SIGNATURE
                },
                'abc123',
                2048,
                OPTIMIZER_SIGNATURE
            )
        ).toBe(true)
    })

    it('does not skip when the optimizer signature changes', () => {
        expect(
            shouldSkipCachedEntry(
                {
                    hash: 'abc123',
                    size: 2048,
                    signature: 'old-signature'
                },
                'abc123',
                2048,
                OPTIMIZER_SIGNATURE
            )
        ).toBe(false)
    })
})
