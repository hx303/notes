function initRecentGrowth() {
  const root = document.querySelector<HTMLElement>("[data-recent-growth]");
  if (!root) return;
  const form = root.querySelector<HTMLFormElement>("[data-growth-filters]");
  const records = [
    ...root.querySelectorAll<HTMLElement>("[data-growth-record]"),
  ];
  const sections = [
    ...root.querySelectorAll<HTMLElement>("[data-growth-month]"),
  ];
  const status = root.querySelector<HTMLElement>("[data-growth-status]");
  const empty = root.querySelector<HTMLElement>("[data-growth-empty]");
  if (!form || !status || !empty) return;
  const statusElement = status;
  const emptyElement = empty;
  const month = form.elements.namedItem("month") as HTMLSelectElement;
  const topic = form.elements.namedItem("topic") as HTMLSelectElement;
  const kind = form.elements.namedItem("kind") as HTMLSelectElement;
  const params = new URLSearchParams(window.location.search);
  month.value = params.get("month") ?? "";
  topic.value = params.get("topic") ?? "";
  kind.value = params.get("kind") ?? "";

  function apply() {
    let visible = 0;
    for (const record of records) {
      const match =
        (!month.value || record.dataset.month === month.value) &&
        (!topic.value || record.dataset.topic === topic.value) &&
        (!kind.value || record.dataset.kind === kind.value);
      record.hidden = !match;
      if (match) visible++;
    }
    for (const section of sections)
      section.hidden = !section.querySelector(
        "[data-growth-record]:not([hidden])",
      );
    emptyElement.hidden = visible > 0;
    statusElement.textContent = `显示 ${visible} 条生长记录`;
    const next = new URL(window.location.href);
    for (const [key, value] of [
      ["month", month.value],
      ["topic", topic.value],
      ["kind", kind.value],
    ])
      value ? next.searchParams.set(key, value) : next.searchParams.delete(key);
    window.history.replaceState({}, "", next);
  }
  form.addEventListener("change", apply);
  apply();
  window.addCleanup(() => form.removeEventListener("change", apply));
}
document.addEventListener("nav", initRecentGrowth);
window.addEventListener("load", initRecentGrowth, { once: true });
