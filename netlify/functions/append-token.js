// netlify/functions/append-token.js
export async function handler(event) {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method not allowed" };
  }

  try {
    const { token } = JSON.parse(event.body);

    if (!token) {
      return { statusCode: 400, body: "Missing token" };
    }

    // Call GitHub repository_dispatch with PAT stored in Netlify env
    const res = await fetch(
      "https://api.github.com/repos/SDPgroup008/yovibe-web/dispatches",
      {
        method: "POST",
        headers: {
          "Accept": "application/vnd.github.v3+json",
          "Authorization": `Bearer ${process.env.GITHUB_PAT}`, // safe secret
        },
        body: JSON.stringify({
          event_type: "append_token",
          client_payload: { token },
        }),
      }
    );

    if (!res.ok) {
      const text = await res.text();
      return { statusCode: res.status, body: text };
    }

    return { statusCode: 200, body: "Dispatch triggered" };
  } catch (err) {
    return { statusCode: 500, body: err.message };
  }
}
