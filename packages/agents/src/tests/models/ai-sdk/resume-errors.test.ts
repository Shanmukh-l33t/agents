import { APICallError } from "@ai-sdk/provider";
import { describe, expect, it } from "vitest";
import { CloudflareAIError, createAI } from "../../../models/ai-sdk";
import { asAi, callOptions, collect } from "./helpers";

const MODEL = "anthropic/claude-haiku-4.5";

const encoder = new TextEncoder();
const CHUNK = `data: ${JSON.stringify({
  choices: [{ delta: { content: "hi" }, index: 0 }]
})}\n\n`;

/**
 * A binding whose run names its run id, sends one event, then drops; the
 * resume route answers `resumeStatus`, as it does once the run is gone.
 */
function resumeBinding(resumeStatus: number) {
  const resumeUrls: string[] = [];
  return {
    aiGatewayLogId: "01LOGID",
    calls: [],
    resumeUrls,
    async fetch(url: string) {
      resumeUrls.push(url);
      return new Response("gone", { status: resumeStatus });
    },
    async run() {
      let sent = false;
      return new Response(
        new ReadableStream<Uint8Array>({
          pull(controller) {
            if (sent) {
              controller.error(new TypeError("Network connection lost."));
              return;
            }
            sent = true;
            controller.enqueue(encoder.encode(CHUNK));
          }
        }),
        {
          headers: {
            "cf-aig-run-id": "run-123",
            "content-type": "text/event-stream"
          }
        }
      );
    }
  };
}

/** Drains a stream, returning the error it failed with. */
async function failureOf(stream: ReadableStream<unknown>): Promise<unknown> {
  const reader = stream.getReader();
  for (;;) {
    try {
      if ((await reader.read()).done) return undefined;
    } catch (error) {
      return error;
    }
  }
}

describe("a failed stream resume", () => {
  it("throws the exported CloudflareAIError, which is an APICallError", async () => {
    const binding = resumeBinding(404);
    const ai = createAI({ binding: asAi(binding) });
    const { stream } = await ai(MODEL).doStream(callOptions());
    const error = await failureOf(stream);

    expect(binding.resumeUrls).toHaveLength(1);
    expect(error).toBeInstanceOf(CloudflareAIError);
    expect(APICallError.isInstance(error)).toBe(true);
    expect(error).toMatchObject({ code: "provider-error", status: 404 });
    expect((error as CloudflareAIError).isRetryable).toBe(false);
  });

  it("lifts a resume the gateway answers with another failure", async () => {
    const binding = resumeBinding(502);
    const ai = createAI({ binding: asAi(binding) });
    const { stream } = await ai(MODEL).doStream(callOptions());

    expect(await failureOf(stream)).toBeInstanceOf(CloudflareAIError);
  });

  it("passes a healthy stream through unchanged", async () => {
    const binding = {
      aiGatewayLogId: "01LOGID",
      calls: [],
      async fetch() {
        throw new Error("no resume expected");
      },
      async run() {
        return new Response(CHUNK, {
          headers: {
            "cf-aig-run-id": "run-123",
            "content-type": "text/event-stream"
          }
        });
      }
    };
    const ai = createAI({ binding: asAi(binding) });
    const { stream } = await ai(MODEL).doStream(callOptions());
    const parts = await collect(stream);

    expect(parts.map((part) => part.type)).toContain("text-delta");
  });
});
