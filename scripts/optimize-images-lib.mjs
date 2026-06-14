const MIN_OPTIMIZE_BYTES = 512 * 1024

const OPTIMIZER_CONFIG = {
    '.png': {
        format: 'png',
        options: {
            compressionLevel: 9,
            effort: 10,
            palette: true,
            quality: 82
        }
    },
    '.jpg': {
        format: 'jpeg',
        options: {
            mozjpeg: true,
            progressive: true,
            quality: 82
        }
    },
    '.jpeg': {
        format: 'jpeg',
        options: {
            mozjpeg: true,
            progressive: true,
            quality: 82
        }
    },
    '.webp': {
        format: 'webp',
        options: {
            effort: 6,
            quality: 80
        }
    }
}

const OPTIMIZER_SIGNATURE = JSON.stringify(OPTIMIZER_CONFIG)

export function buildOptimizationPlan(inputPath, size, minBytes = MIN_OPTIMIZE_BYTES) {
    const extension = inputPath.slice(inputPath.lastIndexOf('.')).toLowerCase()
    const config = OPTIMIZER_CONFIG[extension]

    if (!config || size < minBytes) {
        return null
    }

    return {
        inputPath,
        format: config.format,
        minBytes,
        options: config.options
    }
}

export function formatBytes(bytes) {
    if (bytes < 1024) {
        return `${bytes} B`
    }

    if (bytes < 1024 * 1024) {
        return `${(bytes / 1024).toFixed(1)} KB`
    }

    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function summarizeSavings(beforeBytes, afterBytes) {
    const savedBytes = beforeBytes - afterBytes
    const savedPercent = beforeBytes === 0 ? 0 : (savedBytes / beforeBytes) * 100

    return {
        savedBytes,
        savedPercent
    }
}

export function shouldSkipCachedEntry(cachedEntry, hash, size, signature = OPTIMIZER_SIGNATURE) {
    return Boolean(
        cachedEntry && cachedEntry.hash === hash && cachedEntry.size === size && cachedEntry.signature === signature
    )
}

export { MIN_OPTIMIZE_BYTES, OPTIMIZER_SIGNATURE }
