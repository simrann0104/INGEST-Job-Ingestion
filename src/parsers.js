const { XMLParser } = require("fast-xml-parser");

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  textNodeName: "#text",
});

function parseRSSFeed(xmlText, sourceName) {
  if (!xmlText || typeof xmlText !== "string" || xmlText.trim().length === 0) {
    throw new Error(`Empty response body from ${sourceName}`);
  }

  let parsed;
  try {
    parsed = xmlParser.parse(xmlText);
  } catch (err) {
    throw new Error(`Malformed XML from ${sourceName}: ${err.message}`);
  }

  const channel = parsed?.rss?.channel;
  if (!channel) {
    throw new Error(`Unexpected feed shape from ${sourceName} - no <channel> found`);
  }

  let items = channel.item;
  if (!items) return [];
  if (!Array.isArray(items)) items = [items];

  return items.flatMap((item) => {
    try {
      const listing = normalizeRSSItem(item, sourceName);
      return listing ? [listing] : [];
    } catch {
      return [];
    }
  });
}

function normalizeRSSItem(item, sourceName) {
  const title = cleanText(textOf(item.title));
  const link = cleanUrl(textOf(item.link));
  if (!title || !link) return null;

  return {
    id: hashId(link),
    title,
    company: cleanText(extractCompany(title, item)) || "Unknown",
    location:
      cleanText(textOf(item.region)) ||
      cleanText(textOf(item.location)) ||
      cleanText(textOf(item.category)) ||
      "Not specified",
    url: link,
    postedAt: cleanText(textOf(item.pubDate)) || null,
    summary: truncate(cleanDescription(textOf(item.description)), 280),
    source: sourceName,
    fetchedAt: new Date().toISOString(),
  };
}

function parseJSONFeed(json, sourceName, mapFn) {
  if (!Array.isArray(json)) {
    if (Array.isArray(json?.jobs)) json = json.jobs;
    else if (Array.isArray(json?.data)) json = json.data;
    else throw new Error(`Unexpected JSON shape from ${sourceName}`);
  }

  const listings = [];
  for (const raw of json) {
    try {
      const listing = mapFn(raw, sourceName);
      if (
        listing &&
        listing.title &&
        listing.company &&
        listing.url &&
        /^https?:\/\//i.test(listing.url)
      ) {
        listings.push({
          ...listing,
          title: cleanText(listing.title),
          company: cleanText(listing.company),
          location: cleanText(listing.location || "Remote"),
          summary: truncate(cleanDescription(listing.summary || ""), 280),
        });
      }
    } catch {
      // One malformed item should never kill the whole batch.
    }
  }
  return listings;
}

function textOf(node) {
  if (node == null) return "";
  if (typeof node === "string") return node;
  if (typeof node === "number" || typeof node === "boolean") return String(node);
  if (typeof node === "object" && "#text" in node) return textOf(node["#text"]);
  return String(node);
}

function decodeEntities(str) {
  return String(str)
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([\da-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&apos;|&#39;/gi, "'")
    .replace(/&nbsp;/gi, " ");
}

function stripHtml(str) {
  return String(str)
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<\/p\s*>/gi, " ")
    .replace(/<[^>]*>/g, " ");
}

function repairMojibake(str) {
  const value = String(str || "");
  if (!/(?:Ã.|Â.|â[-¿]|ð[-¿])/.test(value)) return value;
  try {
    const repaired = Buffer.from(value, "latin1").toString("utf8");
    return repaired.includes("�") ? value : repaired;
  } catch {
    return value;
  }
}

function cleanText(str) {
  return decodeEntities(repairMojibake(String(str || "")))
    .replace(/[\uFFFD]/g, " ")
    .replace(/â€™|â€˜/g, "'")
    .replace(/â€œ|â€/g, '"')
    .replace(/â€“|â€”/g, "-")
    .replace(/â€¦/g, "...")
    .replace(/Â/g, "")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanDescription(str) {
  return cleanText(stripHtml(str))
    .replace(/\*{1,3}([^*]+)\*{1,3}/g, "$1")
    .replace(/_{1,3}([^_]+)_{1,3}/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanUrl(str) {
  const url = cleanText(str);
  return /^https?:\/\//i.test(url) ? url : "";
}

function truncate(str, len) {
  if (!str) return "";
  return str.length > len ? `${str.slice(0, len - 1)}…` : str;
}

function extractCompany(title, item) {
  const atMatch = title.match(/\bat\s+(.+)$/i);
  if (atMatch) return cleanText(atMatch[1]);

  const colonMatch = title.match(/^([^:]+):\s*/);
  if (colonMatch) return cleanText(colonMatch[1]);

  return cleanText(textOf(item["dc:creator"]));
}

function hashId(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i += 1) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
}

module.exports = { parseRSSFeed, parseJSONFeed, cleanText, cleanDescription };
