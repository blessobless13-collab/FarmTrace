const $ = (s) => document.querySelector(s);
const form = $("#batch-form");
const message = $("#form-message");
const rows = $("#batch-rows");
let batches = [];
let currentQr = null;

async function api(url, options = {}) {
  const response = await fetch(url, {
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Something went wrong.");
  return data;
}
function escapeHtml(value = "") {
  return String(value).replace(/[&<>"']/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
}
function dateText(value) {
  return new Date(value).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}
function statusClass(status) { return status.toLowerCase().replace(/\s+/g, "-"); }

function renderStats() {
  $("#stat-total").textContent = batches.length;
  $("#stat-transit").textContent = batches.filter(b => b.status === "In transit").length;
  $("#stat-delivered").textContent = batches.filter(b => ["At shop", "Delivered"].includes(b.status)).length;
  $("#stat-farmers").textContent = new Set(batches.map(b => b.farmer.toLowerCase())).size;
}
function renderBatches() {
  if (!batches.length) {
    rows.innerHTML = '<tr><td colspan="5" class="empty">No batch records yet.</td></tr>';
    $("#empty-state").classList.remove("hidden");
    return;
  }
  $("#empty-state").classList.add("hidden");
  rows.innerHTML = batches.map(b => `
    <tr>
      <td><strong>${escapeHtml(b.vegetable)} <small>· ${escapeHtml(b.batchId)}</small></strong><small>Created ${escapeHtml(dateText(b.createdAt))}</small></td>
      <td><strong>${escapeHtml(b.farmer)}</strong><small>${escapeHtml(b.farm)}</small></td>
      <td><span class="status ${statusClass(b.status)}">${escapeHtml(b.status)}</span></td>
      <td><strong>${b.stops.length} stop${b.stops.length === 1 ? "" : "s"}</strong><small>${escapeHtml(b.quantity)}</small></td>
      <td><div class="table-actions"><button class="mini-btn" data-qr="${escapeHtml(b.batchId)}">QR code</button><button class="mini-btn" data-track="${escapeHtml(b.batchId)}">Update</button></div></td>
    </tr>`).join("");
  rows.querySelectorAll("[data-qr]").forEach(btn => btn.addEventListener("click", () => showQr(btn.dataset.qr)));
  rows.querySelectorAll("[data-track]").forEach(btn => btn.addEventListener("click", () => showUpdatePrompt(btn.dataset.track)));
}
async function loadBatches() {
  rows.innerHTML = '<tr><td colspan="5" class="empty">Loading batches…</td></tr>';
  try {
    batches = await api("/api/batches");
    renderStats(); renderBatches();
  } catch (err) {
    rows.innerHTML = `<tr><td colspan="5" class="empty">${escapeHtml(err.message)} Check the server and MongoDB.</td></tr>`;
  }
}
async function showQr(id) {
  try {
    const result = await api(`/api/batches/${encodeURIComponent(id)}/qr`);
    currentQr = result;
    $("#qr-image").src = result.dataUrl;
    $("#qr-batch-id").textContent = id;
    $("#qr-open").href = result.url;
    $("#qr-placeholder").classList.add("hidden");
    $("#qr-result").classList.remove("hidden");
    document.querySelector(".qr-panel").scrollIntoView({ behavior: "smooth", block: "center" });
  } catch (err) { toast(err.message); }
}
function showUpdatePrompt(id) {
  const b = batches.find(item => item.batchId === id);
  if (!b) return;
  const place = prompt("Next stop location (e.g. Chennai Mandi):");
  if (!place || !place.trim()) return;
  const handler = prompt("Who handled the batch? Use a role/name only (no phone numbers):", "Trader") || "Not specified";
  const note = prompt("What happened at this stop?", "Batch received") || "";
  const distanceInput = prompt("Approximate distance from last stop in km (number):", "5");
  if (distanceInput === null) return;
  const distanceKm = Number(distanceInput);
  if (!Number.isFinite(distanceKm) || distanceKm < 0) return toast("Distance must be a valid number of 0 or more.");
  const statuses = ["At farm", "In transit", "At mandi", "At shop", "Delivered"];
  const suggested = b.status === "At farm" ? "In transit" : b.status === "In transit" ? "At mandi" : b.status === "At mandi" ? "At shop" : "Delivered";
  const status = prompt(`New status (${statuses.join(" / ")}):`, suggested);
  if (!status || !statuses.includes(status)) return toast("Update cancelled or status was not valid.");
  api(`/api/batches/${encodeURIComponent(id)}/stops`, { method: "POST", body: JSON.stringify({ place, handler, note, distanceKm, status }) })
    .then(() => { toast("Journey updated."); loadBatches(); })
    .catch(err => toast(err.message));
}
form.addEventListener("submit", async event => {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(form).entries());
  message.textContent = "Creating batch…"; message.classList.remove("error");
  const submit = form.querySelector("button[type=submit]"); submit.disabled = true;
  try {
    const batch = await api("/api/batches", { method: "POST", body: JSON.stringify(data) });
    message.textContent = `Created ${batch.batchId} successfully!`;
    form.reset(); form.elements.quantity.value = "1 crate";
    await loadBatches(); await showQr(batch.batchId);
  } catch (err) {
    message.textContent = err.message; message.classList.add("error");
  } finally { submit.disabled = false; }
});
$("#refresh-btn").addEventListener("click", loadBatches);
$("#qr-download").addEventListener("click", () => {
  if (!currentQr) return;
  const a = document.createElement("a"); a.href = currentQr.dataUrl; a.download = "farmtrace-" + $("#qr-batch-id").textContent + ".png"; a.click();
});
async function seedDemo() {
  try { const result = await api("/api/demo-seed"); toast(result.message); await loadBatches(); await showQr(result.batch.batchId); }
  catch (err) { toast(err.message); }
}
$("#seed-btn").addEventListener("click", seedDemo);
$("#seed-link").addEventListener("click", seedDemo);
function toast(text) {
  const el = $("#toast"); el.textContent = text; el.classList.add("show");
  clearTimeout(window.toastTimeout); window.toastTimeout = setTimeout(() => el.classList.remove("show"), 3200);
}
loadBatches();
