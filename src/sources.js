const { parseRSSFeed, parseJSONFeed } = require("./parsers");

/**
 * Public, low-risk sources for the assessment demo.
 * The first source is primary; later sources are used only when an earlier
 * source cannot provide usable listings.
 */
const SOURCES = [
  {
    name: "remoteok",
    kind: "json",
    priority: 1,
    url: "https://remoteok.com/api",
    parse: (body) => {
      const json = JSON.parse(body);
      return parseJSONFeed(json, "remoteok", (raw, sourceName) => {
        // RemoteOK may include metadata objects. Only accept complete job records.
        if (!raw || !raw.position || !raw.company || !raw.url) return null;

        const epoch = Number(raw.epoch);
        const postedAt = raw.date || (Number.isFinite(epoch) && epoch > 0
          ? new Date(epoch * 1000).toISOString()
          : null);

        return {
          id: String(raw.id || raw.slug || raw.url),
          title: raw.position,
          company: raw.company,
          location: raw.location || "Remote",
          url: raw.url,
          postedAt,
          summary: raw.description || "",
          source: sourceName,
          fetchedAt: new Date().toISOString(),
        };
      });
    },
  },
  {
    name: "weworkremotely-programming",
    kind: "rss",
    priority: 2,
    url: "https://weworkremotely.com/categories/remote-programming-jobs.rss",
    parse: (body) => parseRSSFeed(body, "weworkremotely-programming"),
  },
];

module.exports = { SOURCES };
