export async function load(url, context, nextLoad) {
  if (url.endsWith(".scss") || url.includes(".inline")) {
    return {
      format: "module",
      shortCircuit: true,
      source: "export default ''",
    }
  }

  return nextLoad(url, context)
}
