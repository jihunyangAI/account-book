import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

type ExpensePayload = {
  date: string;
  amount: number;
  description: string;
};

type ExpenseRow = ExpensePayload & {
  id: number;
  created_at: string;
};

type GeminiResult = {
  date: string | null;
  amount: number | null;
  description: string | null;
  need_more_info: boolean;
  ask: string | null;
};

const MODEL_CANDIDATES = [
  "gemini-3.5-flash",
  "gemini-3.6-flash",
  "gemini-3.8-flash",
  "gemini-flash-latest",
  "gemini-3-flash-preview",
];

function todaySeoul() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function shiftDate(base: string, days: number) {
  const [y, m, d] = base.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function startOfMonth(isoDate: string) {
  return `${isoDate.slice(0, 7)}-01`;
}

function startOfWeekMonday(isoDate: string) {
  const [y, m, d] = isoDate.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  const day = date.getUTCDay(); // 0=Sun
  const diff = day === 0 ? -6 : 1 - day;
  date.setUTCDate(date.getUTCDate() + diff);
  return date.toISOString().slice(0, 10);
}

function formatKoreanDate(isoDate: string) {
  const [y, m, d] = isoDate.split("-").map(Number);
  return `${y}년 ${m}월 ${d}일`;
}

function formatAmount(value: number) {
  return new Intl.NumberFormat("ko-KR").format(value);
}

function getSupabase(): SupabaseClient | null {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!supabaseUrl || !supabaseKey) return null;
  return createClient(supabaseUrl, supabaseKey);
}

/** 금액이 있으면 지출 입력, 의문사면 통계 질문 */
function classifyIntent(message: string): "expense" | "query" {
  const hasAmount =
    /(?:\d{1,3}(?:,\d{3})*|\d+)\s*원|(?:\d+\s*)만\s*(?:\d+\s*천)?\s*원?|(?:\d+\s*)천\s*원?/.test(
      message,
    );

  const isQuestion =
    /얼마|얼마나|뭐|뭘|무[었엣]|어떻게|어디|언제|어느|몇\s*(?:개|번|원|일|시|건)?|알려줘|말해줘|보여줘|있었어|샀더|썼더|였지|일까|인가요|\?|？/.test(
      message,
    );

  if (hasAmount) return "expense";
  if (isQuestion) return "query";
  return "expense";
}

function buildExpensePrompt(today: string, message: string, history: ChatMessage[]) {
  const conversation = history
    .slice(-8)
    .map((item) => `${item.role === "user" ? "사용자" : "AI"}: ${item.content}`)
    .join("\n");

  return `당신은 한국어 가계부 분석기입니다.
사용자 메시지에서 지출의 날짜/금액/내용을 추출하세요.

오늘 날짜(한국): ${today}
어제 날짜(한국): ${shiftDate(today, -1)}

반드시 JSON만 출력하세요:
{
  "date": "YYYY-MM-DD" 또는 null,
  "amount": 정수(원) 또는 null,
  "description": "짧은 내용" 또는 null,
  "need_more_info": true/false,
  "ask": "정보가 부족할 때 다시 묻는 한국어 질문" 또는 null
}

규칙:
- "오늘"이면 date=${today}
- "어제"면 date=${shiftDate(today, -1)}
- 날짜 표현이 없으면 date=${today}
- 금액은 정수로 변환 (예: 2만원=20000, 1만5천원=15000, 5천원=5000)
- description은 핵심만 (예: 택시, 점심, 커피)
- 날짜 또는 금액을 확실히 알 수 없으면 need_more_info=true, ask에 되물을 질문
- 지출이 아니면 need_more_info=true로 두고 가계부 사용법을 ask에 안내

이전 대화:
${conversation || "(없음)"}

사용자: ${message}`;
}

