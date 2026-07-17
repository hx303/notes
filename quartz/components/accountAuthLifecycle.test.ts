import assert from "node:assert"
import { readFileSync } from "node:fs"
import test from "node:test"
import {
  createAuthGenerationGuard,
  createBrowserResourceScope,
  loadSharedSupabaseClient,
  supabaseJsBrowserUrl,
  watchSupabaseAuth,
  type SupabaseLoaderEnvironment,
} from "./scripts/supabaseClient"

const deferred = <T>() => {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((next) => {
    resolve = next
  })
  return { promise, resolve }
}

type FakeScript = {
  src: string
  async: boolean
  onload: (() => void) | null
  onerror: (() => void) | null
  removed: boolean
  remove: () => void
}

const createLoaderHarness = () => {
  const scripts: FakeScript[] = []
  const timers = new Map<number, () => void>()
  let timerId = 0
  const scope: SupabaseLoaderEnvironment["scope"] = {
    setTimeout: (callback) => {
      timerId += 1
      timers.set(timerId, callback)
      return timerId
    },
    clearTimeout: (id) => {
      timers.delete(id)
    },
  }
  const environment: SupabaseLoaderEnvironment = {
    scope,
    document: {
      createElement: () => {
        const script: FakeScript = {
          src: "",
          async: false,
          onload: null,
          onerror: null,
          removed: false,
          remove: () => {
            script.removed = true
          },
        }
        return script
      },
      head: {
        appendChild: (script) => scripts.push(script as FakeScript),
      },
    },
  }
  return { environment, scope, scripts, timers }
}

