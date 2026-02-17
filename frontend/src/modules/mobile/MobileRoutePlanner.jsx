
import React, { useState } from "react";

// Entrada simples: linhas no formato "label,lat,lng"
const sample = `Matriz,-1.4558,-48.5039
Ponto A,-1.4510,-48.4900
Ponto B,-1.4700,-48.4950
Ponto C,-1.4600,-48.5200`;

export default function MobileRoutePlanner() {
  const [text, setText] = useState(sample);
  const [result, setResult] = useState(null);

  const plan = async () => {
    const points = text
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean)
      .map((l, i) => {
        const [label, lat, lng] = l.split(",").map((x) => x.trim());
        return { id: String(i + 1), label, lat: Number(lat), lng: Number(lng) };
      });

    const res = await fetch("/mobile/routes/plan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ points, startIndex: 0 }),
    });
    const data = await res.json();
    setResult(data);
  };

  return (
    <div style={{ padding: 12 }}>
      <h2 style={{ margin: 0 }}>Planejamento de Rota (MOCK)</h2>
      <p style={{ marginTop: 6, color: "#666" }}>
        Heurística nearest-neighbor + distância Haversine. Endpoint: <code>/mobile/routes/plan</code>
      </p>

      <textarea value={text} onChange={(e) => setText(e.target.value)} rows={7} style={{ width: "100%", padding: 10 }} />

      <div style={{ marginTop: 10 }}>
        <button onClick={plan} style={{ padding: "10px 14px", cursor: "pointer" }}>Gerar rota</button>
      </div>

      <pre style={{ marginTop: 12, background: "#f5f5f5", padding: 10, borderRadius: 8 }}>
        {JSON.stringify(result, null, 2)}
      </pre>
    </div>
  );
}
