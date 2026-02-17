
import React, { useEffect, useMemo, useState } from "react";

const OPTIONS = [
  { label: "Abertas (PENDING + OUT_FOR_DELIVERY)", value: "" },
  { label: "PENDING", value: "PENDING" },
  { label: "OUT_FOR_DELIVERY", value: "OUT_FOR_DELIVERY" },
  { label: "DELIVERED", value: "DELIVERED" },
  { label: "ALL", value: "ALL" },
];

export default function MobileDeliveries() {
  const [deliveries, setDeliveries] = useState([]);
  const [status, setStatus] = useState("");

  const url = useMemo(() => {
    const q = status ? `?status=${encodeURIComponent(status)}` : "";
    return `/mobile/deliveries${q}`;
  }, [status]);

  useEffect(() => {
    fetch(url)
      .then((res) => res.json())
      .then((data) => setDeliveries(data.deliveries || []));
  }, [url]);

  return (
    <div style={{ padding: 12 }}>
      <h2 style={{ margin: 0 }}>Entregas</h2>

      <div style={{ marginTop: 10 }}>
        <label style={{ fontSize: 12, color: "#666" }}>Filtro de status</label>
        <div>
          <select value={status} onChange={(e) => setStatus(e.target.value)} style={{ padding: 8, minWidth: 260 }}>
            {OPTIONS.map((o) => (
              <option key={o.label} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
      </div>

      <ul style={{ paddingLeft: 18, marginTop: 14 }}>
        {deliveries.map((d) => (
          <li key={d.id} style={{ marginBottom: 10 }}>
            <div><b>Entrega:</b> {d.id}</div>
            <div><b>Loja:</b> {d.store?.name} ({d.storeId})</div>
            <div><b>Venda:</b> #{d.sale?.number || d.saleId} — total: {String(d.sale?.total ?? "")}</div>
            <div><b>Status:</b> {d.status}</div>
          </li>
        ))}
      </ul>

      {deliveries.length === 0 && (
        <p style={{ color: "#666" }}>Nenhuma entrega encontrada para o filtro selecionado.</p>
      )}
    </div>
  );
}
