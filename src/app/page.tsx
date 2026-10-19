"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";

type Expense = {
  id: number;
  created_at: string;
  date: string;
  amount: number;
  description: string;
};

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
};

function formatAmount(value: number) {
  return new Intl.NumberFormat("ko-KR").format(value);
}

export default function Home() {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "welcome",
      role: "assistant",
      content:
        "안녕하세요! 지출을 편하게 말씀해 주세요.\n예: 「오늘 커피 4500원」 「어제 점심 12000원」\n통계도 물어보세요: 「이번 달 총 지출이 얼마야」 「가장 많이 쓴 항목이 뭐야」",
    },
  ]);
  const [input, setInput] = useState("");
  const [loadingExpenses, setLoadingExpenses] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesRef = useRef<HTMLDivElement>(null);

  const loadExpenses = useCallback(async () => {
    try {
      const query = supabase
        .from("expenses")
        .select("id, created_at, date, amount, description")
        .order("created_at", { ascending: false });

      const timeout = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error("지출 내역 로딩이 지연되고 있습니다.")), 8000);
      });

      const { data, error: fetchError } = (await Promise.race([
        query,
        timeout,
      ])) as Awaited<typeof query>;

      if (fetchError) {
        setError(fetchError.message);
        setExpenses([]);
      } else {
        setExpenses((data ?? []) as Expense[]);
        setError(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "지출 내역을 불러오지 못했습니다.");
      setExpenses([]);
    } finally {
      setLoadingExpenses(false);
    }
  }, []);

  useEffect(() => {
    void loadExpenses();
  }, [loadExpenses]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, sending]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = input.trim();
    if (!text || sending) return;

    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: text,
    };

    const nextMessages = [...messages, userMessage];
    setMessages(nextMessages);
    setInput("");
    setSending(true);
    setError(null);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text,
          history: nextMessages
            .filter((item) => item.id !== "welcome")
            .map(({ role, content }) => ({ role, content })),
        }),
      });

      const data = (await response.json()) as {
        reply?: string;
        expense?: Expense | null;
        error?: string;
      };

      if (!response.ok) {
        throw new Error(
          data.error || "AI 처리 중 오류가 발생했어요. 잠시 후 다시 시도해 주세요.",
        );
      }

      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content:
            data.reply ||
            "날짜와 금액을 파악하지 못했어요. 예: 「오늘 점심 15000원」처럼 다시 알려주세요.",
        },
      ]);

      if (data.expense) {
        await loadExpenses();
      }
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : "AI 처리 중 오류가 발생했어요. 잠시 후 다시 시도해 주세요.";
      setError(message);
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: message,
        },
      ]);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="chat-app">
      <header className="chat-header">
        <h1 className="chat-title">AI가계부 챗봇</h1>
        <p className="chat-subtitle">말로 지출을 기록하세요</p>
      </header>

      <section className="expense-board" aria-label="저장된 지출 내역">
        <div className="expense-board-head">
          <h2>저장된 지출</h2>
          {!loadingExpenses && expenses.length > 0 ? (
            <p>
              {expenses.length}건 ·{" "}
              <strong>
                {formatAmount(expenses.reduce((sum, item) => sum + item.amount, 0))}원
              </strong>
            </p>
          ) : null}
        </div>

        {loadingExpenses ? (
          <p className="board-empty">불러오는 중...</p>
        ) : expenses.length === 0 ? (
          <p className="board-empty">아직 저장된 지출이 없습니다.</p>
        ) : (
          <ul className="expense-rail">
            {expenses.map((item) => (
              <li key={item.id} className="expense-chip">
                <p className="chip-desc">{item.description}</p>
                <p className="chip-amount">-{formatAmount(item.amount)}원</p>
                <p className="chip-date">{item.date}</p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <main className="chat-shell">
        <div className="chat-messages" ref={messagesRef}>
          {messages.map((message) => (
            <div
              key={message.id}
              className={`bubble-row ${message.role === "user" ? "is-user" : "is-ai"}`}
            >
              {message.role === "assistant" ? (
                <span className="avatar" aria-hidden>
                  AI
                </span>
              ) : null}
              <div className={`bubble ${message.role === "user" ? "bubble-user" : "bubble-ai"}`}>
                {message.content}
              </div>
            </div>
          ))}
          {sending ? (
            <div className="bubble-row is-ai">
              <span className="avatar" aria-hidden>
                AI
              </span>
              <div className="bubble bubble-ai bubble-typing">입력 중...</div>
            </div>
          ) : null}
          <div ref={messagesEndRef} />
        </div>

        {error ? <p className="chat-error">{error}</p> : null}

        <form className="composer" onSubmit={handleSubmit}>
          <input
            className="composer-input"
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="예: 오늘 점심 8,000원"
            disabled={sending}
            autoComplete="off"
          />
          <button className="composer-send" type="submit" disabled={sending || !input.trim()}>
            전송
          </button>
        </form>
      </main>
    </div>
  );
}
