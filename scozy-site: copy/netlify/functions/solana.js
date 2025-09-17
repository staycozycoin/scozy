// netlify/functions/solana.js
// Solana RPC proxy with optional provider key.
// If SOLANA_RPC_URL env var is set (e.g., Helius free tier), we use it.
// Otherwise we rotate through public endpoints (free, but may rate-limit).

const PUBLIC_RPCS = [
  "https://api.mainnet-beta.solana.com",
  "https://rpc.ankr.com/solana",
  "https://solana.public-rpc.com"
];

const TIMEOUT_MS = 8000;

async function withTimeout(p, ms = TIMEOUT_MS) {
  return Promise.race([
    p,
    new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), ms)),
  ]);
}

export async function handler(event) {
  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      },
      body: "",
    };
  }

  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  const body = event.body || "{}";
  const provider = process.env.SOLANA_RPC_URL; // optional (Helius/Alchemy/QuickNode)

  try {
    if (provider) {
      // Preferred path: your free Helius key (or any provider)
      const res = await withTimeout(fetch(provider, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body
      }));
      const text = await res.text();
      return {
        statusCode: res.status,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Content-Type": res.headers.get("content-type") || "application/json",
        },
        body: text,
      };
    }

    // Fallback path: rotate public RPCs (no key)
    let lastErr;
    for (const url of PUBLIC_RPCS) {
      try {
        const res = await withTimeout(fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body
        }));
        const text = await res.text();
        // Some public RPCs return HTML on errors; just pass it through.
        return {
          statusCode: res.status,
          headers: {
            "Access-Control-Allow-Origin": "*",
            "Content-Type": res.headers.get("content-type") || "application/json",
          },
          body: text,
        };
      } catch (e) {
        lastErr = e;
      }
    }
    return { statusCode: 502, body: JSON.stringify({ error: lastErr?.message || "rpc unavailable" }) };

  } catch (e) {
    return { statusCode: 502, body: JSON.stringify({ error: e.message }) };
  }
}