function buildStatsPrompt(
  today: string,
  message: string,
  expenses: ExpenseRow[],
  history: ChatMessage[],
) {
  const conversation = history
    .slice(-6)
    .map((item) => `${item.role === "user" ? "사용자" : "AI"}: ${item.content}`)
    .join("\n");

  const rows =
    expenses.length === 0
      ? "(지출 데이터 없음)"
      : expenses
          .map(
            (item) =>
              `- ${item.date} | ${item.amount}원 | ${item.description}`,
          )
          .join("\n");

  return `당신은 친근한 한국어 가계부 비서입니다.
아래 지출 데이터를 바탕으로 사용자 질문에 자연스럽게 답하세요.

기준 날짜(한국):
- 오늘: ${today}
- 어제: ${shiftDate(today, -1)}
- 이번 달 시작: ${startOfMonth(today)}
- 이번 주 시작(월요일): ${startOfWeekMonday(today)}
- 지난주 시작: ${shiftDate(startOfWeekMonday(today), -7)}
- 지난주 끝: ${shiftDate(startOfWeekMonday(today), -1)}

지출 데이터 (총 ${expenses.length}건):
${rows}

규칙:
- 데이터에 있는 사실만 사용하세요. 없는 내용은 추측하지 마세요.
- 금액은 천 단위 콤마로 읽기 쉽게 (예: 20,000원)
- 날짜는 자연스럽게 (예: 10월 18일, 어제)
- 데이터가 없으면 아직 기록이 없다고 안내하고, 지출 입력 예시를 알려주세요
- 친근하고 짧은 문장으로 답하세요 (2~5문장 정도)
- JSON이나 코드블록 없이 한국어 문장만 출력하세요

이전 대화:
${conversation || "(없음)"}

사용자 질문: ${message}`;
}

function extractJson(text: string): GeminiResult {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = fenced ? fenced[1].trim() : trimmed;
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end === -1) {
    throw new Error("AI 응답 형식을 이해하지 못했습니다.");
  }

  const parsed = JSON.parse(raw.slice(start, end + 1)) as Partial<GeminiResult>;
  return {
    date: typeof parsed.date === "string" ? parsed.date : null,
    amount:
      parsed.amount === null || parsed.amount === undefined
        ? null
        : Number(parsed.amount),
    description:
      typeof parsed.description === "string" ? parsed.description.trim() : null,
    need_more_info: Boolean(parsed.need_more_info),
    ask: typeof parsed.ask === "string" ? parsed.ask.trim() : null,
  };
}

async function generateWithGemini(
  apiKey: string,
  prompt: string,
  options?: { json?: boolean; temperature?: number },
) {
  const genAI = new GoogleGenerativeAI(apiKey);
  const json = options?.json ?? false;
  const temperature = options?.temperature ?? (json ? 0.2 : 0.5);
  let lastError: unknown = null;

  for (const modelName of MODEL_CANDIDATES) {
    const model = genAI.getGenerativeModel({
      model: modelName,
      generationConfig: {
        temperature,
        ...(json ? { responseMimeType: "application/json" as const } : {}),
      },
    });

    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const result = await model.generateContent(prompt);
        return result.response.text();
      } catch (error) {
        lastError = error;
        const messageText = error instanceof Error ? error.message : String(error);
        const unavailable =
          messageText.includes("[404") ||
          messageText.includes("no longer available") ||
          messageText.includes("is not found");
        if (unavailable) break;

        const retryable =
          messageText.includes("[503") ||
          messageText.includes("high demand") ||
          messageText.includes("UNAVAILABLE");
        if (!retryable || attempt === 2) break;
        await new Promise((resolve) => setTimeout(resolve, 800 * (attempt + 1)));
      }
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("Gemini 응답을 가져오지 못했습니다.");
}

function toFriendlyApiError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes("GEMINI_API_KEY")) {
    return "Gemini API 키가 설정되지 않았어요. 관리자에게 문의해 주세요.";
  }
  if (message.includes("[503") || message.includes("high demand")) {
    return "AI 서버가 잠시 바쁩니다. 잠시 후 다시 보내 주세요.";
  }
  if (message.includes("[404") || message.includes("no longer available")) {
    return "사용 가능한 AI 모델을 찾지 못했어요. 잠시 후 다시 시도해 주세요.";
  }
  if (message.includes("[429") || message.includes("quota")) {
    return "AI 사용량이 초과되었어요. 잠시 후 다시 시도해 주세요.";
  }
  return "AI 처리 중 오류가 발생했어요. 잠시 후 다시 시도해 주세요.";
}

