// Claude API로 사진 속 공간을 분석해 정리 방법을 받아옵니다.
import Anthropic from "https://esm.sh/@anthropic-ai/sdk@1.8.0";

const SYSTEM_PROMPT = `당신은 경험 많은 정리수납 전문가입니다. 사용자가 보낸 집 안 공간 사진을 보고,
현실적으로 바로 실행할 수 있는 정리 계획을 한국어로 알려주세요.
- 사진에 실제로 보이는 물건과 상태를 근거로 말하세요. 보이지 않는 것은 추측하지 마세요.
- 정리 순서는 "비우기 → 분류 → 제자리 정하기 → 수납" 흐름으로, 한 단계는 한 문장의 구체적인 행동으로 쓰세요.
- 비난하지 말고 따뜻하고 격려하는 말투로 쓰세요.
- 사진이 집 안 공간이 아니면 space에 "알 수 없음"이라고 쓰고 summary에 이유를 설명하세요.`;

const RESULT_SCHEMA = {
  type: "object",
  properties: {
    space: { type: "string", description: "공간 종류 (예: 거실, 주방, 옷장)" },
    summary: { type: "string", description: "현재 상태 요약 2~3문장" },
    steps: {
      type: "array",
      items: { type: "string" },
      description: "우선순위대로 정리 순서 (4~8개)",
    },
    declutter: {
      type: "array",
      items: { type: "string" },
      description: "버리거나 비울 후보",
    },
    storage: {
      type: "array",
      items: { type: "string" },
      description: "수납 아이디어",
    },
    time: { type: "string", description: "예상 소요시간" },
    keep_tip: { type: "string", description: "정리 상태를 유지하는 팁" },
  },
  required: ["space", "summary", "steps", "declutter", "storage", "time", "keep_tip"],
  additionalProperties: false,
};

export async function analyzePhoto({ apiKey, model, imageBase64, note }) {
  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true });

  const response = await client.beta.messages.create({
    model,
    max_tokens: 16000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    system: SYSTEM_PROMPT,
    output_config: {
      effort: "medium",
      format: { type: "json_schema", schema: RESULT_SCHEMA },
    },
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: { type: "base64", media_type: "image/jpeg", data: imageBase64 },
          },
          {
            type: "text",
            text: note
              ? `이 공간을 어떻게 정리하면 좋을까요? 참고: ${note}`
              : "이 공간을 어떻게 정리하면 좋을까요?",
          },
        ],
      },
    ],
  });

  if (response.stop_reason === "refusal") {
    throw new Error("이 사진은 분석할 수 없어요. 다른 사진으로 시도해 주세요.");
  }
  if (response.stop_reason === "max_tokens") {
    throw new Error("응답이 너무 길어 중간에 끊겼어요. 다시 시도해 주세요.");
  }
  const text = response.content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("");
  try {
    return JSON.parse(text);
  } catch {
    throw new Error("결과를 읽지 못했어요. 다시 시도해 주세요.");
  }
}

export function describeError(err) {
  if (err instanceof Anthropic.AuthenticationError) {
    return "API 키가 올바르지 않아요. 설정 탭에서 키를 확인해 주세요.";
  }
  if (err instanceof Anthropic.PermissionDeniedError) {
    return "이 API 키로는 선택한 모델을 쓸 수 없어요. 설정에서 다른 모델을 골라보세요.";
  }
  if (err instanceof Anthropic.RateLimitError) {
    return "요청이 너무 많아요. 잠시 후 다시 시도해 주세요.";
  }
  if (err instanceof Anthropic.APIConnectionError) {
    return "인터넷 연결을 확인해 주세요.";
  }
  if (err instanceof Anthropic.APIError) {
    return `분석 중 오류가 발생했어요 (${err.status ?? "알 수 없음"}). 잠시 후 다시 시도해 주세요.`;
  }
  return err?.message || "알 수 없는 오류가 발생했어요.";
}
