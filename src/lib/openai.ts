const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";
const DEFAULT_MODEL = "gpt-5.4-mini";

type OpenAIResponsePayload = {
  id?: string;
  model?: string;
  output?: Array<{
    type?: string;
    content?: Array<{ type?: string; text?: string }>;
  }>;
  error?: { message?: string };
  usage?: { input_tokens?: number; output_tokens?: number; total_tokens?: number };
};

export type AssistantTurn = { role: "user" | "assistant"; content: string };

export function getOpenAIConfig() {
  return {
    key: process.env.OPENAI_API_KEY?.trim() || "",
    model: process.env.OPENAI_MODEL?.trim() || DEFAULT_MODEL,
  };
}

function outputText(payload: OpenAIResponsePayload) {
  return (
    payload.output
      ?.flatMap((item) => item.content ?? [])
      .filter((item) => item.type === "output_text")
      .map((item) => item.text ?? "")
      .join("")
      .trim() ?? ""
  );
}

export async function createOpenAIResponse(
  turns: AssistantTurn[],
  options: { instructions: string; maxOutputTokens?: number },
) {
  const { key, model } = getOpenAIConfig();
  if (!key) throw new Error("ยังไม่ได้ตั้งค่า OPENAI_API_KEY");

  const response = await fetch(OPENAI_RESPONSES_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      store: false,
      instructions: options.instructions,
      input: turns.map((turn) => ({ role: turn.role, content: turn.content })),
      max_output_tokens: options.maxOutputTokens ?? 4096,
    }),
    signal: AbortSignal.timeout(55_000),
  });

  const payload = (await response.json().catch(() => ({}))) as OpenAIResponsePayload;
  if (!response.ok) {
    const message = payload.error?.message || `OpenAI ตอบกลับด้วยสถานะ ${response.status}`;
    throw new Error(message);
  }

  const text = outputText(payload);
  if (!text) throw new Error("OpenAI ไม่ได้ส่งข้อความกลับมา");
  return {
    id: payload.id ?? null,
    text,
    model: payload.model || model,
    usage: payload.usage ?? null,
  };
}
