# Repository Guidelines

## Project Structure & Module Organization
This repository is a VitePress site. Content lives in `posts/` by year (`posts/2024/`, `posts/2025/`) plus staging folders such as `posts/draft/`, `posts/private-notes/`, and `posts/trash/`. Static pages like `about` and `tags` are in `pages/`. Site configuration is in `.vitepress/config.ts`, and theme overrides, Vue components, and helper utilities are under `.vitepress/theme/`. Public assets belong in `public/`, for example `public/img/` and `public/doro-chronicles/`.

## Build, Test, and Development Commands
Use `pnpm` because `pnpm-lock.yaml` is committed.

- `pnpm dev` starts the local VitePress server on `0.0.0.0:5000`.
- `pnpm build` generates `.vitepress/dist`, then runs `postbuild` image compression on `.vitepress/dist/posts` only.
- `pnpm preview` serves the built output for a production-like check.
- `pnpm test:unit` runs Vitest unit coverage for theme utilities.
- `pnpm test:e2e` runs Playwright smoke tests against a local preview server.
- `pnpm test` runs the unit and E2E suites in sequence.
- `pnpm images:optimize:dry` previews image savings from `public/posts` without modifying source files.
- `pnpm exec eslint .` runs ESLint manually; there is no dedicated `lint` script yet.
- `pnpm exec prettier --check .` verifies formatting before review.

## Coding Style & Naming Conventions
Prettier defines the baseline style: no semicolons, single quotes, `printWidth: 120`, and no trailing commas. Follow the existing 4-space indentation used in `.vitepress/*.ts` and theme files. Use PascalCase for Vue components in `.vitepress/theme/components/` such as `NewLayout.vue`, and keep utility files camelCase, such as `serverUtils.ts`. For Markdown posts, prefer descriptive kebab-case filenames like `java-vs-go-concurrency-in-practice.md`.

## Testing Guidelines
Automated coverage now uses Vitest for unit tests in `tests/unit/` and Playwright smoke tests in `tests/e2e/`. Run `pnpm test` before review, or use `pnpm test:unit` / `pnpm test:e2e` when working on one layer only. Keep unit tests focused on pure logic such as pagination and post metadata normalization; use E2E only for critical route checks and navigation smoke coverage.

## Commit & Pull Request Guidelines
Recent history uses short Conventional Commit prefixes, mostly `feat:` (`feat: 更新文章`, `feat: 更新icon`). Keep that format for new work; use concise, scoped summaries. PRs should include: a brief description, any affected routes or content paths, linked issues when applicable, and screenshots for visible theme or content presentation changes. Note any excluded content in `draft`, `trash`, or `private-notes` when it affects review.

## Content & Publishing Notes
Production builds exclude `posts/trash/**`, `posts/draft/**`, `posts/private-notes/*.md`, `docs/superpowers/plans/**/*.md`, and `README.md`. Draft, private, trash, and plan content can still appear during local development, so do not rely on that behavior in deployment. Posts with `hidden: true` in frontmatter are excluded from article listings in both development and production. Keep publishable assets in `public/`, but treat `public/posts` as source originals: build-time compression targets only `.vitepress/dist/posts`, not the source images.
