// backend/scripts/monitor-ready.js
// node backend/scripts/monitor-ready.js http://localhost:3000/health/ready
const url = process.argv[2];
if (!url) {
  console.error("Usage: node monitor-ready.js <healthReadyUrl>");
  process.exit(2);
}
async function main() {
  try {
    const r = await fetch(url, { method: "GET" });
    const txt = await r.text();
    if (!r.ok) {
      console.error("NOT READY", r.status, txt);
      process.exit(1);
    }
    console.log("READY", txt);
    process.exit(0);
  } catch (e) {
    console.error("NOT READY", e?.message || e);
    process.exit(1);
  }
}
main();
