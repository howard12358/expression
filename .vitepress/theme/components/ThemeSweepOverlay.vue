<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted } from 'vue'
import { useData } from 'vitepress'

interface ViewTransitionDocument extends Document {
    startViewTransition?: (callback: () => Promise<void> | void) => {
        ready: Promise<void>
    }
}

const { isDark } = useData()
const TRANSITION_DURATION = 680
const TRANSITION_EASING = 'cubic-bezier(0.22, 1, 0.36, 1)'

function getEndRadius(x: number, y: number) {
    return Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y))
}

async function triggerSweep(event: MouseEvent) {
    const toggle = (event.target as HTMLElement | null)?.closest('.VPSwitchAppearance') as HTMLElement | null
    if (!toggle) return

    event.preventDefault()
    event.stopImmediatePropagation()

    const rect = toggle.getBoundingClientRect()
    const x = rect.left + rect.width / 2
    const y = rect.top + rect.height / 2
    const endRadius = getEndRadius(x, y)
    const expandClipPath = [`circle(0px at ${x}px ${y}px)`, `circle(${endRadius}px at ${x}px ${y}px)`]
    const collapseClipPath = [`circle(${endRadius}px at ${x}px ${y}px)`, `circle(0px at ${x}px ${y}px)`]
    const nextThemeIsDark = !isDark.value
    const transitionDocument = document as ViewTransitionDocument

    if (!transitionDocument.startViewTransition) {
        isDark.value = nextThemeIsDark
        return
    }

    document.documentElement.classList.toggle('theme-transition-to-dark', nextThemeIsDark)
    document.documentElement.classList.toggle('theme-transition-to-light', !nextThemeIsDark)

    const transition = transitionDocument.startViewTransition(async () => {
        isDark.value = nextThemeIsDark
        await nextTick()
    })

    await transition.ready

    let animation: Animation

    if (nextThemeIsDark) {
        animation = document.documentElement.animate(
            {
                clipPath: collapseClipPath
            },
            {
                duration: TRANSITION_DURATION,
                easing: TRANSITION_EASING,
                fill: 'both',
                pseudoElement: '::view-transition-old(root)'
            }
        )
    } else {
        animation = document.documentElement.animate(
            {
                clipPath: expandClipPath
            },
            {
                duration: TRANSITION_DURATION,
                easing: TRANSITION_EASING,
                fill: 'both',
                pseudoElement: '::view-transition-new(root)'
            }
        )
    }

    await animation.finished.catch(() => undefined)

    requestAnimationFrame(() => {
        document.documentElement.classList.remove('theme-transition-to-dark', 'theme-transition-to-light')
    })
}

onMounted(() => {
    document.addEventListener('click', triggerSweep, true)
})

onBeforeUnmount(() => {
    document.removeEventListener('click', triggerSweep, true)
})
</script>
