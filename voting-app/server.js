import express from "express";
import multer from "multer";
import cors from "cors";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

const PORT = 3400;
import { networkInterfaces } from "os";
var localIP = "localhost";
try {
  var nets = networkInterfaces();
  for (var name of Object.keys(nets)) {
    for (var net of nets[name]) {
      if (net.family === "IPv4" && !net.internal && (net.address.startsWith("192.") || net.address.startsWith("10.") || net.address.startsWith("172."))) {
        localIP = net.address;
        break;
      }
    }
    if (localIP !== "localhost") break;
  }
} catch(e) {}
console.log("Local IP:", localIP);

const DATA_FILE = path.join(__dirname, "data", "db.json");

app.use(cors());
app.use(express.json({ limit: "10mb" }));
app.use(express.static(path.join(__dirname, "public")));
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

const storage = multer.diskStorage({
  destination: path.join(__dirname, "uploads"),
  filename: (req, file, cb) => {
    const prefix = req.params.surveyId + "_" + (req.params.profileId || "p") + "_";
    const ext = path.extname(file.originalname) || ".jpg";
    cb(null, prefix + ext);
  },
});
const upload = multer({ storage, limits: { fileSize: 5 * 1024 * 1024 } });

function readDB() {
  if (!fs.existsSync(DATA_FILE)) return { surveys: [], votes: [] };
  return JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
}
function writeDB(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), "utf8");
}
function getCodes() {
  return JSON.parse(fs.readFileSync(path.join(__dirname, "codes.json"), "utf8"));
}
function genId() {
  return Date.now().toString(36) + Math.random().toString(36).substring(2, 6);
}

// Auth
app.use("/api", (req, res, next) => {
  if (req.path === "/login" || req.path === "/host" || req.path.startsWith("/s/")) return next();
  const code = req.headers["x-user-code"];
  if (!code) return res.status(401).json({ error: "\u672a\u767b\u5f55" });
  const codes = getCodes();
  if (!codes[code]) return res.status(401).json({ error: "\u65e0\u6548\u767b\u5f55\u7801" });
  req.userCode = code;
  req.user = codes[code];
  next();
});

app.post("/api/login", (req, res) => {
  const { code } = req.body;
  if (!code) return res.status(400).json({ error: "\u8bf7\u8f93\u5165\u767b\u5f55\u7801" });
  const codes = getCodes();
  if (!codes[code]) return res.status(401).json({ error: "\u767b\u5f55\u7801\u65e0\u6548" });
  res.json({ success: true, code, name: codes[code].name, role: codes[code].role });
});

app.get("/api/surveys", (req, res) => {
  if (req.user.role !== "admin") return res.status(403).json({ error: "\u4ec5\u7ba1\u7406\u5458" });
  res.json(readDB().surveys);
});

app.post("/api/surveys", (req, res) => {
  if (req.user.role !== "admin") return res.status(403).json({ error: "\u4ec5\u7ba1\u7406\u5458" });
  const db = readDB();
  const id = genId();
  const survey = {
    id, shareId: id, title: "\u65b0\u95ee\u5377", createdBy: req.userCode,
    status: "draft", introText: "",
    options: { A: "", B: "", C: "", D: "", E: "" },
    profiles: [{ id: genId(), name: "\u4eba\u90091", introText: "" }],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    publishedAt: null,
  };
  db.surveys.push(survey);
  writeDB(db);
  res.json(survey);
});

app.get("/api/surveys/:id", (req, res) => {
  if (req.user.role !== "admin") return res.status(403).json({ error: "\u4ec5\u7ba1\u7406\u5458" });
  const db = readDB();
  const s = db.surveys.find((x) => x.id === req.params.id);
  if (!s) return res.status(404).json({ error: "\u672a\u627e\u5230" });
  const voteCount = db.votes.filter((v) => v.surveyId === s.id).length;
  res.json({ survey: s, voteCount });
});

app.put("/api/surveys/:id", (req, res) => {
  if (req.user.role !== "admin") return res.status(403).json({ error: "\u4ec5\u7ba1\u7406\u5458" });
  const db = readDB();
  const idx = db.surveys.findIndex((x) => x.id === req.params.id);
  if (idx < 0) return res.status(404).json({ error: "\u672a\u627e\u5230" });
  const { title, introText, options, profiles } = req.body;
  if (title !== undefined) db.surveys[idx].title = title;
  if (introText !== undefined) db.surveys[idx].introText = introText;
  if (options !== undefined) db.surveys[idx].options = options;
  if (profiles !== undefined) db.surveys[idx].profiles = profiles;
  db.surveys[idx].updatedAt = new Date().toISOString();
  writeDB(db);
  res.json(db.surveys[idx]);
});

app.delete("/api/surveys/:id", (req, res) => {
  if (req.user.role !== "admin") return res.status(403).json({ error: "\u4ec5\u7ba1\u7406\u5458" });
  const db = readDB();
  db.surveys = db.surveys.filter((x) => x.id !== req.params.id);
  db.votes = db.votes.filter((v) => v.surveyId !== req.params.id);
  writeDB(db);
  res.json({ success: true });
});

app.get("/api/host", (req, res) => { res.json({ ip: localIP, port: PORT, url: "http://" + localIP + ":" + PORT }); });

