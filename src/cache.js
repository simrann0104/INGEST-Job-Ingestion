const fs = require("fs");
const path = require("path");

const CACHE_DIR = path.join(__dirname, "..", "data");
const CACHE_FILE = path.join(CACHE_DIR, "last-known-good.json");

function ensureDir() {
  if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR, { recursive: true });
}

/**
 * Persist the last successful ingestion run. If every source fails on a given
 * run (site down, all rate-limited, etc.), we serve this instead of an empty
 * response so the pipeline degrades gracefully rather than going dark.
 */
function saveSnapshot(listings, meta) {
  ensureDir();
  const payload = { listings, meta, savedAt: new Date().toISOString() };
  fs.writeFileSync(CACHE_FILE, JSON.stringify(payload, null, 2));
}

function loadSnapshot() {
  try {
    const raw = fs.readFileSync(CACHE_FILE, "utf-8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

module.exports = { saveSnapshot, loadSnapshot };
