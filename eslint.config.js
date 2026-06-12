import js from '@eslint/js'
import tsParser from '@typescript-eslint/parser'
import tsPlugin from '@typescript-eslint/eslint-plugin'
import vueParser from 'vue-eslint-parser'
import vuePlugin from 'eslint-plugin-vue'
import prettierPlugin from 'eslint-plugin-prettier'
import eslintConfigPrettier from 'eslint-config-prettier'

export default [
    {
        ignores: ['.vitepress/dist/**', 'node_modules/**']
    },
    js.configs.recommended,
    ...vuePlugin.configs['flat/recommended'],
    {
        files: ['**/*.{js,mjs,cjs,ts,tsx,vue}'],
        languageOptions: {
            parser: vueParser,
            parserOptions: {
                parser: tsParser,
                ecmaVersion: 2021,
                sourceType: 'module',
                ecmaFeatures: {
                    jsx: true
                }
            },
            globals: {
                window: 'readonly',
                document: 'readonly',
                console: 'readonly',
                location: 'readonly',
                process: 'readonly',
                URLSearchParams: 'readonly'
            }
        },
        plugins: {
            '@typescript-eslint': tsPlugin,
            prettier: prettierPlugin
        },
        rules: {
            'array-bracket-newline': ['error', 'consistent'],
            'vue/attributes-order': 'off',
            'vue/component-definition-name-casing': 'off',
            'vue/multi-word-component-names': 'off',
            'vue/no-v-html': 'off',
            'vue/require-v-for-key': 'off',
            'prettier/prettier': 'error'
        }
    },
    eslintConfigPrettier
]
