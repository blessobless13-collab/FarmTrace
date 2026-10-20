require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const QRCode = require("qrcode");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;
const BASE_URL = (process.env.BASE_URL || `http://localhost:${PORT}`).replace(/\/$/, "");

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

const stopSchema = new mongoose.Schema({
  place: { type: String, required: true, trim: true },
  time: { type: Date, default: Date.now },
  handler: { type: String, default: "Not specified", trim: true },
  note: { type: String, default: "", trim: true },
  distanceKm: { type: Number, default: 0, min: 0 }
}, { _id: true });

const batchSchema = new mongoose.Schema({
  batchId: { type: String, unique: true, index: true },
  vegetable: { type: String, required: true, trim: true },
  farm: { type: String, required: true, trim: true },
  farmer: { type: String, required: true, trim: true },
  quantity: { type: String, default: "1 crate" },
  status: { type: String, enum: ["At farm", "In transit", "At mandi", "At shop", "Delivered"], default: "At farm" },
  createdAt: { type: Date, default: Date.now },
  stops: [stopSchema]
});

const Batch = mongoose.model("Batch", batchSchema);

function makeBatchId() {
  return "FT-" + Date.now().toString(36).toUpperCase() + "-" + Math.random().toString(36).slice(2, 6).toUpperCase();
}

function safeBatch(batch) {
  return {
    batchId: batch.batchId,
    vegetable: batch.vegetable,
    farm: batch.farm,
    farmer: batch.farmer,
    quantity: batch.quantity,
    status: batch.status,
    createdAt: batch.createdAt,
    stops: batch.stops.map(s => ({
      _id: s._id, place: s.place, time: s.time, handler: s.handler,
      note: s.note, distanceKm: s.distanceKm
    }))
  };
}

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, database: mongoose.connection.readyState === 1 ? "connected" : "disconnected" });
});

app.get("/api/batches", async (_req, res) => {
  try {
    const batches = await Batch.find().sort({ createdAt: -1 }).limit(100);
    res.json(batches.map(safeBatch));
  } catch (err) {
    res.status(500).json({ error: "Could not load batches. Check MongoDB connection." });
  }
});

app.get("/api/batches/:id", async (req, res) => {
  try {
    const batch = await Batch.findOne({ batchId: req.params.id });
    if (!batch) return res.status(404).json({ error: "Batch not found." });
    res.json(safeBatch(batch));
  } catch (err) {
    res.status(500).json({ error: "Could not load this batch." });
  }
});

app.get("/api/batches/:id/qr", async (req, res) => {
  try {
    const batch = await Batch.findOne({ batchId: req.params.id });
    if (!batch) return res.status(404).json({ error: "Batch not found." });
    const url = `${BASE_URL}/track.html?id=${encodeURIComponent(batch.batchId)}`;
    const dataUrl = await QRCode.toDataURL(url, { width: 320, margin: 2, color: { dark: "#173b2b", light: "#ffffff" } });
    res.json({ url, dataUrl });
  } catch (err) {
    res.status(500).json({ error: "Could not generate QR code." });
  }
});

app.post("/api/batches", async (req, res) => {
  try {
    const { vegetable, farm, farmer, quantity } = req.body;
    if (![vegetable, farm, farmer].every(v => typeof v === "string" && v.trim())) {
      return res.status(400).json({ error: "Vegetable, farm and farmer are required." });
    }
    const batchId = makeBatchId();
    const batch = await Batch.create({
      batchId, vegetable: vegetable.trim(), farm: farm.trim(), farmer: farmer.trim(),
      quantity: (typeof quantity === "string" && quantity.trim()) ? quantity.trim() : "1 crate",
      status: "At farm",
      stops: [{ place: farm.trim(), handler: farmer.trim(), note: "Batch created at farm", distanceKm: 0, time: new Date() }]
    });
    res.status(201).json(safeBatch(batch));
  } catch (err) {
    res.status(500).json({ error: "Could not create batch. Make sure MongoDB is running." });
  }
});

app.post("/api/batches/:id/stops", async (req, res) => {
  try {
    const { place, handler, note, distanceKm, status } = req.body;
    if (typeof place !== "string" || !place.trim()) return res.status(400).json({ error: "Stop location is required." });
    const distance = Number(distanceKm || 0);
    if (!Number.isFinite(distance) || distance < 0) return res.status(400).json({ error: "Distance must be 0 or more." });
    const allowedStatuses = ["At farm", "In transit", "At mandi", "At shop", "Delivered"];
    const batch = await Batch.findOne({ batchId: req.params.id });
    if (!batch) return res.status(404).json({ error: "Batch not found." });
    batch.stops.push({
      place: place.trim(),
      handler: (typeof handler === "string" && handler.trim()) || "Not specified",
      note: (typeof note === "string" && note.trim()) || "",
      distanceKm: distance,
      time: new Date()
    });
    if (allowedStatuses.includes(status)) batch.status = status;
    await batch.save();
    res.json(safeBatch(batch));
  } catch (err) {
    res.status(500).json({ error: "Could not add journey stop." });
  }
});

app.get("/api/demo-seed", async (_req, res) => {
  try {
    const existing = await Batch.findOne({ batchId: "FT-DEMO-TOMATO-001" });
    if (existing) return res.json({ message: "Demo batch already exists.", batch: safeBatch(existing) });
    const now = Date.now();
    const batch = await Batch.create({
      batchId: "FT-DEMO-TOMATO-001", vegetable: "Tomato", farm: "Demo Farm, Chennai outskirts",
      farmer: "Demo Farmer", quantity: "1 crate", status: "At shop",
      createdAt: new Date(now - 5 * 60 * 60 * 1000),
      stops: [
        { place: "Demo Farm, Chennai outskirts", handler: "Farmer", note: "Harvested and tagged", distanceKm: 0, time: new Date(now - 5 * 60 * 60 * 1000) },
        { place: "Demo Mandi", handler: "Trader", note: "Batch received", distanceKm: 18, time: new Date(now - 3 * 60 * 60 * 1000) },
        { place: "Demo Supermarket", handler: "Shop staff", note: "Batch displayed for customers", distanceKm: 7, time: new Date(now - 1 * 60 * 60 * 1000) }
      ]
    });
    res.json({ message: "Demo batch created.", batch: safeBatch(batch) });
  } catch (err) {
    res.status(500).json({ error: "Could not create demo batch. Check MongoDB connection." });
  }
});

app.get("/api", (_req, res) => res.redirect("/index.html"));

async function start() {
  try {
    await mongoose.connect(process.env.MONGO_URI || "mongodb://127.0.0.1:27017/farmtrace");
    console.log("MongoDB connected");
  } catch (err) {
    console.error("MongoDB connection failed:", err.message);
    console.error("Check MONGO_URI in your .env file and ensure MongoDB is running.");
    process.exit(1);
  }
  app.listen(PORT, () => console.log(`FarmTrace running at http://localhost:${PORT}`));
}
start();
