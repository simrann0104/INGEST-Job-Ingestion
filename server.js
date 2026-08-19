require("dotenv").config();
const express = require("express");
const path = require("path");
const { runIngestion, getRunLog } = require("./src/pipeline");

const app = express();
const PORT = process.env.PORT || 3000;

let lastResult = null;
let lastRunAt = null;
let inFlightRun = null;

app.use(express.static(path.join(__dirname, "public")));
app.get("/", (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});
async function runOnce() {
  if (!inFlightRun) {
    inFlightRun = runIngestion()
      .then((result) => {
        lastResult = result;
        lastRunAt = new Date().toISOString();
        return result;
      })
      .finally(() => {
        inFlightRun = null;
      });
  }
  return inFlightRun;
}

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    lastRunAt,
    status: lastResult?.status || "idle",
    source: lastResult?.source || null,
    listings: lastResult?.listings?.length || 0,
  });
});

app.get("/api/jobs", async (_req, res) => {
  try {
    const result = lastResult || (await runOnce());
    res.json({ ...result, lastRunAt });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/jobs/refresh", async (_req, res) => {
  if (inFlightRun) {
    return res.status(409).json({ error: "An ingestion run is already in progress" });
  }

  try {
    const result = await runOnce();
    res.json({ ...result, lastRunAt });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/runs", (_req, res) => {
  res.json({ runs: getRunLog() });
});

app.listen(PORT, () => {
  console.log(`Job ingestion service listening on :${PORT}`);
});
