const SCALE_STEP = 0.0625
const SCALE_MIN = 0.75
const SCALE_MAX = 1.5
const KEY = "content-scale"

let currentScale = 1
try {
  const saved = localStorage.getItem(KEY)
  if (saved) currentScale = parseFloat(saved) || 1
} catch (e) { /* ignore */ }

const apply = () => {
  document.documentElement.style.setProperty("--content-scale", String(currentScale))
  try { localStorage.setItem(KEY, String(currentScale)) } catch (e) { /* ignore */ }

  // Fix bottom spacing: transform:scale doesn't change layout box,
  // so we need extra margin to prevent overlap with footer
  const article = document.querySelector("article") as HTMLElement | null
  if (article) {
    const h = article.offsetHeight
    article.style.marginBottom = Math.max(0, h * (currentScale - 1)) + "px"
  }

  const reset = document.querySelector(".zoom-reset") as HTMLElement | null
  if (reset) reset.style.display = Math.abs(currentScale - 1) < 0.01 ? "none" : ""
}

// ============================================================
// Drag-to-pan: middle mouse button → delta-based pan
// Uses setPointerCapture for smooth, uninterrupted tracking
// ============================================================
let panning = false
let lastX = 0, lastY = 0
let panEl: HTMLElement | null = null

const startPan = (e: PointerEvent) => {
  if (e.button !== 1) return
  e.preventDefault()
  panning = true
  lastX = e.clientX
  lastY = e.clientY
  panEl = document.documentElement
  panEl.setPointerCapture(e.pointerId)
  document.body.style.cursor = "grabbing"
}

const movePan = (e: PointerEvent) => {
  if (!panning) return
  const dx = e.clientX - lastX
  const dy = e.clientY - lastY
  window.scrollBy(-dx, -dy)
  lastX = e.clientX
  lastY = e.clientY
}

const endPan = (e: PointerEvent) => {
  if (!panning) return
  panning = false
  document.body.style.cursor = ""
  try { panEl?.releasePointerCapture(e.pointerId) } catch (_) { /* ignore */ }
  panEl = null
}

document.addEventListener("nav", () => {
  apply()

  const zoomIn = document.querySelector(".zoom-in")
  const zoomOut = document.querySelector(".zoom-out")
  const zoomReset = document.querySelector(".zoom-reset")

  zoomIn?.addEventListener("click", () => {
    currentScale = Math.min(SCALE_MAX, currentScale + SCALE_STEP)
    apply()
  })
  zoomOut?.addEventListener("click", () => {
    currentScale = Math.max(SCALE_MIN, currentScale - SCALE_STEP)
    apply()
  })
  zoomReset?.addEventListener("click", () => {
    currentScale = 1
    apply()
  })

  document.addEventListener("pointerdown", startPan)
  document.addEventListener("pointermove", movePan)
  document.addEventListener("pointerup", endPan)
  document.addEventListener("pointercancel", endPan)

  const suppressMid = (e: MouseEvent) => { if (e.button === 1) e.preventDefault() }
  document.addEventListener("mousedown", suppressMid)
  document.addEventListener("contextmenu", suppressMid)

  window.addCleanup(() => {
    document.removeEventListener("pointerdown", startPan)
    document.removeEventListener("pointermove", movePan)
    document.removeEventListener("pointerup", endPan)
    document.removeEventListener("pointercancel", endPan)
    document.removeEventListener("mousedown", suppressMid)
    document.removeEventListener("contextmenu", suppressMid)
  })
})
