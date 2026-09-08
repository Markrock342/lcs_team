const GEMINI_MODEL = "gemini-3.7-flash";

const SALES_SYSTEM =
  "คุณเป็นผู้ช่วยฝ่ายขายของ Limit Code Studio ใช้ภาษาไทยธรรมชาติ สุขุม ไม่โอ้อวด และไม่ส่งข้อความแทนมนุษย์ จบทุกหัวข้อให้ครบ ห้ามตัดกลางประโยค";

export type GeminiOptions = {
  system?: string;
  temperature?: number;
  maxOutputTokens?: number;
};

type GeminiPart = { text?: string; thought?: boolean };
type GeminiPayload = {
  error?: { message?: string };
  candidates?: Array<{
    finishReason?: string;
    content?: { parts?: GeminiPart[] };
  }>;
};

type GeminiContent = { role: string; parts: Array<{ text: string }> };

export function getGeminiKey() {
  return process.env.GEMINI_API_KEY?.trim() || process.env.GOOGLE_GENERATIVE_AI_API_KEY?.trim() || "";
}

function geminiBody(contents: GeminiContent[], options?: GeminiOptions, withThinkingOff = true) {
  return {
    systemInstruction: {
      parts: [{ text: options?.system ?? SALES_SYSTEM }],
    },
    contents,
    generationConfig: {
      temperature: options?.temperature ?? 0.7,
      maxOutputTokens: options?.maxOutputTokens ?? 8192,
      ...(withThinkingOff ? { thinkingConfig: { thinkingBudget: 0 } } : {}),
    },
  };
}

function readGeminiText(payload: GeminiPayload, trim = true) {
  const text =
    payload.candidates?.[0]?.content?.parts
      ?.filter((part) => !part.thought)
      .map((part) => part.text ?? "")
      .join("") ?? "";
  return trim ? text.trim() : text;
}

async function requestGemini(contents: GeminiContent[], options?: GeminiOptions) {
  const key = getGeminiKey();
  if (!key) throw new Error("ยังไม่ได้ตั้งค่า GEMINI_API_KEY");

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${encodeURIComponent(key)}`;

  async function post(withThinkingOff: boolean) {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(geminiBody(contents, options, withThinkingOff)),
    });
    const payload = (await response.json()) as GeminiPayload;
    return { response, payload };
  }

  let { response, payload } = await post(true);
  const thinkingRejected =
    !response.ok &&
    /thinking|thinkingBudget|thinkingConfig/i.test(payload.error?.message ?? "");
  if (thinkingRejected) {
    ({ response, payload } = await post(false));
  }

  if (!response.ok) {
    throw new Error(payload.error?.message || "เรียก Gemini ไม่สำเร็จ");
  }

  return payload;
}

export async function generateGeminiText(prompt: string, options?: GeminiOptions) {
  const contents: GeminiContent[] = [{ role: "user", parts: [{ text: prompt }] }];
  let full = "";

  for (let attempt = 0; attempt < 3; attempt++) {
    const payload = await requestGemini(contents, options);
    const chunk = readGeminiText(payload, false);
    full += chunk;
    const finishReason = payload.candidates?.[0]?.finishReason ?? "";
    if (finishReason !== "MAX_TOKENS" || !chunk.trim()) break;
    contents.push({ role: "model", parts: [{ text: chunk }] });
    contents.push({
      role: "user",
      parts: [
        {
          text: "ต่อจากประโยคสุดท้ายให้จบข้อความให้ครบ อย่าเริ่มใหม่ อย่าสรุปซ้ำ",
        },
      ],
    });
  }

  const text = full.trim();
  if (!text) throw new Error("Gemini ไม่ได้ส่งข้อความกลับมา");
  return text;
}

export async function* streamGeminiText(prompt: string, options?: GeminiOptions) {
  const key = getGeminiKey();
  if (!key) {
    throw new Error("ยังไม่ได้ตั้งค่า GEMINI_API_KEY");
  }

  async function openStream(withThinkingOff: boolean) {
    return fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:streamGenerateContent?alt=sse&key=${encodeURIComponent(key)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          geminiBody([{ role: "user", parts: [{ text: prompt }] }], options, withThinkingOff)
        ),
      }
    );
  }

  let response = await openStream(true);
  if (!response.ok) {
    const payload = (await response.json().catch(() => ({}))) as { error?: { message?: string } };
    if (/thinking|thinkingBudget|thinkingConfig/i.test(payload.error?.message ?? "")) {
      response = await openStream(false);
    } else {
      throw new Error(payload.error?.message || "เรียก Gemini ไม่สำเร็จ");
    }
  }

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
        const payload = JSON.parse(json) as GeminiPayload;
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
