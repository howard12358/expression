import { promises as fs } from 'node:fs'
import path from 'node:path'
import { globby } from 'globby'
import sharp from 'sharp'
import { buildOptimizationPlan, formatBytes, summarizeSavings } from './optimize-images-lib.mjs'

const DRY_RUN = process.argv.includes('--dry-run')
const ROOT_ARG_INDEX = process.argv.indexOf('--root')
const ROOT_DIR = ROOT_ARG_INDEX >= 0 ? process.argv[ROOT_ARG_INDEX + 1] : '.vitepress/dist/posts'
const IMAGE_GLOB = `${ROOT_DIR}/**/*.{png,jpg,jpeg,webp}`

async function optimizeImage(plan) {
    const originalBuffer = await fs.readFile(plan.inputPath)
    const optimizedBuffer = await sharp(originalBuffer)[plan.format](plan.options).toBuffer()

    if (optimizedBuffer.length >= originalBuffer.length) {
        return {
            changed: false,
            inputPath: plan.inputPath,
            beforeBytes: originalBuffer.length,
            afterBytes: optimizedBuffer.length
        }
    }

    if (!DRY_RUN) {
        await fs.writeFile(plan.inputPath, optimizedBuffer)
    }

    return {
        changed: true,
        inputPath: plan.inputPath,
        beforeBytes: originalBuffer.length,
        afterBytes: optimizedBuffer.length
    }
}

async function main() {
    const files = await globby(IMAGE_GLOB)
    const planned = []

    for (const inputPath of files) {
        const stats = await fs.stat(inputPath)
        const plan = buildOptimizationPlan(inputPath, stats.size)
        if (plan) {
            planned.push(plan)
        }
    }

    if (planned.length === 0) {
        console.log('No images require optimization.')
        return
    }

    console.log(`${DRY_RUN ? 'Dry run:' : 'Optimizing:'} ${planned.length} image(s) from ${IMAGE_GLOB}`)

    let optimizedCount = 0
    let totalBefore = 0
    let totalAfter = 0

    for (const plan of planned) {
        const result = await optimizeImage(plan)
        totalBefore += result.beforeBytes
        totalAfter += result.changed ? result.afterBytes : result.beforeBytes

        if (!result.changed) {
            console.log(`skip  ${path.relative(process.cwd(), result.inputPath)} (${formatBytes(result.beforeBytes)})`)
            continue
        }

        optimizedCount += 1
        const { savedBytes, savedPercent } = summarizeSavings(result.beforeBytes, result.afterBytes)
        console.log(
            `${DRY_RUN ? 'would' : 'done '} ${path.relative(process.cwd(), result.inputPath)} ` +
                `${formatBytes(result.beforeBytes)} -> ${formatBytes(result.afterBytes)} ` +
                `(-${formatBytes(savedBytes)}, ${savedPercent.toFixed(1)}%)`
        )
    }

    const { savedBytes, savedPercent } = summarizeSavings(totalBefore, totalAfter)
    console.log(
        `${DRY_RUN ? 'Preview' : 'Summary'}: optimized ${optimizedCount}/${planned.length} image(s), ` +
            `saved ${formatBytes(savedBytes)} (${savedPercent.toFixed(1)}%)`
    )
}

main().catch((error) => {
    console.error(error)
    process.exitCode = 1
})
