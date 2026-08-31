"""GET /api/extras?location=... - map data + YouTube videos (assessment section 2.2)."""
import os
from urllib.parse import quote

import requests
from fastapi import APIRouter, Query
from services.geocode import resolve_location

router = APIRouter()


@router.get("/api/extras")
def extras(location: str | None = Query(None)):
    place = resolve_location(location)
    lat, lon, name = place["lat"], place["lon"], place["name"]

    bbox = "%2C".join(str(v) for v in (lon - 0.05, lat - 0.03, lon + 0.05, lat + 0.03))
    map_data = {
        "provider": "OpenStreetMap",
        "embedUrl": f"https://www.openstreetmap.org/export/embed.html?bbox={bbox}&layer=mapnik&marker={lat}%2C{lon}",
        "googleMapsUrl": f"https://www.google.com/maps/search/?api=1&query={lat}%2C{lon}",
        "latitude": lat, "longitude": lon,
    }

    short = name.split(",")[0]
    q = f"{short} travel guide"
    youtube = None
    key = os.environ.get("YOUTUBE_API_KEY")
    if key:
        try:
            res = requests.get("https://www.googleapis.com/youtube/v3/search",
                               params={"part": "snippet", "type": "video", "maxResults": 4, "q": q, "key": key},
                               timeout=10)
            if res.ok:
                youtube = {"mode": "api", "videos": [
                    {"title": v["snippet"]["title"], "channel": v["snippet"]["channelTitle"],
                     "thumbnail": v["snippet"].get("thumbnails", {}).get("medium", {}).get("url"),
                     "url": f"https://www.youtube.com/watch?v={v['id']['videoId']}"}
                    for v in res.json().get("items", [])]}
        except requests.RequestException:
            youtube = None
    if youtube is None:
        youtube = {"mode": "search-link",
                   "note": "Set YOUTUBE_API_KEY to fetch videos via the YouTube Data API.",
                   "searchUrl": f"https://www.youtube.com/results?search_query={quote(q)}"}

    return {"location": {"name": name, "latitude": lat, "longitude": lon}, "map": map_data, "youtube": youtube}