app.post("/api/surveys/:id/publish", (req, res) => {
  if (req.user.role !== "admin") return res.status(403).json({ error: "\u4ec5\u7ba1\u7406\u5458" });
  const db = readDB();
  const idx = db.surveys.findIndex((x) => x.id === req.params.id);
  if (idx < 0) return res.status(404).json({ error: "\u672a\u627e\u5230" });
  db.surveys[idx].status = "published";
  db.surveys[idx].publishedAt = new Date().toISOString();
  writeDB(db);
  const link = req.protocol + "://" + req.get("host") + "/#vote/" + db.surveys[idx].shareId;
  res.json({ success: true, link, survey: db.surveys[idx] });
});

app.post("/api/upload-avatar/:surveyId/:profileId", (req, res) => {
  upload.single("avatar")(req, res, (err) => {
    if (err) return res.status(400).json({ error: "\u4e0a\u4f20\u5931\u8d25: " + err.message });
    if (!req.file) return res.status(400).json({ error: "\u8bf7\u9009\u62e9\u56fe\u7247" });
    res.json({ success: true, url: "/uploads/" + req.file.filename });
  });
});

app.get("/api/s/:shareId", (req, res) => {
  const db = readDB();
  const s = db.surveys.find((x) => x.shareId === req.params.shareId && x.status === "published");
  if (!s) return res.status(404).json({ error: "\u95ee\u5377\u4e0d\u5b58\u5728\u6216\u672a\u53d1\u5e03" });
  const profiles = (s.profiles || []).map((p) => {
    const ap = path.join(__dirname, "uploads", s.id + "_" + p.id + ".jpg");
    const has = fs.existsSync(ap) || fs.existsSync(ap.replace(".jpg", ".png"));
    return { id: p.id, name: p.name, introText: p.introText, hasAvatar: has };
  });
  res.json({ id: s.shareId, title: s.title, profiles, options: s.options, publishedAt: s.publishedAt });
});

app.post("/api/s/:shareId/vote", (req, res) => {
  const { code, votes } = req.body;
  if (!code) return res.status(400).json({ error: "\u8bf7\u8f93\u5165\u767b\u5f55\u7801" });
  if (!votes || !votes.length) return res.status(400).json({ error: "\u8bf7\u81f3\u5c11\u6295\u7968\u4e00\u4eba" });
  const codes = getCodes();
  if (!codes[code]) return res.status(401).json({ error: "\u767b\u5f55\u7801\u65e0\u6548" });
  const db = readDB();
  const s = db.surveys.find((x) => x.shareId === req.params.shareId && x.status === "published");
  if (!s) return res.status(404).json({ error: "\u95ee\u5377\u4e0d\u5b58\u5728" });
  for (const v of votes) {
    db.votes = db.votes.filter((x) => !(x.surveyId === s.id && x.code === code && x.profileId === v.profileId));
    if (v.option) {
      db.votes.push({ surveyId: s.id, surveyTitle: s.title, profileId: v.profileId, code, name: codes[code].name, option: v.option, optionText: v.optionText || "", votedAt: new Date().toISOString() });
    }
  }
  writeDB(db);
  res.json({ success: true });
});

app.post("/api/s/:shareId/check-vote", (req, res) => {
  const { code } = req.body;
  if (!code) return res.json({ voted: false, votes: [] });
  const db = readDB();
  const s = db.surveys.find((x) => x.shareId === req.params.shareId);
  if (!s) return res.json({ voted: false, votes: [] });
  const myVotes = db.votes.filter((v) => v.surveyId === s.id && v.code === code);
  res.json({ voted: myVotes.length > 0, votes: myVotes });
});

app.get("/api/surveys/:id/results", (req, res) => {
  if (req.user.role !== "admin") return res.status(403).json({ error: "\u4ec5\u7ba1\u7406\u5458" });
  const db = readDB();
  const s = db.surveys.find((x) => x.id === req.params.id);
  if (!s) return res.status(404).json({ error: "\u672a\u627e\u5230" });
  const allVotes = db.votes.filter((v) => v.surveyId === s.id);
  const profileStats = (s.profiles || []).map((p) => {
    const pv = allVotes.filter((v) => v.profileId === p.id);
    const stats = { A: 0, B: 0, C: 0, D: 0, E: 0 };
    pv.forEach((v) => { if (stats[v.option] !== undefined) stats[v.option]++; });
    return { profileId: p.id, profileName: p.name, stats, total: pv.length, votes: pv };
  });
  res.json({ survey: s, profileStats, total: allVotes.length });
});

app.get("/api/surveys/:id/export", (req, res) => {
  if (req.user.role !== "admin") return res.status(403).json({ error: "\u4ec5\u7ba1\u7406\u5458" });
  const db = readDB();
  const s = db.surveys.find((x) => x.id === req.params.id);
  if (!s) return res.status(404).json({ error: "\u672a\u627e\u5230" });
  const allVotes = db.votes.filter((v) => v.surveyId === s.id);
  let csv = "\u767b\u5f55\u7801,\u59d3\u540d,\u88ab\u8bc4\u4eba,\u9009\u9879,\u9009\u9879\u5185\u5bb9,\u6295\u7968\u65f6\u95f4\n";
  for (const v of allVotes) {
    const pn = (s.profiles || []).find((p) => p.id === v.profileId)?.name || v.profileId;
    csv += v.code + "," + v.name + "," + pn + "," + v.option + "," + (v.optionText || "").replace(/,/g, "\uff0c") + "," + v.votedAt + "\n";
  }
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", "attachment; filename=survey-" + s.id + "-results.csv");
  res.send("\uFEFF" + csv);
});

app.listen(PORT, "0.0.0.0", () => {
  console.log("Server running at http://localhost:" + PORT);
});