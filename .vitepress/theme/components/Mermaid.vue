<template>
    <div class="mermaid-wrap">
        <ClientOnly>
            <template v-if="inlineSvg">
                <div class="mermaid-toolbar" aria-label="Mermaid 图控制">
                    <button type="button" class="mermaid-tool" aria-label="放大 Mermaid 图" @click="zoomIn">
                        <svg viewBox="0 0 24 24" aria-hidden="true">
                            <path d="M12 5v14M5 12h14" />
                        </svg>
                    </button>
                    <button type="button" class="mermaid-tool" aria-label="缩小 Mermaid 图" @click="zoomOut">
                        <svg viewBox="0 0 24 24" aria-hidden="true">
                            <path d="M5 12h14" />
                        </svg>
                    </button>
                    <button type="button" class="mermaid-tool" aria-label="还原 Mermaid 图" @click="resetView">
                        <svg viewBox="0 0 24 24" aria-hidden="true">
                            <path d="M4 12a8 8 0 1 0 2.34-5.66M4 4v5h5" />
                        </svg>
                    </button>
                    <button
                        type="button"
                        class="mermaid-tool"
                        :aria-label="isLightboxOpen ? '退出全屏 Mermaid 图' : '全屏 Mermaid 图'"
                        @click="toggleLightbox"
                    >
                        <svg v-if="!isLightboxOpen" viewBox="0 0 24 24" aria-hidden="true">
                            <path d="M9 4H4v5M15 4h5v5M20 15v5h-5M4 15v5h5" />
                        </svg>
                        <svg v-else viewBox="0 0 24 24" aria-hidden="true">
                            <path d="M9 4v5H4M15 4v5h5M20 15h-5v5M4 15h5v5" />
                        </svg>
                    </button>
                </div>

                <div
                    ref="viewportRef"
                    class="mermaid-viewport"
                    :class="{ 'is-dragging': isDragging }"
                    @mousedown="handleMouseDown"
                >
                    <div ref="diagramRef" class="mermaid" v-html="inlineSvg"></div>
                </div>

                <Teleport to="body">
                    <div v-if="isLightboxOpen" class="mermaid-lightbox" @click.self="closeLightbox">
                        <div class="mermaid-lightbox-panel">
                            <div class="mermaid-toolbar mermaid-toolbar-overlay" aria-label="Mermaid 图控制">
                                <button type="button" class="mermaid-tool" aria-label="放大 Mermaid 图" @click="zoomIn">
                                    <svg viewBox="0 0 24 24" aria-hidden="true">
                                        <path d="M12 5v14M5 12h14" />
                                    </svg>
                                </button>
                                <button
                                    type="button"
                                    class="mermaid-tool"
                                    aria-label="缩小 Mermaid 图"
                                    @click="zoomOut"
                                >
                                    <svg viewBox="0 0 24 24" aria-hidden="true">
                                        <path d="M5 12h14" />
                                    </svg>
                                </button>
                                <button
                                    type="button"
                                    class="mermaid-tool"
                                    aria-label="还原 Mermaid 图"
                                    @click="resetView"
                                >
                                    <svg viewBox="0 0 24 24" aria-hidden="true">
                                        <path d="M4 12a8 8 0 1 0 2.34-5.66M4 4v5h5" />
                                    </svg>
                                </button>
                                <button
                                    type="button"
                                    class="mermaid-tool"
                                    aria-label="退出全屏 Mermaid 图"
                                    @click="closeLightbox"
                                >
                                    <svg viewBox="0 0 24 24" aria-hidden="true">
                                        <path d="M8 8l8 8M16 8l-8 8" />
                                    </svg>
                                </button>
                            </div>
                            <div
                                ref="lightboxViewportRef"
                                class="mermaid-viewport mermaid-viewport-lightbox"
                                :class="{ 'is-dragging': isDragging }"
                                @mousedown="handleMouseDown"
                            >
                                <div ref="lightboxDiagramRef" class="mermaid" v-html="lightboxSvg || inlineSvg"></div>
                            </div>
                        </div>
                    </div>
                </Teleport>
            </template>
            <pre v-else class="mermaid-fallback"><code>{{ code || src }}</code></pre>
        </ClientOnly>
    </div>
</template>

<script lang="ts">
let mermaidRenderSequence = 0

function nextRenderId() {
    mermaidRenderSequence += 1
    return `mermaid-diagram-${mermaidRenderSequence}`
}
</script>

<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useData } from 'vitepress'
import { resolveMermaidThemeTokens } from '../mermaidTheme'

const MIN_SCALE = 0.5
const MAX_SCALE = 2.5
const SCALE_STEP = 0.2