test("account surfaces share one exact-version Supabase client while loading concurrently", async () => {
  const { environment, scope, scripts } = createLoaderHarness()
  let createCount = 0
  const client = { id: "shared-client" }

  const accountPageClient = loadSharedSupabaseClient(
    "https://example.supabase.co",
    "public",
    environment,
  )
  const accountMenuClient = loadSharedSupabaseClient(
    "https://example.supabase.co",
    "public",
    environment,
  )

  assert.equal(scripts.length, 1)
  assert.equal(scripts[0]?.src, supabaseJsBrowserUrl)
  scope.supabase = {
    createClient: () => {
      createCount += 1
      return client
    },
  }
  scripts[0]?.onload?.()

  const [pageResult, menuResult] = await Promise.all([accountPageClient, accountMenuClient])
  assert.equal(pageResult, client)
  assert.equal(menuResult, client)
  assert.equal(createCount, 1)
  assert.equal(scope.__supabaseClient, client)
  assert.equal(scope.__supabaseClientPromise, undefined)
  assert.match(supabaseJsBrowserUrl, /@supabase\/supabase-js@2\.49\.4\//)
})

test("failed SDK loads clear the singleton promise and a later attempt can recover", async () => {
  const { environment, scope, scripts } = createLoaderHarness()
  const first = loadSharedSupabaseClient("https://example.supabase.co", "public", environment)
  assert.equal(scripts.length, 1)
  scripts[0]?.onerror?.()
  assert.equal(await first, null)
  assert.equal(scripts[0]?.removed, true)
  assert.equal(scope.__supabaseClientPromise, undefined)

  const client = { id: "retry-client" }
  const second = loadSharedSupabaseClient("https://example.supabase.co", "public", environment)
  assert.equal(scripts.length, 2)
  scope.supabase = { createClient: () => client }
  scripts[1]?.onload?.()
  assert.equal(await second, client)
  assert.equal(scope.__supabaseClient, client)
})

test("auth lifecycle clears on SIGNED_OUT, resyncs sessions, and stops after cleanup", () => {
  const authState: { callback?: (event: string) => void } = {}
  let unsubscribeCount = 0
  let signedOutCount = 0
  let sessionChangedCount = 0
  const client = {
    auth: {
      onAuthStateChange: (listener: (event: string) => void) => {
        authState.callback = listener
        return {
          data: {
            subscription: {
              unsubscribe: () => {
                unsubscribeCount += 1
              },
            },
          },
        }
      },
    },
  }
  const subscription = watchSupabaseAuth(client, {
    onSignedOut: () => {
      signedOutCount += 1
    },
    onSessionChanged: () => {
      sessionChangedCount += 1
    },
  })

  authState.callback?.("SIGNED_OUT")
  authState.callback?.("SIGNED_IN")
  authState.callback?.("TOKEN_REFRESHED")
  authState.callback?.("USER_UPDATED")
  authState.callback?.("PASSWORD_RECOVERY")
  assert.equal(signedOutCount, 1)
  assert.equal(sessionChangedCount, 3)

  subscription.unsubscribe()
  subscription.unsubscribe()
  authState.callback?.("SIGNED_OUT")
  assert.equal(unsubscribeCount, 1)
  assert.equal(signedOutCount, 1)
})

test("SPA resource scope removes document/window listeners and late resources immediately", () => {
  const resources = createBrowserResourceScope()
  const target = new EventTarget()
  let eventCount = 0
  let cleanupCount = 0
  const listener = () => {
    eventCount += 1
  }
  resources.listen(target, "account-change", listener)
  resources.add(() => {
    cleanupCount += 1
  })
  target.dispatchEvent(new Event("account-change"))
  resources.cleanup()
  resources.cleanup()
  target.dispatchEvent(new Event("account-change"))
  resources.add(() => {
    cleanupCount += 1
  })

  assert.equal(eventCount, 1)
  assert.equal(cleanupCount, 2)
  assert.equal(resources.disposed, true)
})

test("an account A request resolving after sign-out cannot restore private UI", async () => {
  const guard = createAuthGenerationGuard()
  const revision = guard.start()
  const accountA = guard.bind(revision, "account-a")
  assert.ok(accountA)
  const request = deferred<string>()
  let privateText = ""
  const render = request.promise.then((value) =>
    guard.commit(accountA, () => (privateText = value)),
  )

  guard.invalidate()
  request.resolve("account A private content")

  assert.equal(await render, false)
  assert.equal(privateText, "")
})

test("an old account A response cannot overwrite the newer account B session", async () => {
  const guard = createAuthGenerationGuard()
  const accountA = guard.bind(guard.start(), "account-a")
  assert.ok(accountA)
  const requestA = deferred<string>()
  let visibleAccount = ""
  const renderA = requestA.promise.then((value) =>
    guard.commit(accountA, () => (visibleAccount = value)),
  )

  const accountB = guard.bind(guard.start(), "account-b")
  assert.ok(accountB)
  const requestB = deferred<string>()
  const renderB = requestB.promise.then((value) =>
    guard.commit(accountB, () => (visibleAccount = value)),
  )
  requestB.resolve("account B")
  assert.equal(await renderB, true)
  requestA.resolve("account A")
  assert.equal(await renderA, false)
  assert.equal(visibleAccount, "account B")
})

test("stale menu profile and capability RPC responses cannot mutate a newer session", async () => {
  const guard = createAuthGenerationGuard()
  const accountA = guard.bind(guard.start(), "account-a")
  assert.ok(accountA)
  const profile = deferred<string>()
  const capability = deferred<boolean>()
  let menuName = "account B"
  let ownerLinkVisible = false
  const profileRender = profile.promise.then((value) =>
    guard.commit(accountA, () => (menuName = value)),
  )
  const capabilityRender = capability.promise.then((value) =>
    guard.commit(accountA, () => (ownerLinkVisible = value)),
  )

  const accountB = guard.bind(guard.start(), "account-b")
  assert.ok(accountB)
  profile.resolve("account A")
  capability.resolve(true)

  assert.equal(await profileRender, false)
  assert.equal(await capabilityRender, false)
  assert.equal(menuName, "account B")
  assert.equal(ownerLinkVisible, false)
})

test("AccountPage and AccountMenu consume the shared loader without a second CDN client", () => {
  const page = readFileSync(new URL("./scripts/accountPage.inline.ts", import.meta.url), "utf8")
  const menu = readFileSync(new URL("./scripts/accountMenu.inline.ts", import.meta.url), "utf8")
  assert.match(page, /loadSharedSupabaseClient/)
  assert.match(menu, /loadSharedSupabaseClient/)
  assert.doesNotMatch(page, /@supabase\/supabase-js@/)
  assert.doesNotMatch(menu, /esm\.sh|@supabase\/supabase-js@/)
  assert.match(page, /onSignedOut:[\s\S]*clearPrivateWorkspace/)
  assert.match(page, /const snapshot = authGeneration\.current\(\)/)
  assert.match(page, /showImportedDraft\([\s\S]*snapshot\)/)
  assert.match(menu, /isAuthCurrent\(snapshot\)[\s\S]*renderProfile/)
  assert.match(menu, /ownerLink && isAuthCurrent\(snapshot\)/)
  assert.match(menu, /window\.addCleanup\(\(\) => resources\.cleanup\(\)\)/)
})
