function initMapPage() {
  const page = document.querySelector<HTMLElement>("[data-map-page]");
  if (!page) return;
  const form = page.querySelector<HTMLFormElement>("[data-map-filters]");
  const records = [...page.querySelectorAll<HTMLElement>("[data-map-record]")];
  const status = page.querySelector<HTMLElement>("[data-map-status]");
  if (!form || !status) return;
  const statusElement = status;

  const params = new URLSearchParams(window.location.search);
  const topic = form.elements.namedItem("topic") as HTMLSelectElement;
  const maturity = form.elements.namedItem("maturity") as HTMLSelectElement;
  const focus = form.elements.namedItem("focus") as HTMLInputElement;
  focus.value = params.get("focus") ?? "";
  topic.value = params.get("topic") ?? "";
  maturity.value = params.get("maturity") ?? "";

  function applyFilters() {
    const visible = records.filter((record) => {
      const query = focus.value.trim().toLocaleLowerCase();
      const topicMatch = !topic.value || record.dataset.topic === topic.value;
      const maturityMatch =
        !maturity.value || record.dataset.maturity === maturity.value;
      const focusMatch =
        !query ||
        `${record.dataset.title} ${record.dataset.slug}`
          .toLocaleLowerCase()
          .includes(query);
      record.hidden = !(topicMatch && maturityMatch && focusMatch);
      record.dataset.mapFocus = focusMatch && query ? "true" : "false";
      return topicMatch && maturityMatch && focusMatch;
    }).length;
    statusElement.textContent = `显示 ${visible} 条知识记录`;
    const next = new URL(window.location.href);
    topic.value
      ? next.searchParams.set("topic", topic.value)
      : next.searchParams.delete("topic");
    maturity.value
      ? next.searchParams.set("maturity", maturity.value)
      : next.searchParams.delete("maturity");
    focus.value
      ? next.searchParams.set("focus", focus.value)
      : next.searchParams.delete("focus");
    window.history.replaceState({}, "", next);
  }

  form.addEventListener("change", applyFilters);
  applyFilters();
  window.addCleanup(() => form.removeEventListener("change", applyFilters));
}

document.addEventListener("nav", initMapPage);
window.addEventListener("load", initMapPage, { once: true });
