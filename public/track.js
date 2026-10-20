const container = document.querySelector("#track-content");
function escapeHtml(value = "") {
  return String(value).replace(/[&<>"']/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
}
function dateText(value) {
  return new Date(value).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}
function statusClass(status) { return status.toLowerCase().replace(/\s+/g, "-"); }
let lastLoadedBatchId = null;
async function loadTrack() {
  const id = new URLSearchParams(location.search).get("id");
  if (!id) {
    container.innerHTML = '<div class="error-box"><b>No batch ID found.</b><p>Scan a FarmTrace QR code or open the tracking link with a batch ID.</p><a href="/">Go to FarmTrace dashboard</a></div>';
    return;
  }
  try {
    const response = await fetch(`/api/batches/${encodeURIComponent(id)}`);
    const batch = await response.json();
    if (!response.ok) throw new Error(batch.error || "Could not find this batch.");
    lastLoadedBatchId = batch.batchId;
    const totalKm = batch.stops.reduce((sum, stop) => sum + Number(stop.distanceKm || 0), 0);
    container.innerHTML = `
      <div class="track-top"><div><span class="eyebrow">BATCH ${escapeHtml(batch.batchId)}</span><h2>🍅 ${escapeHtml(batch.vegetable)}</h2><p>Started ${escapeHtml(dateText(batch.createdAt))}</p></div><span class="status ${statusClass(batch.status)}">${escapeHtml(batch.status)}</span></div>
      <div class="track-meta"><div class="meta-chip">👨‍🌾 Farmer<b>${escapeHtml(batch.farmer)}</b></div><div class="meta-chip">📍 Starting farm<b>${escapeHtml(batch.farm)}</b></div><div class="meta-chip">📦 Quantity<b>${escapeHtml(batch.quantity)}</b></div><div class="meta-chip">🛣️ Recorded distance<b>${totalKm} km</b></div></div>
      <h3 class="timeline-title">The journey so far</h3>
      <div class="timeline">${batch.stops.map((stop, index) => `<div class="timeline-item"><span class="timeline-dot"></span><h3>${index === 0 ? "🌱 " : index === batch.stops.length - 1 ? "📍 " : "🚚 "}${escapeHtml(stop.place)}</h3><div class="time">${escapeHtml(dateText(stop.time))} · Handled by ${escapeHtml(stop.handler)}</div>${stop.note ? `<p>${escapeHtml(stop.note)}</p>` : ""}${index > 0 ? `<p>Approx. ${Number(stop.distanceKm || 0)} km from previous stop</p>` : ""}</div>`).join("")}</div>`;
  } catch (err) {
    container.innerHTML = `<div class="error-box"><b>Journey not available</b><p>${escapeHtml(err.message)}</p><a href="/">Open FarmTrace dashboard</a></div>`;
  }
}
loadTrack();


// Refresh the customer tracking page periodically so newly recorded stops appear
// without the customer having to reload the page. Each stop's timestamp is saved
// by the server when the farmer/trader adds it.
setInterval(() => {
  if (document.visibilityState === "visible" && lastLoadedBatchId) loadTrack();
}, 15000);
