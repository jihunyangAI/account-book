"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type Expense = {
  id: number;
  created_at: string;
  date: string;
  amount: number;
  description: string;
};

function today() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function formatAmount(value: number) {
  return new Intl.NumberFormat("ko-KR").format(value);
}

function formatAmountInput(value: string) {
  const digits = value.replace(/\D/g, "");
  if (!digits) return "";
  return formatAmount(Number(digits));
}

export default function Home() {
  const [date, setDate] = useState("");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadExpenses = useCallback(async () => {
    setError(null);
    const { data, error: fetchError } = await supabase
      .from("expenses")
      .select("id, created_at, date, amount, description")
      .order("created_at", { ascending: false });

    if (fetchError) {
      setError(fetchError.message);
      setExpenses([]);
    } else {
      setExpenses((data ?? []) as Expense[]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    setDate(today());
    void loadExpenses();
  }, [loadExpenses]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const parsedAmount = Number(amount.replace(/,/g, ""));
    if (!date || !description.trim() || !Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      return;
    }

    setSaving(true);
    setError(null);

    const { error: insertError } = await supabase.from("expenses").insert({
      date,
      amount: parsedAmount,
      description: description.trim(),
    });

    if (insertError) {
      setError(insertError.message);
      setSaving(false);
      return;
    }

    setAmount("");
    setDescription("");
    setDate(today());
    await loadExpenses();
    setSaving(false);
  }

  const total = expenses.reduce((sum, item) => sum + item.amount, 0);

  return (
    <div className="page">
      <header className="header">
        <p className="brand-mark">Account Book</p>
        <h1 className="title">나의 AI가계부</h1>
        <p className="subtitle">날짜·금액·내용을 입력하고 바로 기록하세요.</p>
      </header>

      <main className="main">
        <form className="form" onSubmit={handleSubmit}>
          <div className="field-grid">
            <label className="field">
              <span className="label">날짜</span>
              <input
                className="input"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                required
              />
            </label>

            <label className="field">
              <span className="label">금액</span>
              <div className="amount-wrap">
                <input
                  className="input amount-input"
                  type="text"
                  inputMode="numeric"
                  placeholder="1,000"
                  value={amount}
                  onChange={(e) => setAmount(formatAmountInput(e.target.value))}
                  required
                />
                <span className="currency">원</span>
              </div>
            </label>
          </div>

          <label className="field">
            <span className="label">내용</span>
            <input
              className="input"
              type="text"
              placeholder="예: 점심식사, 교통비, 커피"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              required
              maxLength={80}
            />
          </label>

          <button className="submit" type="submit" disabled={saving}>
            {saving ? "저장 중..." : "저장하기"}
          </button>
        </form>

        {error ? <p className="error-banner">{error}</p> : null}

        <section className="ledger" aria-live="polite">
          <div className="ledger-head">
            <h2>지출 내역</h2>
            <p>
              합계 <strong>{formatAmount(total)}</strong>원
            </p>
          </div>

          {loading ? (
            <p className="empty">불러오는 중...</p>
          ) : expenses.length === 0 ? (
            <p className="empty">아직 저장된 지출이 없습니다.</p>
          ) : (
            <ul className="expense-cards">
              {expenses.map((item) => (
                <li key={item.id} className="expense-card">
                  <div className="expense-card-top">
                    <p className="expense-desc">{item.description}</p>
                    <p className="expense-amount">-{formatAmount(item.amount)}원</p>
                  </div>
                  <p className="expense-date">{item.date}</p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </div>
  );
}
