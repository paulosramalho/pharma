import React, { useEffect, useMemo, useRef, useState } from "react";

function dataUrlToBase64(dataUrl) {
  const i = dataUrl.indexOf(",");
  return i >= 0 ? dataUrl.slice(i + 1) : dataUrl;
}

const DEFAULT_CHECKLIST = [
  { key: "package_ok", label: "Embalagem íntegra", required: true, ok: false },
  { key: "items_ok", label: "Itens conferidos com o cliente", required: true, ok: false },
  { key: "id_ok", label: "Confirmado nome/documento do recebedor", required: true, ok: false },
];

export default function MobilePOD() {
  const [deliveryId, setDeliveryId] = useState("");
  const [signerName, setSignerName] = useState("");
  const [note, setNote] = useState("");

  const [photoDataUrl, setPhotoDataUrl] = useState("");
  const [sigDataUrl, setSigDataUrl] = useState("");
  const [checklist, setChecklist] = useState(DEFAULT_CHECKLIST);
  const [status, setStatus] = useState(null);

  const [result, setResult] = useState(null);

  const canvasRef = useRef(null);
  const drawingRef = useRef(false);
  const lastRef = useRef({ x: 0, y: 0 });

  const canSubmit = useMemo(() => deliveryId.trim().length > 0, [deliveryId]);

  const refreshStatus = async () => {
    if (!deliveryId.trim()) return;
    const res = await fetch(`/mobile/pod/${encodeURIComponent(deliveryId)}/status`);
    const data = await res.json();
    setStatus(data);
  };

  useEffect(() => {
    setStatus(null);
    setResult(null);
    // não auto-fetch para evitar spam; mas se quiser, descomente:
    // refreshStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deliveryId]);

  const onPickPhoto = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const r = new FileReader();
    r.onload = () => setPhotoDataUrl(String(r.result || ""));
    r.readAsDataURL(f);
  };

  const clearSig = () => {
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext("2d");
    ctx.clearRect(0, 0, c.width, c.height);
    setSigDataUrl("");
  };

  const pointerPos = (evt) => {
    const c = canvasRef.current;
    const rect = c.getBoundingClientRect();
    const x = (evt.clientX - rect.left) * (c.width / rect.width);
    const y = (evt.clientY - rect.top) * (c.height / rect.height);
    return { x, y };
  };

  const onDown = (evt) => {
    drawingRef.current = true;
    lastRef.current = pointerPos(evt);
  };
  const onMove = (evt) => {
    if (!drawingRef.current) return;
    const c = canvasRef.current;
    const ctx = c.getContext("2d");
    const p = pointerPos(evt);
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(lastRef.current.x, lastRef.current.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    lastRef.current = p;
    setSigDataUrl(c.toDataURL("image/png"));
  };
  const onUp = () => {
    drawingRef.current = false;
  };

  const sendPhoto = async () => {
    setResult(null);
    const body = {
      imageBase64: photoDataUrl ? dataUrlToBase64(photoDataUrl) : null,
      mime: photoDataUrl.startsWith("data:image/png") ? "image/png" : "image/jpeg",
      note,
      deviceId: "dev-device",
    };
    const res = await fetch(`/mobile/pod/${encodeURIComponent(deliveryId)}/photo`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setResult(await res.json());
    await refreshStatus();
  };

  const sendSignature = async () => {
    setResult(null);
    const body = {
      signatureBase64: sigDataUrl ? dataUrlToBase64(sigDataUrl) : null,
      signerName,
      note,
      deviceId: "dev-device",
      markDelivered: false, // ✅ só marca no COMPLETE
    };
    const res = await fetch(`/mobile/pod/${encodeURIComponent(deliveryId)}/signature`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setResult(await res.json());
    await refreshStatus();
  };

  const toggleChecklist = (key) => {
    setChecklist((prev) => prev.map((i) => (i.key === key ? { ...i, ok: !i.ok } : i)));
  };

  const complete = async () => {
    setResult(null);
    const body = {
      requirePhoto: true,
      requireSignature: true,
      checklist,
      note,
      markDelivered: true,
    };
    const res = await fetch(`/mobile/pod/${encodeURIComponent(deliveryId)}/complete`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setResult(await res.json());
    await refreshStatus();
  };

  return (
    <div style={{ padding: 12, maxWidth: 760 }}>
      <h2 style={{ margin: 0 }}>Prova de Entrega (POD) — Guiado (MOCK)</h2>
      <p style={{ marginTop: 6, color: "#666" }}>
        Regras: <b>foto + assinatura + checklist</b>. Só marca <b>DELIVERED</b> quando clicar em <b>Concluir POD</b>.
      </p>

      <div style={{ display: "grid", gap: 10 }}>
        <label>
          <div style={{ fontSize: 12, color: "#666" }}>Delivery ID</div>
          <input value={deliveryId} onChange={(e) => setDeliveryId(e.target.value)} placeholder="82e933df-..." style={{ width: "100%", padding: 10 }} />
        </label>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button disabled={!canSubmit} onClick={refreshStatus} style={{ padding: "10px 14px", cursor: "pointer" }}>
            Atualizar status do POD
          </button>
          {status?.pod && (
            <div style={{ fontSize: 13, color: "#111" }}>
              <b>Foto:</b> {String(status.pod.hasPhoto)} | <b>Assinatura:</b> {String(status.pod.hasSignature)} | <b>Complete:</b> {String(status.pod.hasComplete)}
            </div>
          )}
        </div>

        <label>
          <div style={{ fontSize: 12, color: "#666" }}>Nome do recebedor</div>
          <input value={signerName} onChange={(e) => setSignerName(e.target.value)} placeholder="Ex.: João da Silva" style={{ width: "100%", padding: 10 }} />
        </label>

        <label>
          <div style={{ fontSize: 12, color: "#666" }}>Observação</div>
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Opcional" style={{ width: "100%", padding: 10 }} />
        </label>

        <div style={{ border: "1px solid #ddd", borderRadius: 8, padding: 10 }}>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>Checklist (obrigatório)</div>
          {checklist.map((i) => (
            <label key={i.key} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <input type="checkbox" checked={i.ok} onChange={() => toggleChecklist(i.key)} />
              <span>{i.label}{i.required ? " *" : ""}</span>
            </label>
          ))}
        </div>

        <div style={{ border: "1px solid #ddd", borderRadius: 8, padding: 10 }}>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>Foto (upload)</div>
          <input type="file" accept="image/*" onChange={onPickPhoto} />
          {photoDataUrl && (
            <div style={{ marginTop: 8 }}>
              <img src={photoDataUrl} alt="foto" style={{ maxWidth: "100%", borderRadius: 8 }} />
            </div>
          )}
          <button disabled={!canSubmit} onClick={sendPhoto} style={{ marginTop: 10, padding: "10px 14px", cursor: "pointer" }}>
            Enviar foto
          </button>
        </div>

        <div style={{ border: "1px solid #ddd", borderRadius: 8, padding: 10 }}>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>Assinatura (desenhar)</div>
          <canvas
            ref={canvasRef}
            width={640}
            height={220}
            style={{ width: "100%", border: "1px solid #eee", borderRadius: 8, touchAction: "none" }}
            onPointerDown={onDown}
            onPointerMove={onMove}
            onPointerUp={onUp}
            onPointerCancel={onUp}
            onPointerLeave={onUp}
          />
          <div style={{ marginTop: 10, display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button onClick={clearSig} style={{ padding: "10px 14px", cursor: "pointer" }}>Limpar</button>
            <button disabled={!canSubmit} onClick={sendSignature} style={{ padding: "10px 14px", cursor: "pointer" }}>
              Enviar assinatura
            </button>
          </div>
        </div>

        <div style={{ border: "1px solid #111827", borderRadius: 10, padding: 12 }}>
          <div style={{ fontWeight: 700, marginBottom: 6 }}>Concluir POD (valida tudo + marca DELIVERED)</div>
          <button disabled={!canSubmit} onClick={complete} style={{ padding: "12px 16px", cursor: "pointer" }}>
            Concluir POD
          </button>
          <div style={{ marginTop: 8, fontSize: 12, color: "#666" }}>
            Se faltar algo, o backend responde 422 com detalhes do que está pendente.
          </div>
        </div>

        <pre style={{ background: "#f5f5f5", padding: 10, borderRadius: 8 }}>
          {JSON.stringify(result, null, 2)}
        </pre>
      </div>
    </div>
  );
}
