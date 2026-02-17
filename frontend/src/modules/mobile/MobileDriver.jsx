
import React, { useEffect, useRef, useState } from "react";

export default function MobileDriver() {
  const [enabled, setEnabled] = useState(false);
  const [last, setLast] = useState(null);
  const timerRef = useRef(null);

  useEffect(() => {
    if (!enabled) {
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = null;
      return;
    }

    const sendPing = () => {
      if (!navigator.geolocation) {
        setLast({ error: "Geolocation não suportado" });
        return;
      }

      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const payload = {
            deviceId: "dev-device",
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            accuracy: pos.coords.accuracy,
            speed: pos.coords.speed,
            heading: pos.coords.heading,
          };

          fetch("/mobile/telemetry/location", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          })
            .then(() => setLast({ ok: true, ...payload, at: new Date().toISOString() }))
            .catch((e) => setLast({ error: String(e) }));
        },
        (err) => setLast({ error: err.message }),
        { enableHighAccuracy: true, timeout: 8000, maximumAge: 5000 }
      );
    };

    sendPing();
    timerRef.current = setInterval(sendPing, 10000);
    return () => timerRef.current && clearInterval(timerRef.current);
  }, [enabled]);

  return (
    <div style={{ padding: 12 }}>
      <h2 style={{ margin: 0 }}>Motorista (DEV) — Geolocalização</h2>
      <p style={{ marginTop: 6, color: "#666" }}>
        Envia ping a cada 10s para <code>/mobile/telemetry/location</code> (grava em AuditLog).
      </p>

      <button onClick={() => setEnabled((v) => !v)} style={{ padding: "10px 14px", cursor: "pointer" }}>
        {enabled ? "Parar" : "Iniciar"}
      </button>

      <pre style={{ marginTop: 12, background: "#f5f5f5", padding: 10, borderRadius: 8 }}>
        {JSON.stringify(last, null, 2)}
      </pre>
    </div>
  );
}
