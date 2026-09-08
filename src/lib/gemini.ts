const GEMINI_MODEL = "gemini-3.7-flash";

const SALES_SYSTEM =
  "คุณเป็นผู้ช่วยฝ่ายขายของ Limit Code Studio ใช้ภาษาไทยธรรมชาติ สุขุม ไม่โอ้อวด และไม่ส่งข้อความแทนมนุษย์";

export type GeminiOptions = {
  system?: string;
  temperature?: number;
  maxOutputTokens?: number;
};

export function getGeminiKey() {
  return process.env.GEMINI_API_KEY?.trim() || process.env.GOOGLE_GENERATIVE_AI_API_KEY?.trim() || "";
}

function geminiBody(prompt: string, options?: GeminiOptions) {
  return {
    systemInstruction: {
      parts: [{ text: options?.system ?? SALES_SYSTEM }],
    },
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: options?.temperature ?? 0.7,
      maxOutputTokens: options?.maxOutputTokens ?? 1200,
    },
  };
}

function readGeminiText(
  payload: {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  },
  trim = true
) {
  const text =
    payload.candidates?.[0]?.content?.parts
      ?.map((part) => part.text ?? "")
      .join("") ?? "";
  return trim ? text.trim() : text;
}

export async function generateGeminiText(prompt: string, options?: GeminiOptions) {
  const key = getGeminiKey();
  if (!key) {
    throw new Error("ยังไม่ได้ตั้งค่า GEMINI_API_KEY");
  }

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${encodeURIComponent(key)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(geminiBody(prompt, options)),
    }
  );

  const payload = (await response.json()) as {
    error?: { message?: string };
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };

  if (!response.ok) {
    throw new Error(payload.error?.message || "เรียก Gemini ไม่สำเร็จ");
  }

  const text = readGeminiText(payload);
  if (!text) throw new Error("Gemini ไม่ได้ส่งข้อความกลับมา");
  return text;
}

export async function* streamGeminiText(prompt: string, options?: GeminiOptions) {
  const key = getGeminiKey();
  if (!key) {
    throw new Error("ยังไม่ได้ตั้งค่า GEMINI_API_KEY");
  }

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:streamGenerateContent?alt=sse&key=${encodeURIComponent(key)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(geminiBody(prompt, options)),
    }
  );

  if (!response.ok) {
    const payload = (await response.json().catch(() => ({}))) as { error?: { message?: string } };
    throw new Error(payload.error?.message || "เรียก Gemini ไม่สำเร็จ");
  }

  if (!response.body) {
    throw new Error("Gemini ไม่ได้ส่งข้อความกลับมา");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let yielded = false;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) continue;
      const json = trimmed.slice(5).trim();
      if (!json || json === "[DONE]") continue;
      try {
        const payload = JSON.parse(json) as {
          candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
        };
        const text = readGeminiText(payload, false);
        if (text) {
          yielded = true;
          yield text;
        }
      } catch {
        // ignore malformed SSE frames
      }
    }
  }

  if (!yielded) {
    throw new Error("Gemini ไม่ได้ส่งข้อความกลับมา");
  }
}
