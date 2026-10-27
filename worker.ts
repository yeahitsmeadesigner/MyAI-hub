interface Env {
  AI: {
    run(
      model: string,
      input: Record<string, unknown>
    ): Promise<unknown>;
  };
  ASSETS: {
    fetch(request: Request): Promise<Response>;
  };
}

const MODEL = "@cf/meta/llama-3.1-8b-instruct";

function json(data: unknown, status = 200): Response {
  return Response.json(data, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff"
    }
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/api/health" && request.method === "GET") {
      return json({
        ok: true,
        configured: true,
        model: MODEL,
        message: "Cloud AI endpoint is configured."
      });
    }

    if (url.pathname === "/api/ai/chat" && request.method === "POST") {
      if (!request.headers.get("content-type")?.includes("application/json")) {
        return json({ error: "Expected JSON request." }, 415);
      }

      const length = Number(request.headers.get("content-length") || 0);
      if (length > 200_000) {
        return json({ error: "Request is too large." }, 413);
      }

      let body: {
        prompt?: unknown;
        history?: unknown;
        context?: unknown;
      };

      try {
        body = await request.json();
      } catch {
        return json({ error: "Invalid JSON." }, 400);
      }

      if (
        typeof body.prompt !== "string" ||
        !body.prompt.trim() ||
        body.prompt.length > 8000
      ) {
        return json({ error: "Prompt must be 1–8000 characters." }, 400);
      }

      const history = Array.isArray(body.history)
        ? body.history.slice(-8).map((item: any) => ({
            role: item?.role === "assistant" ? "assistant" : "user",
            content: String(item?.content ?? "").slice(0, 2000)
          }))
        : [];

      const context = body.context
        ? JSON.stringify(body.context).slice(0, 8000)
        : "";

      try {
        const result: any = await env.AI.run(MODEL, {
          messages: [
            {
              role: "system",
              content:
                "You are MyAI Hub, a helpful personal assistant. " +
                "Answer clearly using Markdown. Never claim you saved a task or note " +
                "unless the application actually confirms that action."
            },
            ...history,
            {
              role: "user",
              content: body.prompt +
                (context
                  ? "\n\nOptional user-provided workspace context:\n" + context
                  : "")
            }
          ],
          max_tokens: 900
        });

        const reply =
          result?.response ??
          result?.choices?.[0]?.message?.content;

        if (typeof reply !== "string" || !reply.trim()) {
          return json({ error: "The AI returned no text. Try again." }, 502);
        }

        return json({
          reply,
          toolProposals: []
        });
      } catch {
        return json({
          error: "Cloud AI failed. Check your Workers AI binding and free quota."
        }, 502);
      }
    }

    if (url.pathname.startsWith("/api/")) {
      return json({ error: "API endpoint not found." }, 404);
    }

    return env.ASSETS.fetch(request);
  }
};
