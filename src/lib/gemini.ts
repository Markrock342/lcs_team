const GEMINI_MODEL = "gemini-3.7-flash";

export function getGeminiKey() {
  return process.env.GEMINI_API_KEY?.trim() || process.env.GOOGLE_GENERATIVE_AI_API_KEY?.trim() || "";
}

export async function generateGeminiText(prompt: string) {
  const key = getGeminiKey();
  if (!key) {
    throw new Error("ยังไม่ได้ตั้งค่า GEMINI_API_KEY");
  }

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${encodeURIComponent(key)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: {
          parts: [
            {
              text: "คุณเป็นผู้ช่วยฝ่ายขายของ Limit Code Studio ใช้ภาษาไทยธรรมชาติ สุขุม ไม่โอ้อวด และไม่ส่งข้อความแทนมนุษย์",
            },
          ],
        },
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 1200,
        },
      }),
    }
  );

  const payload = (await response.json()) as {
    error?: { message?: string };
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };

  if (!response.ok) {
    throw new Error(payload.error?.message || "เรียก Gemini ไม่สำเร็จ");
  }

  const text = payload.candidates?.[0]?.content?.parts
    ?.map((part) => part.text ?? "")
    .join("\n")
    .trim();

  if (!text) throw new Error("Gemini ไม่ได้ส่งข้อความกลับมา");
  return text;
}
