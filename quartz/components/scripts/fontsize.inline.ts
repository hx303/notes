const SCALE_STEP = 0.0625 // ~1px at 16px base
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
  const reset = document.querySelector(".zoom-reset") as HTMLElement | null
  if (reset) reset.style.display = Math.abs(currentScale - 1) < 0.01 ? "none" : ""
}

// ============================================================
// Drag-to-pan: hold Spacebar + drag to scroll the page freely
// (like Photoshop / Figma / PDF readers)
// ============================================================
let spaceDown = false
let panning = false
let panX = 0, panY = 0, scrollX = 0, scrollY = 0

const spaceDownHandler = (e: KeyboardEvent) => {
  // Ignore when typing
  const el = e.target as HTMLElement
  if (el?.tagName === "INPUT" || el?.tagName === "TEXTAREA" || el?.tagName === "SELECT" || el?.isContentEditable) return
  if (e.key === " " && !e.repeat) {
    e.preventDefault()
    spaceDown = true
    document.body.style.cursor = "grab"
  }
}

const spaceUpHandler = (e: KeyboardEvent) => {
  if (e.key === " ") {
    spaceDown = false
    if (!panning) document.body.style.cursor = ""
  }
}

const startPan = (e: PointerEvent) => {
  if (!spaceDown) return
  panning = true
  panX = e.clientX
  panY = e.clientY
  scrollX = window.scrollX
  scrollY = window.scrollY
  document.body.style.cursor = "grabbing"
  document.body.style.userSelect = "none"
}

const movePan = (e: PointerEvent) => {
  if (!panning) return
  window.scrollTo(scrollX + (panX - e.clientX), scrollY + (panY - e.clientY))
}

const endPan = () => {
  if (!panning) return
  panning = false
  document.body.style.userSelect = ""
  document.body.style.cursor = spaceDown ? "grab" : ""
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

  // Space-to-pan listeners
  document.addEventListener("keydown", spaceDownHandler)
  document.addEventListener("keyup", spaceUpHandler)
  document.addEventListener("pointerdown", startPan)
  document.addEventListener("pointermove", movePan)
  document.addEventListener("pointerup", endPan)
  document.addEventListener("pointercancel", endPan)
  window.addEventListener("blur", () => { spaceDown = false; endPan(); document.body.style.cursor = "" })

  window.addCleanup(() => {
    document.removeEventListener("keydown", spaceDownHandler)
    document.removeEventListener("keyup", spaceUpHandler)
    document.removeEventListener("pointerdown", startPan)
    document.removeEventListener("pointermove", movePan)
    document.removeEventListener("pointerup", endPan)
    document.removeEventListener("pointercancel", endPan)
  })
})
