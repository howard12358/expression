import { describe, expect, it } from 'vitest'
import { resolveMermaidThemeTokens } from '../../.vitepress/theme/mermaidTheme'

describe('resolveMermaidThemeTokens', () => {
    it('replaces theme tokens with light palette values', () => {
        expect(resolveMermaidThemeTokens('rect MERMAID_RECT_BG', false)).toBe('rect rgb(236, 242, 255)')
    })

    it('replaces theme tokens with dark palette values', () => {
        expect(resolveMermaidThemeTokens('rect MERMAID_RECT_BG', true)).toBe('rect rgb(35, 38, 54)')
    })
})
