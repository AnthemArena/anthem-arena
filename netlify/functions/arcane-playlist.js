const YT = "https://www.googleapis.com/youtube/v3/";
const json = (statusCode, body, headers = {}) => ({
  statusCode,
  headers: { "Content-Type": "application/json", ...headers },
  body: JSON.stringify(body)
});

// Usage: ?playlistId=PL...   or   ?handle=theundercityedit&limit=12 (channel uploads)
export async function handler(event) {
  const apiKey = process.env.YOUTUBE_API_KEY_SERVER;
  const qs = event.queryStringParameters || {};
  let playlistId = qs.playlistId;
  const handle = (qs.handle || "").replace(/^@/, "");
  const limit = Math.min(Number(qs.limit) || 0, 200);
  if (!apiKey) return json(500, { error: "YouTube API key is not configured." });
  if (!playlistId && !handle) return json(400, { error: "playlistId or handle is required." });

  try {
    const call = async (path, params) => {
      const res = await fetch(YT + path + "?" + new URLSearchParams({ ...params, key: apiKey }));
      const data = await res.json();
      if (!res.ok || data.error) {
        const err = new Error(data.error?.message || "YouTube request failed.");
        err.status = res.status || 500;
        throw err;
      }
      return data;
    };

    let description = "";
    if (handle) {
      const ch = (await call("channels", { part: "contentDetails", forHandle: handle })).items?.[0];
      if (!ch) return json(404, { error: "YouTube channel not found." });
      playlistId = ch.contentDetails.relatedPlaylists.uploads;
    } else {
      const pl = (await call("playlists", { part: "snippet", id: playlistId })).items?.[0];
      if (!pl) return json(404, { error: "YouTube playlist not found." });
      description = pl.snippet?.description || "";
    }

    const items = [];
    let pageToken = "";
    do {
      const params = { part: "snippet", playlistId, maxResults: "50" };
      if (pageToken) params.pageToken = pageToken;
      const data = await call("playlistItems", params);
      for (const item of data.items || []) {
        const s = item.snippet || {};
        const title = s.title || "";
        // Skip private/deleted entries
        if (!s.resourceId?.videoId || title === "Private video" || title === "Deleted video") continue;
        const t = s.thumbnails || {};
        items.push({
          videoId: s.resourceId.videoId,
          title: title || "Arcane Moment",
          thumbnail: (t.high || t.medium || t.default || {}).url || "",
          publishedAt: s.publishedAt || ""
        });
      }
      pageToken = limit && items.length >= limit ? "" : data.nextPageToken || "";
    } while (pageToken);

    return json(200, { description, items: limit ? items.slice(0, limit) : items }, {
      "Cache-Control": "public, max-age=300, s-maxage=900"
    });
  } catch (e) {
    return json(e.status || 500, { error: e.message || "Unexpected error." });
  }
}