export const supabaseJsVersion = "2.49.4"
export const supabaseJsBrowserUrl = `https://cdn.jsdelivr.net/npm/@supabase/supabase-js@${supabaseJsVersion}/dist/umd/supabase.min.js`

type SupabaseFactory = {
  createClient: (url: string, key: string) => any
}

type SupabaseBrowserScope = {
  supabase?: SupabaseFactory
  __supabaseClient?: any
  __supabaseClientPromise?: Promise<any | null>
  setTimeout: (callback: () => void, delay: number) => number
  clearTimeout: (timer: number) => void
}

type ScriptElement = {
  src: string
  async: boolean
  onload: (() => void) | null
  onerror: (() => void) | null
  remove: () => void
}

type ScriptDocument = {
  createElement: (tagName: "script") => ScriptElement
  head: { appendChild: (script: ScriptElement) => void }
}

export type SupabaseLoaderEnvironment = {
  scope: SupabaseBrowserScope
  document: ScriptDocument
  timeoutMs?: number
}

const browserEnvironment = (): SupabaseLoaderEnvironment => ({
  scope: window as unknown as SupabaseBrowserScope,
  document: document as unknown as ScriptDocument,
})

export const loadSharedSupabaseClient = async (
  url: string,
  key: string,
  environment = browserEnvironment(),
) => {
  if (!url || !key) return null
  const { scope, document: scriptDocument, timeoutMs = 8000 } = environment
  if (scope.__supabaseClient) return scope.__supabaseClient

  const pending = scope.__supabaseClientPromise
  if (pending) {
    try {
      const client = await pending
      if (!client && scope.__supabaseClientPromise === pending) delete scope.__supabaseClientPromise
      return client
    } catch {
      if (scope.__supabaseClientPromise === pending) delete scope.__supabaseClientPromise
      return null
    }
  }

  let resolveRequest: (client: any | null) => void = () => undefined
  const request = new Promise<any | null>((resolve) => {
    resolveRequest = resolve
  })
  scope.__supabaseClientPromise = request
  let settled = false
  let script: ScriptElement | null = null
  let timer = 0

  const finish = (client: any | null) => {
    if (settled) return
    settled = true
    if (timer) scope.clearTimeout(timer)
    if (!client) script?.remove()
    if (client) scope.__supabaseClient = client
    if (scope.__supabaseClientPromise === request) delete scope.__supabaseClientPromise
    resolveRequest(client)
  }

  const createClient = () => {
    try {
      const factory = scope.supabase
      finish(factory?.createClient ? factory.createClient(url, key) : null)
    } catch {
      finish(null)
    }
  }

  if (scope.supabase?.createClient) createClient()
  else {
    try {
      script = scriptDocument.createElement("script")
      script.src = supabaseJsBrowserUrl
      script.async = true
      script.onload = createClient
      script.onerror = () => finish(null)
      timer = scope.setTimeout(() => finish(null), timeoutMs)
      scriptDocument.head.appendChild(script)
    } catch {
      finish(null)
    }
  }
  return request
}

export type SupabaseAuthHandlers = {
  onSignedOut: () => void
  onSessionChanged: () => void
}

export const watchSupabaseAuth = (client: any, handlers: SupabaseAuthHandlers) => {
  let disposed = false
  const listener = client.auth.onAuthStateChange((event: string) => {
    if (disposed) return
    if (event === "SIGNED_OUT") {
      handlers.onSignedOut()
      return
    }
    if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED" || event === "USER_UPDATED")
      handlers.onSessionChanged()
  })
  const subscription = listener?.data?.subscription
  return {
    unsubscribe: () => {
      if (disposed) return
      disposed = true
      subscription?.unsubscribe?.()
    },
  }
}

export type AuthGenerationSnapshot = Readonly<{
  revision: number
  userId: string
}>

export const createAuthGenerationGuard = () => {
  let revision = 0
  let userId: string | null = null
  const isCurrent = (snapshot: AuthGenerationSnapshot) =>
    snapshot.revision === revision && snapshot.userId === userId
  return {
    start() {
      revision += 1
      userId = null
      return revision
    },
    bind(candidateRevision: number, candidateUserId: string): AuthGenerationSnapshot | null {
      if (candidateRevision !== revision || !candidateUserId) return null
      userId = candidateUserId
      return { revision, userId }
    },
    invalidate() {
      revision += 1
      userId = null
    },
    isRevisionCurrent(candidateRevision: number) {
      return candidateRevision === revision
    },
    current(): AuthGenerationSnapshot | null {
      return userId ? { revision, userId } : null
    },
    isCurrent,
    commit(snapshot: AuthGenerationSnapshot, effect: () => void) {
      if (!isCurrent(snapshot)) return false
      effect()
      return true
    },
  }
}

export const createBrowserResourceScope = () => {
  let disposed = false
  const cleanups: Array<() => void> = []
  return {
    get disposed() {
      return disposed
    },
    add(cleanup: () => void) {
      if (disposed) cleanup()
      else cleanups.push(cleanup)
    },
    listen(
      target: Pick<EventTarget, "addEventListener" | "removeEventListener">,
      type: string,
      listener: EventListener,
    ) {
      target.addEventListener(type, listener)
      this.add(() => target.removeEventListener(type, listener))
    },
    cleanup() {
      if (disposed) return
      disposed = true
      while (cleanups.length) cleanups.pop()?.()
    },
  }
}
