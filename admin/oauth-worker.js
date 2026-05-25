/**
 * Decap CMS OAuth Proxy for GitHub
 * Deploy to Cloudflare Workers (free tier: 100k req/day)
 *
 * Usage:
 *   1. Create GitHub OAuth App at https://github.com/settings/developers
 *      - Homepage URL: https://wld030303.github.io/notes
 *      - Callback URL: https://wld030303.github.io/notes/admin/
 *   2. Fill in CLIENT_ID and CLIENT_SECRET below
 *   3. Deploy: npx wrangler deploy
 *   4. Update admin/config.yml base_url to this worker's URL
 */

const CLIENT_ID = "YOUR_GITHUB_OAUTH_CLIENT_ID";
const CLIENT_SECRET = "YOUR_GITHUB_OAUTH_CLIENT_SECRET";

// The admin page URL - GitHub redirects here after auth
const ORIGIN = "https://wld030303.github.io";

export default {
  async fetch(request, env, ctx) {
    // Use env vars in production (set via wrangler secret)
    const clientId = env.GITHUB_CLIENT_ID || CLIENT_ID;
    const clientSecret = env.GITHUB_CLIENT_SECRET || CLIENT_SECRET;

    const url = new URL(request.url);

    // CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": ORIGIN,
          "Access-Control-Allow-Methods": "POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
        },
      });
    }

    if (url.pathname === "/auth" && request.method === "POST") {
      try {
        const body = await request.json();
        const code = body.code;

        if (!code) {
          return jsonResponse({ error: "Missing code parameter" }, 400);
        }

        // Exchange code for GitHub access token
        const tokenResponse = await fetch(
          "https://github.com/login/oauth/access_token",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Accept: "application/json",
            },
            body: JSON.stringify({
              client_id: clientId,
              client_secret: clientSecret,
              code: code,
            }),
          }
        );

        const data = await tokenResponse.json();

        if (data.error) {
          return jsonResponse({ error: data.error_description || data.error }, 400);
        }

        return jsonResponse({
          token: data.access_token,
          provider: "github",
        });
      } catch (err) {
        return jsonResponse({ error: "Internal server error" }, 500);
      }
    }

    return new Response("Not Found", { status: 404 });
  },
};

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": ORIGIN,
    },
  });
}
