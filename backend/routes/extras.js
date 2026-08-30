import { Router } from "express";
import { resolveLocation } from "../services/geocode.js";

const router = Router();

/**
 * GET /api/extras?location=<anything>
 * Additional API integrations for a location (assessment section 2.2):
 * - Map data: OpenStreetMap embed URL (no key) + Google Maps link
 * - YouTube videos about the location (requires optional YOUTUBE_API_KEY env var;
 *   degrades gracefully to a search link when no key is configured)
 */
router.get("/", async (req, res, next) => {
  try {
    const place = await resolveLocation(req.query.location);
    const { lat, lon, name } = place;

    // Map data - works with zero configuration
    const bbox = [lon - 0.05, lat - 0.03, lon + 0.05, lat + 0.03].join("%2C");
    const map = {
      provider: "OpenStreetMap",
      embedUrl: `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${lat}%2C${lon}`,
      googleMapsUrl: `https://www.google.com/maps/search/?api=1&query=${lat}%2C${lon}`,
      latitude: lat,
      longitude: lon,
    };

    // YouTube - real API when a key is present, graceful fallback when not
    const shortName = name.split(",")[0];
    let youtube;
    const key = process.env.YOUTUBE_API_KEY;
    if (key) {
      const yt = await fetch(
        `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&maxResults=4&q=${encodeURIComponent(
          shortName + " travel guide"
        )}&key=${key}`
      );
      if (yt.ok) {
        const data = await yt.json();
        youtube = {
          mode: "api",
          videos: (data.items || []).map((v) => ({
            title: v.snippet.title,
            channel: v.snippet.channelTitle,
            thumbnail: v.snippet.thumbnails?.medium?.url,
            url: `https://www.youtube.com/watch?v=${v.id.videoId}`,
          })),
        };
      }
    }
    if (!youtube) {
      youtube = {
        mode: "search-link",
        note: "Set YOUTUBE_API_KEY in backend/.env to fetch videos via the YouTube Data API.",
        searchUrl: `https://www.youtube.com/results?search_query=${encodeURIComponent(
          shortName + " travel guide"
        )}`,
      };
    }

    res.json({ location: { name, latitude: lat, longitude: lon }, map, youtube });
  } catch (err) {
    next(err);
  }
});

export default router;
