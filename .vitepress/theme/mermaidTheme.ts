const MERMAID_THEME_TOKENS = {
    MERMAID_RECT_BG: {
        light: 'rgb(236, 242, 255)',
        dark: 'rgb(35, 38, 54)'
    }
} as const

export function resolveMermaidThemeTokens(source: string, isDark: boolean) {
    return Object.entries(MERMAID_THEME_TOKENS).reduce((result, [token, palette]) => {
        return result.replaceAll(token, isDark ? palette.dark : palette.light)
    }, source)
}