const props = defineProps<{
    code?: string
    src?: string
}>()

const { isDark } = useData()
const inlineSvg = ref('')
const lightboxSvg = ref('')
const diagramRef = ref<HTMLElement | null>(null)
const lightboxDiagramRef = ref<HTMLElement | null>(null)
const viewportRef = ref<HTMLElement | null>(null)
const lightboxViewportRef = ref<HTMLElement | null>(null)
const svgElementRefs = ref<HTMLElement[]>([])
const scale = ref(1)
const translateX = ref(0)
const translateY = ref(0)
const isDragging = ref(false)
const isLightboxOpen = ref(false)
const lastPointerX = ref(0)
const lastPointerY = ref(0)

function clampScale(value: number) {
    return Math.min(MAX_SCALE, Math.max(MIN_SCALE, value))
}

function applyTransform() {
    for (const svgElement of svgElementRefs.value) {
        svgElement.style.transformOrigin = 'center center'
        svgElement.style.transform = `translate(${translateX.value}px, ${translateY.value}px) scale(${scale.value})`
        svgElement.style.cursor = isDragging.value ? 'grabbing' : 'grab'
    }
}

function syncRenderedSvg() {
    const svgElements = [diagramRef.value?.querySelector('svg'), lightboxDiagramRef.value?.querySelector('svg')].filter(
        Boolean
    ) as HTMLElement[]

    svgElementRefs.value = svgElements

    for (const svgElement of svgElements) {
        svgElement.style.maxWidth = 'none'
        svgElement.style.height = 'auto'
        svgElement.style.userSelect = 'none'
        svgElement.style.webkitUserSelect = 'none'
        svgElement.style.pointerEvents = 'none'
        svgElement.setAttribute('draggable', 'false')
    }

    applyTransform()
}

function updateScale(nextScale: number) {
    scale.value = clampScale(nextScale)
    applyTransform()
}

function zoomIn() {
    updateScale(scale.value + SCALE_STEP)
}

function zoomOut() {
    updateScale(scale.value - SCALE_STEP)
}

function resetView() {
    scale.value = 1
    translateX.value = 0
    translateY.value = 0
    isDragging.value = false
    applyTransform()
}

function handleMouseDown(event: MouseEvent) {
    if (!svgElementRefs.value.length || event.button !== 0) {
        return
    }

    isDragging.value = true
    lastPointerX.value = event.clientX
    lastPointerY.value = event.clientY
    event.preventDefault()
    applyTransform()
}

function handleMouseMove(event: MouseEvent) {
    if (!isDragging.value) {
        return
    }

    translateX.value += event.clientX - lastPointerX.value
    translateY.value += event.clientY - lastPointerY.value
    lastPointerX.value = event.clientX
    lastPointerY.value = event.clientY
    applyTransform()
}

function handleMouseUp() {
    if (!isDragging.value) {
        return
    }

    isDragging.value = false
    applyTransform()
}

async function toggleLightbox() {
    isLightboxOpen.value = !isLightboxOpen.value
    await nextTick()
    syncRenderedSvg()
}

function closeLightbox() {
    isLightboxOpen.value = false
    syncRenderedSvg()
}

async function renderDiagram() {
    const mermaid = (await import('mermaid')).default
    const darkMode = document.documentElement.classList.contains('dark')

    mermaid.initialize({
        startOnLoad: false,
        securityLevel: 'loose',
        theme: darkMode ? 'dark' : 'default'
    })

    const source = props.src ? await fetch(props.src).then((response) => response.text()) : props.code || ''
    const normalizedSource = resolveMermaidThemeTokens(source.trim(), darkMode)
    const [{ svg: renderedInlineSvg }, { svg: renderedLightboxSvg }] = await Promise.all([
        mermaid.render(nextRenderId(), normalizedSource),
        mermaid.render(nextRenderId(), normalizedSource)
    ])

    inlineSvg.value = renderedInlineSvg
    lightboxSvg.value = renderedLightboxSvg
    resetView()
    await nextTick()
    syncRenderedSvg()
}

function handleKeydown(event: any) {
    if (event.key === 'Escape' && isLightboxOpen.value) {
        closeLightbox()
    }
}

onMounted(() => {
    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
    window.addEventListener('keydown', handleKeydown)
    renderDiagram()
})

onBeforeUnmount(() => {
    window.removeEventListener('mousemove', handleMouseMove)
    window.removeEventListener('mouseup', handleMouseUp)
    window.removeEventListener('keydown', handleKeydown)
})

watch(isDark, () => {
    renderDiagram()
})
</script>

