import { test, expect } from '@playwright/test'

test('home page loads', async ({ page }) => {
    await page.goto('/')

    await expect(page.getByRole('link', { name: '首页' })).toBeVisible()
    await expect(page.locator('.post-list').first()).toBeVisible()
})

test('pagination navigates to another page when available', async ({ page }) => {
    await page.goto('/')

    const nextPageLink = page.getByRole('link', { name: '下一页' })
    await expect(nextPageLink).toBeVisible()
    await nextPageLink.click()

    await expect(page).toHaveURL(/\/page_2$/)
})

test('article page renders its title', async ({ page }) => {
    await page.goto('/posts/2020/helloworld.html')

    await expect(page.getByRole('heading', { name: 'Hello World' })).toBeVisible()
})