async function handleQuery(
  apiKey: string,
  message: string,
  history: ChatMessage[],
  today: string,
) {
  const supabase = getSupabase();
  if (!supabase) {
    return NextResponse.json(
      {
        reply: "저장소 설정이 없어 통계를 볼 수 없어요. 환경변수를 확인해 주세요.",
        expense: null,
        type: "query",
      },
      { status: 500 },
    );
  }

  const { data, error } = await supabase
    .from("expenses")
    .select("id, created_at, date, amount, description")
    .order("date", { ascending: false });

  if (error) {
    return NextResponse.json({
      reply: `지출 데이터를 불러오지 못했어요. (${error.message})`,
      expense: null,
      type: "query",
    });
  }

  const expenses = (data ?? []) as ExpenseRow[];
  const prompt = buildStatsPrompt(today, message, expenses, history);
  const reply = (await generateWithGemini(apiKey, prompt, { temperature: 0.5 })).trim();

  return NextResponse.json({
    reply:
      reply ||
      "아직 답변을 만들지 못했어요. 질문을 조금만 다르게 다시 물어봐 주세요.",
    expense: null,
    type: "query",
  });
}

async function handleExpense(
  apiKey: string,
  message: string,
  history: ChatMessage[],
  today: string,
) {
  const prompt = buildExpensePrompt(today, message, history);
  const raw = await generateWithGemini(apiKey, prompt, { json: true });
  const parsed = extractJson(raw);

  const hasDate = typeof parsed.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(parsed.date);
  const hasAmount =
    typeof parsed.amount === "number" &&
    Number.isFinite(parsed.amount) &&
    parsed.amount > 0;
  const hasDescription = Boolean(parsed.description);

  if (parsed.need_more_info || !hasDate || !hasAmount || !hasDescription) {
    return NextResponse.json({
      reply:
        parsed.ask ||
        "날짜와 금액을 파악하지 못했어요. 예: 「오늘 점심 15000원」처럼 다시 알려주세요.",
      expense: null,
      type: "expense",
    });
  }

  const expense: ExpensePayload = {
    date: parsed.date!,
    amount: Math.round(parsed.amount!),
    description: parsed.description!,
  };

  const supabase = getSupabase();
  if (!supabase) {
    return NextResponse.json(
      {
        reply: "저장소 설정이 없어 기록하지 못했어요. 환경변수를 확인해 주세요.",
        expense: null,
        type: "expense",
      },
      { status: 500 },
    );
  }

  const { data, error } = await supabase
    .from("expenses")
    .insert({
      date: expense.date,
      amount: expense.amount,
      description: expense.description,
    })
    .select("id, created_at, date, amount, description")
    .single();

  if (error) {
    return NextResponse.json({
      reply: `분석은 완료했지만 저장에 실패했어요. (${error.message})`,
      expense: null,
      type: "expense",
    });
  }

  return NextResponse.json({
    reply: `${formatKoreanDate(expense.date)} ${expense.description} 지출 ${formatAmount(expense.amount)}원이 기록되었습니다.`,
    expense: data,
    parsed: expense,
    type: "expense",
  });
}

export async function POST(request: Request) {
  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "Gemini API 키가 설정되지 않았어요. 관리자에게 문의해 주세요." },
        { status: 500 },
      );
    }

    const body = (await request.json()) as {
      message?: string;
      history?: ChatMessage[];
    };

    const message = body.message?.trim();
    if (!message) {
      return NextResponse.json(
        { error: "메시지를 입력해 주세요." },
        { status: 400 },
      );
    }

    const history = Array.isArray(body.history) ? body.history : [];
    const today = todaySeoul();
    const intent = classifyIntent(message);

    if (intent === "query") {
      return await handleQuery(apiKey, message, history, today);
    }

    return await handleExpense(apiKey, message, history, today);
  } catch (error) {
    return NextResponse.json(
      { error: toFriendlyApiError(error) },
      { status: 500 },
    );
  }
}
