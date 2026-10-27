interface Env {
  AI?: {
    run(
      model: string,
      input: Record<string, unknown>
    ): Promise<unknown>;
  };
  ASSETS: {
    fetch(request: Request): Promise<Response>;
  };
}

// Cloudflare-hosted model; no third-party API key is required.
const MODEL = "@cf/zai-org/glm-4.7-flash";

function json(data: unknown, status = 200): Response {
  return Response.json(data, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff"
    }
  });
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "";
}

function classifyAiError(error: unknown): { message: string; status: number } {
  const message = errorMessage(error).toLowerCase();

  if (message.includes("quota") || message.includes("rate limit") || message.includes("too many requests") || message.includes("429")) {
    return {
      message: "Cloud AI usage limit reached. Check your Workers AI usage and try again later.",
      status: 429
    };
  }

  if (message.includes("model") && (message.includes("not found") || message.includes("does not exist") || message.includes("unknown"))) {
    return {
      message: "The configured Workers AI model was not found. Check the model ID in worker.ts.",
      status: 502
    };
  }

  if (message.includes("binding") || message.includes("env.ai") || message.includes("undefined")) {
    return {
      message: "Workers AI binding is missing. Add a Workers AI binding named AI and redeploy the Worker.",
      status: 503
    };
  }

  return {
    message: "Workers AI request failed. Check the Worker logs for the underlying error and verify the AI binding, model availability, and usage quota.",
    status: 502
  };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/api/health" && request.method === "GET") {
      const configured = Boolean(env.AI && typeof env.AI.run === "function");
      return json({
        ok: true,
        configured,
        model: MODEL,
        message: configured
          ? "Workers AI binding is available."
          : "Workers AI binding AI is missing. Add it in Cloudflare Workers & Pages > Settings > Bindings, then redeploy."
      }, configured ? 200 : 503);
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

      if (!env.AI || typeof env.AI.run !== "function") {
        return json({
          error: "Workers AI binding AI is missing. Add the AI binding in Cloudflare and redeploy."
        }, 503);
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
          max_tokens: 900,
          chat_template_kwargs: { enable_thinking: false }
        });

        const reply =
          result?.response ??
          result?.choices?.[0]?.message?.content;

        if (typeof reply !== "string" || !reply.trim()) {
          console.error("Workers AI returned an unexpected response shape", {
            model: MODEL,
            resultType: typeof result,
            resultKeys: result && typeof result === "object" ? Object.keys(result) : []
          });
          return json({
            error: "Workers AI returned no text. Check the Worker logs and try again."
          }, 502);
        }

        return json({
          reply,
          toolProposals: []
        });
      } catch (error) {
        // Keep detailed provider errors in Cloudflare logs, not in the public response.
        console.error("Workers AI request failed", {
          model: MODEL,
          error: errorMessage(error) || "Unknown error"
        });
        const failure = classifyAiError(error);
        return json({ error: failure.message }, failure.status);
      }
    }

    if (url.pathname.startsWith("/api/")) {
      return json({ error: "API endpoint not found." }, 404);
    }

    return env.ASSETS.fetch(request);
  }
};
