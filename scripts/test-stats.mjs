const questions = [
  "이번 달 총 지출이 얼마야",
  "가장 많이 쓴 항목이 뭐야",
  "어제 뭐 샀더라",
];

for (const message of questions) {
  const res = await fetch("http://localhost:3000/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, history: [] }),
  });
  const text = await res.text();
  console.log("\nQ:", message);
  console.log("STATUS", res.status);
  console.log(text);
}
