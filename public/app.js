const $ = (id) => document.getElementById(id);
let currentUser = null, currentSurveyId = null, currentProfiles = [];
function getHash() { return window.location.hash.slice(1) || ""; }
function setHash(h) { window.location.hash = h; }
function hideAll() { ["loginContainer","mainContainer","voterContainer"].forEach((id) => $(id).style.display = "none"); }

function shorten(str, len) { return str && str.length > len ? str.substring(0, len) + "..." : str || ""; }

window.addEventListener("hashchange", handleRoute);
function handleRoute() {
  var hash = getHash();
  if (!hash || hash === "login") { hideAll(); $("loginContainer").style.display = "flex"; return; }
  if (hash.startsWith("vote/")) {
    if (currentUser && currentUser.role === "admin") $("voterBackBtn").style.display = "inline-block";
    loadVoterView(hash.split("/")[1]); return;
  }
  if (!currentUser) { setHash("login"); return; }
  if (hash === "dashboard") showDashboard();
  else if (hash.startsWith("edit/")) loadEditor(hash.split("/")[1]);
  else if (hash.startsWith("results/")) loadResults(hash.split("/")[1]);
}

$("loginBtn").onclick = login;
$("loginInput").onkeydown = function(e) { if (e.key === "Enter") login(); };
async function login() {
  var code = $("loginInput").value.trim();
  if (!code) { $("loginError").textContent = "\u8bf7\u8f93\u5165\u767b\u5f55\u7801"; return; }
  $("loginError").textContent = "";
  $("loginBtn").disabled = true; $("loginBtn").textContent = "...";
  try {
    var res = await fetch("/api/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({code:code}) });
    var d = await res.json();
    if (!d.success) { $("loginError").textContent = d.error; $("loginBtn").disabled = false; $("loginBtn").textContent = "\u767b\u5f55"; return; }
    currentUser = d;
    localStorage.setItem("votingCode", code);
    hideAll(); $("mainContainer").style.display = "block";
    $("userName").textContent = d.code;
    $("userRole").textContent = d.role === "admin" ? "\u7ba1\u7406\u5458" : "\u7528\u6237";
    if (getHash().startsWith("vote/")) handleRoute(); else showDashboard();
  } catch(e) { $("loginError").textContent = "\u8fde\u63a5\u5931\u8d25"; }
  $("loginBtn").disabled = false; $("loginBtn").textContent = "\u767b\u5f55";
}

$("logoutBtn").onclick = function() {
  localStorage.removeItem("votingCode"); currentUser = null;
  hideAll(); $("loginContainer").style.display = "flex"; setHash("login");
};

(async function() {
  var saved = localStorage.getItem("votingCode");
  if (saved) { $("loginInput").value = saved; await login(); } else handleRoute();
})();

var hostURL = "http://localhost:3400";
async function fetchHostInfo() {
  try {
    var r = await fetch("/api/host");
    var d = await r.json();
    hostURL = d.url;
  } catch(e) {}
}

async function showDashboard() {
  hideAll(); $("mainContainer").style.display = "block";
  ["editorView","resultsView"].forEach(function(id) { $(id).style.display = "none"; });
  $("dashboardView").style.display = "block";
  if (!currentUser) return;
  try {
    var url = currentUser.role === "admin" ? "/api/surveys" : "/api/surveys/public";
    var res = await fetch(url, { headers: { "x-user-code": currentUser.code } });
    var surveys = await res.json();
    var list = $("surveyList");
    list.innerHTML = surveys.length === 0 ? "<p style=\"color:#999;text-align:center;padding:20px\">\u6682\u65e0\u95ee\u5377</p>" : "";
    surveys.forEach(function(s) {
      var div = document.createElement("div");
      div.style.cssText = "display:flex;justify-content:space-between;align-items:center;padding:14px;border:1px solid #eee;border-radius:10px;margin-bottom:10px";
      if (currentUser.role === "admin") {
        var st = s.status === "published" ? "已发布" : "草稿";
        var sc = s.status === "published" ? "#2e7d32" : "#ff9800";
        var pc = (s.profiles || []).length;
      div.innerHTML = "<div><strong>" + s.title + "</strong><div style=\"font-size:12px;color:#999;margin-top:4px\">" + new Date(s.createdAt).toLocaleDateString() + " <span style=\"color:" + sc + "\">" + st + "</span> | " + pc + "\u4eba</div></div><div><button class=\"btn-secondary\" onclick=\"setHash('edit/" + s.id + "')\" style=\"margin-right:6px\">\u7f16\u8f91</button><button class=\"btn-secondary\" onclick=\"loadResults('" + s.id + "')\">\u7edf\u8ba1</button><button class=\"btn-danger-sm\" onclick=\"deleteSurvey('" + s.id + "')\" style=\"margin-left:6px\">\u5220\u9664</button></div>";
      } else {
      div.innerHTML = "<div><strong>" + s.title + "</strong></div><div><button class=\"btn-primary\" onclick=\"window.location.hash='#vote/" + s.shareId + "'\">去投票</button></div>";
      }
      list.appendChild(div);
    });
  } catch(e) { $("surveyList").innerHTML = "<p style='color:red'>\u52a0\u8f7d\u5931\u8d25</p>"; }
  setHash("dashboard");
}


async function deleteSurvey(id) {
  if (!confirm("\u786e\u5b9a\u5220\u9664\u6b64\u95ee\u5377\uff1f")) return;
  try {
    var res = await fetch("/api/surveys/" + id, { method: "DELETE", headers: { "x-user-code": currentUser.code } });
    var d = await res.json();
    if (d.success) { showDashboard(); }
    else { alert("\u5220\u9664\u5931\u8d25"); }
  } catch(e) { alert("\u5220\u9664\u5931\u8d25"); }
}

$("createSurveyBtn").onclick = async function() {
  try {
    var res = await fetch("/api/surveys", { method: "POST", headers: { "Content-Type": "application/json", "x-user-code": currentUser.code } });
    var s = await res.json(); setHash("edit/" + s.id);
  } catch(e) { alert("\u521b\u5efa\u5931\u8d25"); }
};

async function loadEditor(surveyId) {
  currentSurveyId = surveyId;
  hideAll(); $("mainContainer").style.display = "block";
  $("dashboardView").style.display = "none"; $("resultsView").style.display = "none"; $("editorView").style.display = "block";
  try {
    var res = await fetch("/api/surveys/" + surveyId, { headers: { "x-user-code": currentUser.code } });
    var data = await res.json();
    var s = data.survey;
    $("editorTitle").textContent = s.title;
    $("surveyTitleInput").value = s.title;
    currentProfiles = s.profiles || [{id:"p1", name:"\u4eba\u90091", introText:""}];
    renderProfiles();
    renderOptions(s.options || {A:"",B:"",C:"",D:"",E:""});
    $("publishInfo").style.display = s.status === "published" ? "block" : "none";
    if (s.status === "published") {
      $("shareLink").href = window.location.origin + "/#vote/" + (s.shareId || s.id);
      $("shareLink").textContent = $("shareLink").href;
    }
  } catch(e) { alert("\u52a0\u8f7d\u5931\u8d25"); }
  setHash("edit/" + surveyId);
}

function renderProfiles() {
  var c = $("profileList"); c.innerHTML = "";
  currentProfiles.forEach(function(p,i) {
    var card = document.createElement("div");
    card.style.cssText = "border:2px solid #e0e0e0;border-radius:12px;padding:16px;margin-bottom:12px";
    var hdr = document.createElement("div");
    hdr.style.cssText = "display:flex;justify-content:space-between;align-items:center;margin-bottom:12px";
    hdr.innerHTML = "<strong style=\"font-size:15px\">#" + (i+1) + " " + (p.name || "\u65e0\u540d") + "</strong>" +
      "<div><button class=\"btn-inline\" onclick=\"duplicateProfile(" + i + ")\" style=\"margin-right:6px\">\u590d\u5236</button>" +
      (currentProfiles.length > 1 ? "<button class=\"btn-danger-sm\" onclick=\"removeProfile(" + i + ")\">\u5220\u9664</button>" : "") + "</div>";
    card.appendChild(hdr);
    var ni = document.createElement("input");
    ni.type = "text"; ni.className = "input-field"; ni.placeholder = "\u59d3\u540d"; ni.value = p.name || "";
    ni.oninput = function() { p.name = this.value; };
    card.appendChild(ni);
    var av = document.createElement("div");
    av.style.cssText = "display:flex;align-items:center;gap:12px;margin:10px 0";
    var img = document.createElement("img");
    img.style.cssText = "width:60px;height:60px;border-radius:50%;object-fit:cover;border:2px solid #ddd;display:none";
    var prevPath = "/api/avatar/" + currentSurveyId + "_" + p.id; img.src = prevPath + "?t=" + Date.now(); img.style.display = "block";
    var btn = document.createElement("button");
    btn.className = "btn-inline"; btn.textContent = "\u7167\u7247";
    var fi = document.createElement("input"); fi.type = "file"; fi.accept = "image/*"; fi.style.display = "none";
    fi.onchange = async function(e) {
      var file = e.target.files[0]; if (!file || !currentSurveyId) return;
      var fd = new FormData(); fd.append("avatar", file);
      try {
        var r = await fetch("/api/upload-avatar/" + currentSurveyId + "/" + p.id, { method: "POST", headers: { "x-user-code": currentUser.code }, body: fd });
        var d = await r.json();
        if (d.success) { img.src = d.url + "?t=" + Date.now(); img.style.display = "block"; }
      } catch(e) {}
    };
    btn.onclick = function() { fi.click(); };
    av.appendChild(img); av.appendChild(btn); av.appendChild(fi); card.appendChild(av);
    var ta = document.createElement("textarea");
    ta.className = "text-editor"; ta.placeholder = "\u4ecb\u7ecd\u6587\u5b57..."; ta.value = p.introText || "";
    ta.style.minHeight = "80px";
    ta.oninput = function() { p.introText = this.value; };
    card.appendChild(ta);
    c.appendChild(card);
  });
}

window.copyProfile = function(idx) {
  var src = currentProfiles[idx-1], tgt = currentProfiles[idx];
  if (!src || !tgt) return;
  tgt.name = src.name; tgt.introText = src.introText;
  renderProfiles();
};

$("addProfileBtn").onclick = function() {
  var last = currentProfiles[currentProfiles.length-1];
  currentProfiles.push({id:"p"+Date.now(), name:last?last.name:"", introText:(last?last.introText:"")});
  renderProfiles();
};

window.duplicateProfile = function(idx) {
  var src = currentProfiles[idx];
  if (!src) return;
  currentProfiles.splice(idx+1, 0, {id:"p"+Date.now(), name:src.name, introText:src.introText});
  renderProfiles();
};

window.removeProfile = function(idx) {
  if (currentProfiles.length <= 1) return;
  currentProfiles.splice(idx,1); renderProfiles();
};

function renderOptions(opts) {
  var c = $("optionsEditor"); c.innerHTML = "";
  "ABCDE".split("").forEach(function(k) {
    var d = document.createElement("div"); d.className = "vote-option";
    d.innerHTML = "<span class=\"label\">" + k + "</span><input type=\"text\" id=\"opt_" + k + "\" class=\"input-field\" style=\"border:none;background:transparent;font-size:14px\" placeholder=\"\u9009\u9879" + k + "\" value=\"" + (opts[k] || "") + "\">";
    c.appendChild(d);
  });
}

$("saveSurveyBtn").onclick = async function() {
  var id = currentSurveyId; if (!id) return;
  var options = {};
  "ABCDE".split("").forEach(function(k) { var el = $("opt_"+k); options[k] = (el ? el.value : "") || ""; });
  var body = { title: $("surveyTitleInput").value || "\u65e0\u540d", options: options, profiles: currentProfiles };
  $("saveSurveyBtn").disabled = true; $("saveSurveyBtn").textContent = "...";
  try {
    await fetch("/api/surveys/" + id, { method: "PUT", headers: { "Content-Type": "application/json", "x-user-code": currentUser.code }, body: JSON.stringify(body) });
  } catch(e) { alert("\u4fdd\u5b58\u5931\u8d25"); }
  $("saveSurveyBtn").disabled = false; $("saveSurveyBtn").textContent = "\u4fdd\u5b58";
};

$("publishBtn").onclick = async function() {
  $("saveSurveyBtn").click();
  await new Promise(function(r) { setTimeout(r,500); });
  try {
    var res = await fetch("/api/surveys/" + currentSurveyId + "/publish", { method: "POST", headers: { "x-user-code": currentUser.code } });
    var d = await res.json();
    $("publishInfo").style.display = "block";
    $("shareLink").href = d.link; $("shareLink").textContent = d.link;
    alert("\u5df2\u53d1\u5e03\uff01");
  } catch(e) { alert("\u53d1\u5e03\u5931\u8d25"); }
};

function copyLink() {
  navigator.clipboard.writeText($("shareLink").href).then(function(){ alert("\u94fe\u63a5\u5df2\u590d\u5236\uff01"); });
}

async function loadResults(surveyId) {
  hideAll(); $("mainContainer").style.display = "block";
  $("dashboardView").style.display = "none"; $("editorView").style.display = "none"; $("resultsView").style.display = "block";
  try {
    var res = await fetch("/api/surveys/" + surveyId + "/results", { headers: { "x-user-code": currentUser.code } });
    var d = await res.json();
    $("resultsTitle").textContent = d.survey.title + " (" + d.total + "\u7968)";
    var c = $("resultsContent"); c.innerHTML = "";
    d.profileStats.forEach(function(ps) {
      var card = document.createElement("div");
      card.style.cssText = "background:#f8f9fa;border-radius:10px;padding:16px;margin-bottom:12px";
      card.innerHTML = "<h3 style=\"font-size:15px;margin-bottom:10px\">" + ps.profileName + " (" + ps.total + "\u7968)</h3><div class=\"stats-grid\" style=\"grid-template-columns:repeat(5,1fr)\">" +
        "ABCDE".split("").map(function(k) { return "<div class=\"stat-card\"><div class=\"num\">" + (ps.stats[k]||0) + "</div><div class=\"lbl\">" + k + "</div></div>"; }).join("") +
        "</div><div style=\"font-size:12px;color:#999;margin-top:6px\">" +
        ps.votes.map(function(v) { return v.code+": "+v.option; }).join(" | ") + "</div>";
      c.appendChild(card);
    });
    $("exportBtn").onclick = async function() { try { var r = await fetch("/api/surveys/" + surveyId + "/export", { headers: { "x-user-code": currentUser.code } }); var b = await r.blob(); var u = URL.createObjectURL(b); var a = document.createElement("a"); a.href = u; a.download = "投票结果.csv"; a.click(); URL.revokeObjectURL(u); } catch(e) { alert("导出失败"); } };
  } catch(e) { alert("\u52a0\u8f7d\u5931\u8d25"); }
  setHash("results/" + surveyId);
}

async function loadVoterView(shareId) {
  hideAll(); $("voterContainer").style.display = "block";
  $("voterContent").style.display = "none"; $("voterLoginCard").style.display = "block";
  $("voterBackBtn").style.display = currentUser && currentUser.role === "admin" ? "inline-block" : "none";
  try {
    var res = await fetch("/api/s/" + shareId);
    if (!res.ok) { $("voterTitle").textContent = "\u95ee\u5377\u4e0d\u5b58\u5728"; return; }
    var data = await res.json();
    $("voterTitle").textContent = data.title;
    $("voterLoginBtn").onclick = async function() {
      var code = $("voterCodeInput").value.trim();
      if (!code) { $("voterLoginError").textContent = "\u8bf7\u8f93\u5165\u767b\u5f55\u7801"; return; }
      $("voterLoginError").textContent = "";
      var cv = await fetch("/api/s/" + shareId + "/check-vote", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({code:code}) });
      var cvd = await cv.json();
      var voterName = $("voterNameInput").value.trim() || code; showVoterContent(data, shareId, code, voterName, cvd.votes || []);
    };
    $("voterCodeInput").onkeydown = function(e) { if (e.key === "Enter") $("voterLoginBtn").click(); };
  } catch(e) { $("voterTitle").textContent = "\u52a0\u8f7d\u5931\u8d25"; }
}

