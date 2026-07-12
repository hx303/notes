const fallbackCopy = (text: string) => {
  const textarea = document.createElement("textarea")
  textarea.value = text
  textarea.setAttribute("readonly", "")
  textarea.style.position = "fixed"
  textarea.style.opacity = "0"
  document.body.appendChild(textarea)
  textarea.select()
  const copied = document.execCommand("copy")
  textarea.remove()
  return copied
}

const copyText = async (text: string) => {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text)
    return true
  }
  return fallbackCopy(text)
}

document.addEventListener("nav", () => {
  document.querySelectorAll<HTMLElement>(".citation-actions").forEach((section) => {
    const status = section.querySelector<HTMLElement>(".citation-actions-status")
    const url = section.dataset.canonicalUrl ?? window.location.href
    const citation = section.dataset.suggestedCitation ?? url
    const title = section.dataset.shareTitle ?? document.title

    const report = (message: string, state: "success" | "error" | "info") => {
      if (!status) return
      status.textContent = message
      status.dataset.state = state
    }

    const handleAction = async (event: Event) => {
      const button = event.currentTarget as HTMLButtonElement
      const action = button.dataset.citationAction
      try {
        if (action === "copy-link") {
          const copied = await copyText(url)
          report(
            copied ? "永久链接已复制。" : "未能复制链接，请从地址栏手动复制。",
            copied ? "success" : "error",
          )
        } else if (action === "copy-citation") {
          const copied = await copyText(citation)
          report(
            copied ? "建议引用已复制。" : "未能复制引用，请稍后重试。",
            copied ? "success" : "error",
          )
        } else if (action === "share") {
          if (navigator.share) {
            await navigator.share({ title, text: citation, url })
            report("系统分享已打开。", "success")
          } else {
            const copied = await copyText(url)
            report(
              copied
                ? "当前浏览器不支持系统分享，已复制永久链接。"
                : "当前浏览器不支持系统分享，请从地址栏复制链接。",
              copied ? "info" : "error",
            )
          }
        }
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          report("已取消分享。", "info")
        } else {
          report("操作未完成，请稍后重试。", "error")
        }
      }
    }

    section.querySelectorAll<HTMLButtonElement>("[data-citation-action]").forEach((button) => {
      button.addEventListener("click", handleAction)
      window.addCleanup(() => button.removeEventListener("click", handleAction))
    })
  })
})