<style scoped>
.mermaid-wrap {
    position: relative;
    margin: 1.5rem 0;
}

.mermaid-toolbar {
    position: absolute;
    top: 1rem;
    right: 1rem;
    display: flex;
    gap: 0.5rem;
    z-index: 2;
    margin-bottom: 0;
    padding: 0.375rem;
    border: 1px solid rgba(15, 23, 42, 0.08);
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.8);
    box-shadow: 0 14px 40px rgba(15, 23, 42, 0.1);
    backdrop-filter: blur(14px);
}

.mermaid-toolbar-overlay {
    top: 1.25rem;
    right: 1.25rem;
    gap: 0.375rem;
}

.mermaid-tool {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 2.25rem;
    height: 2.25rem;
    padding: 0;
    border: 1px solid var(--vp-c-divider);
    border-radius: 999px;
    background: var(--vp-c-bg-soft);
    color: var(--vp-c-text-1);
    line-height: 1;
    transition:
        border-color 0.2s ease,
        background-color 0.2s ease,
        color 0.2s ease,
        transform 0.2s ease;
}

.mermaid-tool:hover {
    border-color: var(--vp-c-brand-1);
    color: var(--vp-c-brand-1);
    transform: translateY(-1px);
}

.mermaid-toolbar .mermaid-tool {
    border-color: rgba(15, 23, 42, 0.08);
    background: rgba(255, 255, 255, 0.72);
}

.dark .mermaid-toolbar {
    border-color: rgba(255, 255, 255, 0.08);
    background: rgba(20, 20, 24, 0.72);
    box-shadow: 0 14px 40px rgba(0, 0, 0, 0.2);
}

.dark .mermaid-toolbar .mermaid-tool {
    border-color: rgba(255, 255, 255, 0.08);
    background: rgba(255, 255, 255, 0.03);
    color: rgba(255, 255, 255, 0.9);
}

.mermaid-toolbar-overlay .mermaid-tool:hover {
    background: rgba(255, 255, 255, 0.86);
}

.dark .mermaid-toolbar-overlay .mermaid-tool:hover {
    border-color: rgba(255, 255, 255, 0.22);
    background: rgba(255, 255, 255, 0.08);
    color: #fff;
}

.mermaid-tool svg {
    width: 1rem;
    height: 1rem;
    stroke: currentColor;
    stroke-width: 1.9;
    stroke-linecap: round;
    stroke-linejoin: round;
    fill: none;
}

.mermaid-viewport {
    position: relative;
    overflow: hidden;
    padding: 5rem 1rem 1rem;
    border: 1px solid var(--vp-c-divider);
    border-radius: 14px;
    background: var(--vp-c-bg-soft);
    touch-action: none;
    cursor: grab;
}

.mermaid-viewport.is-dragging {
    cursor: grabbing;
}

.mermaid-viewport-lightbox {
    min-height: min(78vh, 860px);
    padding: 2rem;
    background: radial-gradient(circle at top, rgba(255, 255, 255, 0.05), transparent 45%), var(--vp-c-bg-soft);
}

.mermaid {
    display: flex;
    justify-content: center;
    align-items: center;
    min-height: 120px;
    height: 100%;
}

.mermaid :deep(svg) {
    max-width: 100%;
    height: auto;
    transition: transform 0.16s ease;
}

.mermaid-viewport.is-dragging .mermaid :deep(svg) {
    transition: none;
}

.mermaid-lightbox {
    position: fixed;
    inset: 0;
    z-index: 90;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 2rem;
    background: rgba(10, 10, 14, 0.7);
    backdrop-filter: blur(10px);
}

.mermaid-lightbox-panel {
    position: relative;
    width: min(1200px, calc(100vw - 3rem));
}

.mermaid-fallback {
    overflow-x: auto;
    padding: 1rem;
    border: 1px solid var(--vp-c-divider);
    border-radius: 14px;
    background: var(--vp-c-bg-soft);
    white-space: pre-wrap;
}

@media (max-width: 768px) {
    .mermaid-lightbox {
        padding: 1rem;
    }

    .mermaid-lightbox-panel {
        width: 100%;
    }

    .mermaid-toolbar {
        top: 0.875rem;
        right: 0.875rem;
    }

    .mermaid-toolbar-overlay {
        top: 0.875rem;
        right: 0.875rem;
    }

    .mermaid-viewport-lightbox {
        min-height: 70vh;
        padding: 1rem;
    }

    .mermaid-viewport:not(.mermaid-viewport-lightbox) {
        padding-top: 4.75rem;
    }
}
</style>
