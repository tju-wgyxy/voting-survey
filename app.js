import express from "express";
import multer from "multer";
import cors from "cors";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// 数据目录：优先使用环境变量（阿里云 FC 上设为 /tmp），默认本地 data 目录
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "data");
const DATA_FILE = path.join(DATA_DIR, "db.json");

// 确保数据目录存在
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const app = express();

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

// JSON 文件读写（原子写入）
function readDB() {
  if (!fs.existsSync(DATA_FILE)) return { surveys: [], votes: [], avatars: {} };
  return JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
}
function writeDB(data) {
  fs.writeFileSync(DATA_FILE + ".tmp", JSON.stringify(data, null, 2), "utf8");
  fs.renameSync(DATA_FILE + ".tmp", DATA_FILE);
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
  if (!code) return res.status(401).json({ error: "未登录" });
  const codes = getCodes();
  if (!codes[code]) return res.status(401).json({ error: "无效登录码" });
  req.userCode = code;
  req.user = codes[code];
  next();
});

app.post("/api/login", (req, res) => {
  const { code } = req.body;
  if (!code) return res.status(400).json({ error: "请输入登录码" });
  const codes = getCodes();
  if (!codes[code]) return res.status(401).json({ error: "登录码无效" });
  res.json({ success: true, code, name: codes[code].name, role: codes[code].role });
});

app.get("/api/surveys", (req, res) => {
  if (req.user.role !== "admin") return res.status(403).json({ error: "仅管理员" });
  res.json(readDB().surveys);
});

app.post("/api/surveys", (req, res) => {
  if (req.user.role !== "admin") return res.status(403).json({ error: "仅管理员" });
  const db = readDB();
  const id = genId();
  const survey = {
    id, shareId: id, title: "新问卷", createdBy: req.userCode,
    status: "draft", introText: "",
    options: { A: "", B: "", C: "", D: "", E: "" },
    profiles: [{ id: genId(), name: "人选1", introText: "" }],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    publishedAt: null,
  };
  db.surveys.push(survey);
  writeDB(db);
  res.json(survey);
});

app.get("/api/surveys/:id", (req, res) => {
  if (req.user.role !== "admin") return res.status(403).json({ error: "仅管理员" });
  const db = readDB();
  const s = db.surveys.find((x) => x.id === req.params.id);
  if (!s) return res.status(404).json({ error: "未找到" });
  const voteCount = db.votes.filter((v) => v.surveyId === s.id).length;
  res.json({ survey: s, voteCount });
});

app.put("/api/surveys/:id", (req, res) => {
  if (req.user.role !== "admin") return res.status(403).json({ error: "仅管理员" });
  const db = readDB();
  const idx = db.surveys.findIndex((x) => x.id === req.params.id);
  if (idx < 0) return res.status(404).json({ error: "未找到" });
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
  if (req.user.role !== "admin") return res.status(403).json({ error: "仅管理员" });
  const db = readDB();
  db.surveys = db.surveys.filter((x) => x.id !== req.params.id);
  db.votes = db.votes.filter((v) => v.surveyId !== req.params.id);
  writeDB(db);
  res.json({ success: true });
});

app.get("/api/host", (req, res) => { res.json({ url: req.protocol + "://" + req.get("host") }); });

app.post("/api/surveys/:id/publish", (req, res) => {
  if (req.user.role !== "admin") return res.status(403).json({ error: "仅管理员" });
  const db = readDB();
  const idx = db.surveys.findIndex((x) => x.id === req.params.id);
  if (idx < 0) return res.status(404).json({ error: "未找到" });
  db.surveys[idx].status = "published";
  db.surveys[idx].publishedAt = new Date().toISOString();
  writeDB(db);
  const link = req.protocol + "://" + req.get("host") + "/#vote/" + db.surveys[idx].shareId;
  res.json({ success: true, link, survey: db.surveys[idx] });
});

app.post("/api/upload-avatar/:surveyId/:profileId", (req, res) => {
  upload.single("avatar")(req, res, (err) => {
    if (err) return res.status(400).json({ error: "上传失败: " + err.message });
    if (!req.file) return res.status(400).json({ error: "请选择图片" });
    const data = fs.readFileSync(req.file.path);
    const ext = path.extname(req.file.originalname).slice(1) || "jpg";
    const base64 = "data:image/" + ext + ";base64," + data.toString("base64");
    const avatarId = req.params.surveyId + "_" + req.params.profileId;
    const db = readDB();
    if (!db.avatars) db.avatars = {};
    db.avatars[avatarId] = base64;
    writeDB(db);
    try { fs.unlinkSync(req.file.path); } catch(e) {}
    res.json({ success: true, url: "/api/avatar/" + avatarId });
  });
});

app.get("/api/avatar/:id", (req, res) => {
  const db = readDB();
  const avatars = db.avatars || {};
  const base64 = avatars[req.params.id];
  if (!base64) return res.status(404).end();
  const base64Data = base64.replace(/^data:image\/\w+;base64,/, "");
  const imgBuffer = Buffer.from(base64Data, "base64");
  res.writeHead(200, { "Content-Type": "image/jpeg", "Content-Length": imgBuffer.length });
  res.end(imgBuffer);
});

app.get("/api/s/:shareId", (req, res) => {
  const db = readDB();
  const s = db.surveys.find((x) => x.shareId === req.params.shareId && x.status === "published");
  if (!s) return res.status(404).json({ error: "问卷不存在或未发布" });
  const avatars = db.avatars || {};
  const profiles = (s.profiles || []).map((p) => {
    const avatarKey = s.id + "_" + p.id;
    return { id: p.id, name: p.name, introText: p.introText, hasAvatar: !!avatars[avatarKey], avatarUrl: avatars[avatarKey] ? "/api/avatar/" + avatarKey : null };
  });
  res.json({ id: s.shareId, title: s.title, profiles, options: s.options, publishedAt: s.publishedAt });
});

app.post("/api/s/:shareId/vote", (req, res) => {
  const { code, votes } = req.body;
  if (!code) return res.status(400).json({ error: "请输入登录码" });
  if (!votes || !votes.length) return res.status(400).json({ error: "请至少投票一人" });
  const codes = getCodes();
  if (!codes[code]) return res.status(401).json({ error: "登录码无效" });
  const db = readDB();
  const s = db.surveys.find((x) => x.shareId === req.params.shareId && x.status === "published");
  if (!s) return res.status(404).json({ error: "问卷不存在" });
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
  if (req.user.role !== "admin") return res.status(403).json({ error: "仅管理员" });
  const db = readDB();
  const s = db.surveys.find((x) => x.id === req.params.id);
  if (!s) return res.status(404).json({ error: "未找到" });
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
  if (req.user.role !== "admin") return res.status(403).json({ error: "仅管理员" });
  const db = readDB();
  const s = db.surveys.find((x) => x.id === req.params.id);
  if (!s) return res.status(404).json({ error: "未找到" });
  const allVotes = db.votes.filter((v) => v.surveyId === s.id);
  let csv = "登录码,姓名,被评人,选项,选项内容,投票时间\n";
  for (const v of allVotes) {
    const pn = (s.profiles || []).find((p) => p.id === v.profileId)?.name || v.profileId;
    csv += v.code + "," + v.name + "," + pn + "," + v.option + "," + (v.optionText || "").replace(/,/g, "，") + "," + v.votedAt + "\n";
  }
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", "attachment; filename=survey-" + s.id + "-results.csv");
  res.send("\uFEFF" + csv);
});

export default app;