function showVoterContent(data, shareId, code, voterName, existingVotes) {
  $("voterLoginCard").style.display = "none";
  $("voterContent").style.display = "block";
  var c = $("voterContent"); c.innerHTML = "";
  var options = data.options || {};

  data.profiles.forEach(function(p, idx) {
    var ev = existingVotes.find(function(v) { return v.profileId === p.id; });
    var card = document.createElement("div"); card.className = "card";
    var hdr = document.createElement("div");
    hdr.style.cssText = "display:flex;justify-content:space-between;align-items:center;cursor:pointer;user-select:none";
    hdr.innerHTML = "<span style=\"font-weight:600;font-size:15px\">#" + (idx+1) + " " + p.name + "</span><span class=\"arrow\" id=\"ar_" + idx + "\">" + (idx === 0 ? "\u25bc" : "\u25b6") + "</span>";
    var body = document.createElement("div");
    body.id = "vb_" + idx;
    body.style.display = idx === 0 ? "block" : "none";
    hdr.onclick = function() {
      var open = body.style.display === "block";
      body.style.display = open ? "none" : "block";
      document.getElementById("ar_"+idx).textContent = open ? "\u25b6" : "\u25bc";
    };
    card.appendChild(hdr);
    if (p.hasAvatar) {
      var aimg = new Image();
      aimg.onload = function() {
        var el = document.createElement("img");
        el.src = aimg.src; el.style.cssText = "width:80px;height:80px;border-radius:50%;object-fit:cover;margin:10px 0";
        body.insertBefore(el, body.firstChild);
      };
      aimg.src = "/api/avatar/" + data.id + "_" + p.id + "?t=" + Date.now();
    }
    var intro = document.createElement("div");
    intro.style.cssText = "line-height:1.8;color:#333;white-space:pre-wrap;font-size:14px;margin:8px 0";
    intro.textContent = p.introText || "(\u6682\u65e0\u4ecb\u7ecd)";
    body.appendChild(intro);
    var optsDiv = document.createElement("div"); optsDiv.className = "vote-options";
    var selected = ev ? ev.option : null;
    "ABCDE".split("").forEach(function(k) {
      var od = document.createElement("div"); od.className = "vote-option" + (selected === k ? " selected" : "");
      od.dataset.value = k; od.dataset.pid = p.id;
      od.innerHTML = "<div class=\"radio\"></div><span class=\"label\">" + k + "</span><span style=\"flex:1;font-size:14px;color:#333\">" + (options[k] || "\u9009\u9879"+k) + "</span>";
      od.onclick = function() {
        optsDiv.querySelectorAll(".vote-option").forEach(function(el) { el.classList.remove("selected"); });
        this.classList.add("selected");
      };
      optsDiv.appendChild(od);
    });
    body.appendChild(optsDiv);
    if (ev) {
      var tag = document.createElement("div");
      tag.style.cssText = "text-align:right;font-size:12px;color:#2e7d32;margin-top:6px";
      tag.textContent = "\u5df2\u6295: " + ev.option;
      body.appendChild(tag);
    }
    card.appendChild(body);
    c.appendChild(card);
  });

  var sd = document.createElement("div"); sd.className = "card";
  var sb = document.createElement("button"); sb.className = "submit-btn"; sb.textContent = "\u63d0\u4ea4\u6295\u7968";
  var st = document.createElement("div"); st.style.cssText = "margin-top:8px";
  sb.onclick = async function() {
    var votes = [];
    data.profiles.forEach(function(p, idx) {
      var body = document.getElementById("vb_"+idx);
      if (!body) return;
      var sel = body.querySelector(".vote-option.selected");
      votes.push({ profileId: p.id, option: sel ? sel.dataset.value : "", optionText: "" });
    });
    if (!votes.some(function(v) { return v.option; })) { st.className = "vote-status error"; st.textContent = "\u8bf7\u9009\u62e9\u81f3\u5c11\u4e00\u4eba"; return; }
    sb.disabled = true; sb.textContent = "...";
    try {
      var res = await fetch("/api/s/" + shareId + "/vote", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({code:code, name:voterName, votes:votes}) });
      var d = await res.json();
      if (d.success) { st.className = "vote-status success"; st.textContent = "\u6295\u7968\u6210\u529f\uff01"; sb.textContent = "\u5df2\u6295\u7968"; sb.disabled = true; }
      else throw new Error(d.error);
    } catch(e) { st.className = "vote-status error"; st.textContent = "\u63d0\u4ea4\u5931\u8d25"; sb.disabled = false; sb.textContent = "\u91cd\u8bd5"; }
  };
  sd.appendChild(sb); sd.appendChild(st);
  c.appendChild(sd);
}

$("voterBackBtn").onclick = function() { setHash("dashboard"); };

