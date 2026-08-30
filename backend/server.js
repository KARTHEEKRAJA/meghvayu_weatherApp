import express from "express";
import cors from "cors";
import weatherRoutes from "./routes/weather.js";
import recordRoutes from "./routes/records.js";
import exportRoutes from "./routes/export.js";
import extrasRoutes from "./routes/extras.js";

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());

// Health check
app.get("/api/health", (req, res) =>
  res.json({ status: "ok", service: "weather-app-backend", time: new Date().toISOString() })
);

app.use("/api/weather", weatherRoutes);
app.use("/api/records", recordRoutes);
app.use("/api/export", exportRoutes);
app.use("/api/extras", extrasRoutes);

// 404 for unknown API routes
app.use((req, res) => res.status(404).json({ error: `Not found: ${req.method} ${req.path}` }));

// Central error handler - every thrown error becomes a clean JSON response
app.use((err, req, res, next) => {
  const status = err.status || 500;
  const message =
    status === 500 ? "Internal server error. Please try again." : err.message;
  if (status === 500) console.error(err);
  res.status(status).json({ error: message });
});

app.listen(PORT, () =>
  console.log(`Weather backend running at http://localhost:${PORT}`)
);
