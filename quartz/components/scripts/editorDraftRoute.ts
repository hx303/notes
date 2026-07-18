export const bindDocumentEditorRoute = (currentHref: string, documentId: string) => {
  const route = new URL(currentHref)
  route.searchParams.delete("action")
  route.searchParams.delete("mode")
  route.searchParams.set("document", documentId)
  return route.toString()
}
