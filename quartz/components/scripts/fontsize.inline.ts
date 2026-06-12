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
  // Show/hide reset button
  const reset = document.querySelector(".zoom-reset") as HTMLElement | null
  if (reset) reset.style.display = Math.abs(currentScale - 1) < 0.01 ? "none" : ""
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

  window.addCleanup(() => {
    zoomIn?.removeEventListener("click", () => {})
    zoomOut?.removeEventListener("click", () => {})
    zoomReset?.removeEventListener("click", () => {})
  })
})
