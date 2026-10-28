require("dotenv").config();
const express = require("express");
const cors = require("cors");
const supabase = require("./supabase");

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const RESOURCE_TYPES = ["Notes", "Question Paper", "Lab Manual", "Reference", "Presentation", "Other"];
const MAX_LIMIT = 100;

const configuredOrigins = (process.env.CORS_ORIGIN || "")
  .split(",").map(origin => origin.trim()).filter(Boolean);
app.use(cors({
  origin(origin, callback) {
    // Requests without Origin include curl and same-origin clients.
    if (!origin || configuredOrigins.length === 0 || configuredOrigins.includes(origin)) return callback(null, true);
    return callback(new Error("Origin is not allowed by CORS configuration."));
  }
}));
app.use(express.json({ limit: "32kb" }));

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", service: "study-material-sharing-hub-api" });
});

function cleanString(value, field, { required = false, max = 255 } = {}) {
  if (value === undefined || value === null) {
    if (required) throw new Error(`${field} is required.`);
    return null;
  }
  if (typeof value !== "string") throw new Error(`${field} must be text.`);
  const clean = value.trim();
  if (required && !clean) throw new Error(`${field} is required.`);
  if (clean.length > max) throw new Error(`${field} must be ${max} characters or fewer.`);
  return clean || null;
}
function validatePayload(body, partial = false) {
  const payload = {};
  const fields = [
    ["title", { required: !partial, max: 140 }],
    ["subject", { required: !partial, max: 80 }],
    ["resource_type", { required: !partial, max: 40 }],
    ["semester", { required: false, max: 40 }],
    ["author_name", { required: !partial, max: 80 }],
    ["description", { required: false, max: 600 }]
  ];
  for (const [field, options] of fields) {
    if (partial && body[field] === undefined) continue;
    payload[field] = cleanString(body[field], field, options);
  }
  if (!partial || body.resource_url !== undefined) {
    const urlText = cleanString(body.resource_url, "resource_url", { required: true, max: 2048 });
    let url;
    try { url = new URL(urlText); } catch { throw new Error("resource_url must be a valid URL."); }
    if (!["http:", "https:"].includes(url.protocol)) throw new Error("resource_url must use HTTP or HTTPS.");
    payload.resource_url = url.href;
  }
  if (payload.resource_type && !RESOURCE_TYPES.includes(payload.resource_type)) {
    throw new Error(`resource_type must be one of: ${RESOURCE_TYPES.join(", ")}.`);
  }
  if (payload.title && payload.title.length < 3) throw new Error("title must be at least 3 characters.");
  if (partial && Object.keys(payload).length === 0) throw new Error("Provide at least one field to update.");
  return payload;
}
function parseLimit(value) {
  if (value === undefined) return 50;
  const limit = Number(value);
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT) return null;
  return limit;
}
function sendDatabaseError(res, error, operation) {
  console.error(`Supabase ${operation} failed:`, error.message || error);
  return res.status(500).json({
    error: "The database request failed. Check the Supabase schema, API key, and database policies."
  });
}

app.get("/api/materials", async (req, res) => {
  const limit = parseLimit(req.query.limit);
  if (limit === null) return res.status(400).json({ error: `limit must be an integer from 1 to ${MAX_LIMIT}.` });
  let query = supabase.from("materials").select("id,title,subject,resource_type,semester,author_name,resource_url,description,created_at,updated_at")
    .order("created_at", { ascending: false }).limit(limit);
  if (req.query.subject) {
    if (typeof req.query.subject !== "string" || req.query.subject.length > 80) return res.status(400).json({ error: "subject must be text up to 80 characters." });
    query = query.eq("subject", req.query.subject.trim());
  }
  if (req.query.type) {
    if (typeof req.query.type !== "string" || !RESOURCE_TYPES.includes(req.query.type)) return res.status(400).json({ error: "Invalid resource type." });
    query = query.eq("resource_type", req.query.type);
  }
  const { data, error } = await query;
  if (error) return sendDatabaseError(res, error, "list materials");
  return res.json({ data, count: data.length });
});

app.get("/api/materials/:id", async (req, res) => {
  const { data, error } = await supabase.from("materials")
    .select("id,title,subject,resource_type,semester,author_name,resource_url,description,created_at,updated_at")
    .eq("id", req.params.id).maybeSingle();
  if (error) return sendDatabaseError(res, error, "get material");
  if (!data) return res.status(404).json({ error: "Material not found." });
  return res.json({ data });
});

app.post("/api/materials", async (req, res) => {
  let payload;
  try { payload = validatePayload(req.body); }
  catch (error) { return res.status(400).json({ error: error.message }); }
  const { data, error } = await supabase.from("materials").insert(payload)
    .select("id,title,subject,resource_type,semester,author_name,resource_url,description,created_at,updated_at").single();
  if (error) return sendDatabaseError(res, error, "create material");
  return res.status(201).json({ data });
});

app.patch("/api/materials/:id", async (req, res) => {
  let payload;
  try { payload = validatePayload(req.body, true); }
  catch (error) { return res.status(400).json({ error: error.message }); }
  const { data, error } = await supabase.from("materials").update(payload)
    .eq("id", req.params.id)
    .select("id,title,subject,resource_type,semester,author_name,resource_url,description,created_at,updated_at").maybeSingle();
  if (error) return sendDatabaseError(res, error, "update material");
  if (!data) return res.status(404).json({ error: "Material not found or not editable under the current database policy." });
  return res.json({ data });
});

app.delete("/api/materials/:id", async (req, res) => {
  const { data, error } = await supabase.from("materials").delete().eq("id", req.params.id).select("id").maybeSingle();
  if (error) return sendDatabaseError(res, error, "delete material");
  if (!data) return res.status(404).json({ error: "Material not found or not deletable under the current database policy." });
  return res.status(200).json({ message: "Material deleted.", id: data.id });
});

app.use((req, res) => res.status(404).json({ error: "Route not found." }));
app.use((err, _req, res, _next) => {
  if (err instanceof SyntaxError && "body" in err) return res.status(400).json({ error: "Request body must be valid JSON." });
  if (err.message === "Origin is not allowed by CORS configuration.") return res.status(403).json({ error: err.message });
  console.error("Unhandled request error:", err.message || err);
  return res.status(500).json({ error: "Unexpected server error." });
});

app.listen(PORT, () => console.log(`StudyShare API listening at http://localhost:${PORT}`));
