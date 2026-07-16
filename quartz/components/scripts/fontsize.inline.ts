const SCALE_STEP = 0.0625
const SCALE_MIN = 0.875
const SCALE_MAX = 1.25
const SCALE_KEY = "content-scale"
const savedScale = () => {
  try {
    const value = Number(localStorage.getItem(SCALE_KEY))
    return Number.isFinite(value) ? Math.min(SCALE_MAX, Math.max(SCALE_MIN, value)) : 1
  } catch {
    return 1
  }
}
let currentScale = savedScale()
const applyScale = (persist = true) => {
  document.documentElement.style.setProperty("--content-scale", String(currentScale))
  document.querySelectorAll<HTMLElement>(".center > article").forEach((article) => {
    article.style.fontSize = `${currentScale}em`
  })
  document.querySelectorAll<HTMLOutputElement>(".fontsize-value").forEach((output) => {
    output.value = `${Math.round(currentScale * 100)}%`
    output.textContent = output.value
  })
  document.querySelectorAll<HTMLButtonElement>(".zoom-out").forEach((button) => {
    button.disabled = currentScale <= SCALE_MIN
  })
  document.querySelectorAll<HTMLButtonElement>(".zoom-in").forEach((button) => {
    button.disabled = currentScale >= SCALE_MAX
  })
  document.querySelectorAll<HTMLButtonElement>(".zoom-reset").forEach((button) => {
    button.disabled = Math.abs(currentScale - 1) < 0.001
  })
  if (persist) {
    try {
      localStorage.setItem(SCALE_KEY, String(currentScale))
    } catch {}
  }
  document.dispatchEvent(new CustomEvent("fontsizechange", { detail: { scale: currentScale } }))
}
document.addEventListener("nav", () => {
  currentScale = savedScale()
  applyScale(false)
  const increase = () => {
    currentScale = Math.min(SCALE_MAX, currentScale + SCALE_STEP)
    applyScale()
  }
  const decrease = () => {
    currentScale = Math.max(SCALE_MIN, currentScale - SCALE_STEP)
    applyScale()
  }
  const reset = () => {
    currentScale = 1
    applyScale()
  }
  document.querySelectorAll<HTMLElement>(".zoom-in").forEach((button) => {
    button.addEventListener("click", increase)
    window.addCleanup(() => button.removeEventListener("click", increase))
  })
  document.querySelectorAll<HTMLElement>(".zoom-out").forEach((button) => {
    button.addEventListener("click", decrease)
    window.addCleanup(() => button.removeEventListener("click", decrease))
  })
  document.querySelectorAll<HTMLElement>(".zoom-reset").forEach((button) => {
    button.addEventListener("click", reset)
    window.addCleanup(() => button.removeEventListener("click", reset))
  })
})
document.addEventListener("readingpreferencesreset", () => {
  currentScale = 1
  try {
    localStorage.removeItem(SCALE_KEY)
  } catch {}
  applyScale(false)
})
