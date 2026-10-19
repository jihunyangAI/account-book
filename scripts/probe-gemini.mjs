import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split(/\r?\n/)
    .filter((line) => line && !line.startsWith("#") && line.includes("="))
    .map((line) => {
      const i = line.indexOf("=");
      return [line.slice(0, i), line.slice(i + 1)];
    }),
);

const key = env.GEMINI_API_KEY;
if (!key) {
  console.error("NO_KEY");
  process.exit(1);
}

const candidates = [
  "gemini-flash-latest",
  "gemini-3.5-flash",
  "gemini-3.6-flash",
  "gemini-3.8-flash",
  "gemini-3-flash-preview",
];

for (const model of candidates) {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: 'Reply JSON only: {"ok":true}' }] }],
        generationConfig: { responseMimeType: "application/json" },
      }),
    },
  );
  console.log(model, res.status);
  if (res.ok) {
    console.log("WIN", model);
    break;
  }
  const text = await res.text();
  console.log(text.slice(0, 160).replace(/\s+/g, " "));
}
