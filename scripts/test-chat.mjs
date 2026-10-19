const res = await fetch("http://localhost:3000/api/chat", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    message: "어제 택시 탔는데 2만원 나왔어",
    history: [],
  }),
});

const text = await res.text();
console.log("STATUS", res.status);
console.log(text);
