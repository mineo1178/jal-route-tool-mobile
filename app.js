// ==== DOM ====
const csvFileInput = document.getElementById("csvFileInput");
const fileNameEl = document.getElementById("fileName");
const flightCountEl = document.getElementById("flightCount");
const loadStatusEl = document.getElementById("loadStatus");
const columnGuessInfoEl = document.getElementById("columnGuessInfo");
const toastEl = document.getElementById("toast");

const startAirportSelect = document.getElementById("startAirportSelect");
const startTimeInput = document.getElementById("startTimeInput");
const endTimeInput = document.getElementById("endTimeInput");
const maxConnectionsInput = document.getElementById("maxConnectionsInput");
const endAirportSelect = document.getElementById("endAirportSelect");
const transitAirportsBox = document.getElementById("transitAirportsBox");
const clearTransitBtn = document.getElementById("clearTransitBtn");
const generatePlansBtn = document.getElementById("generatePlansBtn");
const plansContainer = document.getElementById("plansContainer");
const plansInfo = document.getElementById("plansInfo");
const loadingIndicator = document.getElementById("loadingIndicator");

// progress DOM
const progressPanel = document.getElementById("progressPanel");
const progressPercentEl = document.getElementById("progressPercent");
const progressBarInner = document.getElementById("progressBarInner");
const progressRoutesEl = document.getElementById("progressRoutes");
const progressNodesEl = document.getElementById("progressNodes");
const progressElapsedEl = document.getElementById("progressElapsed");

const originSelect = document.getElementById("originSelect");
const destSelect = document.getElementById("destSelect");
const depFromInput = document.getElementById("depFromInput");
const depToInput = document.getElementById("depToInput");
const searchBtn = document.getElementById("searchBtn");
const resetBtn = document.getElementById("resetBtn");
const backBtn = document.getElementById("backBtn");
const searchResultsBody = document.getElementById("searchResultsBody");
const searchInfo = document.getElementById("searchInfo");

const savedFlightsBody = document.getElementById("savedFlightsBody");
const copyScheduleBtn = document.getElementById("copyScheduleBtn");
const clearSavedBtn = document.getElementById("clearSavedBtn");

// ==== State ====
let flights = [];
let savedFlights = [];
// ==== LocalStorage Persistence (Feature #1) ====
const LS_KEYS = {
  savedFlights: "jal_saved_flights_v2",
  searchInputs: "jal_search_inputs_v2",
};

let restoredSearchInputs = null;

document.addEventListener("DOMContentLoaded", () => {
  loadFromLocalStorage();
  renderSavedFlights();
  renderSearchInitial();
  autoLoadCsvFromServer();
});

function loadFromLocalStorage() {
  try {
    const sf = localStorage.getItem(LS_KEYS.savedFlights);
    if (sf) {
      const arr = JSON.parse(sf);
      if (Array.isArray(arr)) savedFlights = arr;
    }
  } catch (e) {
    console.warn("Failed to load saved flights:", e);
  }
  try {
    const si = localStorage.getItem(LS_KEYS.searchInputs);
    if (si) restoredSearchInputs = JSON.parse(si);
  } catch (e) {
    console.warn("Failed to load search inputs:", e);
  }
}

async function autoLoadCsvFromServer() {
  if (loadStatusEl) {
    safeText(loadStatusEl, "CSVを自動読み込み中…");
    loadStatusEl.className = "status status-info";
  }

  try {
    const res = await fetch("./jal_domestic_schedule_with_fares.csv", { cache: "no-cache" });
    if (!res.ok) throw new Error(`Failed to fetch CSV: ${res.status}`);

    const buffer = await res.arrayBuffer();
    let text = "";
    try { text = new TextDecoder("utf-8", { fatal: true }).decode(buffer); }
    catch { text = new TextDecoder("shift_jis").decode(buffer); }

    const { headers, rows, delim } = parseCsv(text);
    safeText(fileNameEl, "jal_domestic_schedule_with_fares.csv");
    loadFlightsFromCsv(headers, rows, delim);
    safeText(loadStatusEl, "CSVを自動読み込みしました。");
    if (loadStatusEl) loadStatusEl.className = "status status-ok";
    showToast("CSVを自動読み込みしました");
  } catch (err) {
    console.error(err);
    flights = [];
    safeText(fileNameEl, "（未読込）");
    safeText(flightCountEl, "0");
    safeText(loadStatusEl, "CSVの自動読み込みに失敗しました。ファイルを指定してください。");
    loadStatusEl.className = "status status-error";
    renderSearchInitial();
    renderSavedFlights();
    showToast("自動読み込みに失敗しました。ファイルを選択してください");
  }
}

function saveSavedFlightsToLocalStorage() {
  try {
    localStorage.setItem(LS_KEYS.savedFlights, JSON.stringify(savedFlights));
  } catch (e) {
    console.warn("Failed to save saved flights:", e);
  }
}

function saveSearchInputsToLocalStorage() {
  try {
    const inputs = {
      origin: originSelect.value,
      dest: destSelect.value,
      depFrom: depFromInput.value,
      depTo: depToInput.value,
      transit: getTransitConditions(),
    };
    localStorage.setItem(LS_KEYS.searchInputs, JSON.stringify(inputs));
  } catch (e) {
    console.warn("Failed to save search inputs:", e);
  }
}

function applyRestoredSearchInputs() {
  if (!restoredSearchInputs) return;
  const { origin, dest, depFrom, depTo, transit } = restoredSearchInputs;

  if (origin && Array.from(originSelect.options).some(o=>o.value===origin)) {
    originSelect.value = origin;
  }
  if (dest && Array.from(destSelect.options).some(o=>o.value===dest)) {
    destSelect.value = dest;
  }
  if (depFrom) depFromInput.value = depFrom;
  if (depTo) depToInput.value = depTo;

  if (transit && transitAirportsBox) {
    // Reset all chips to neutral
    transitAirportsBox.querySelectorAll(".chip").forEach(ch=>{
      ch.classList.remove("chip-include","chip-exclude");
    });
    // Apply include/exclude
    (transit.include || []).forEach(a=>{
      const chip = transitAirportsBox.querySelector(`.chip[data-airport="${a}"]`);
      if (chip) chip.classList.add("chip-include");
    });
    (transit.exclude || []).forEach(a=>{
      const chip = transitAirportsBox.querySelector(`.chip[data-airport="${a}"]`);
      if (chip) chip.classList.add("chip-exclude");
    });
    if (transit.requiredCount != null) requiredTransitInput.value = transit.requiredCount;
  }
}

let currentSearchState = null;
const searchHistory = [];

const MIN_CONNECT_MIN = 20;
const MAX_CONNECT_MIN = 240;

// ==== Utils ====
function safeText(el, text) { if (el) el.textContent = text; }
function safeHTML(el, html) { if (el) el.innerHTML = html; }

function showToast(msg) {
  if (!toastEl) return;
  toastEl.textContent = msg;
  toastEl.classList.add("show");
  setTimeout(() => toastEl.classList.remove("show"), 2000);
}

function timeToMinutes(t) {
  if (!t) return null;
  const m = String(t).trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const h = Number(m[1]), mi = Number(m[2]);
  return h * 60 + mi;
}
function minutesToHM(min) {
  const sign = min < 0 ? "-" : "";
  const abs = Math.abs(min);
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  if (h === 0) return `${sign}${m}分`;
  return `${sign}${h}時間${m}分`;
}
function normalizeKey(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/[ \t]/g, "")
    .replace(/[‐-–—ー―]/g, "-")
    .replace(/[（）()【】\[\]{}]/g, "")
    .replace(/　/g, "");
}
function looksLikeTime(v) { return timeToMinutes(v) !== null; }

function parseFare(v) {
  if (v == null) return null;
  const s = String(v).trim();
  if (!s) return null;
  // "12,340円" "12340" "¥12340" etc.
  const num = s.replace(/[¥円,]/g, "");
  const n = Number(num);
  return Number.isFinite(n) ? n : null;
}
function formatFare(n) {
  if (n == null) return "-";
  return `${n.toLocaleString("ja-JP")}円`;
}

// ====== CSV parser (robust) ======
function detectDelimiter(lines) {
  const sample = lines.slice(0, 5).join("\n");
  const commas = (sample.match(/,/g) || []).length;
  const tabs = (sample.match(/\t/g) || []).length;
  const semis = (sample.match(/;/g) || []).length;
  if (tabs > commas && tabs > semis) return "\t";
  if (semis > commas) return ";";
  return ",";
}
function parseCsvLine(line, delim) {
  const out = [];
  let cur = "", inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { cur += '"'; i++; }
      else { inQuotes = !inQuotes; }
    } else if (ch === delim && !inQuotes) {
      out.push(cur.trim()); cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur.trim());
  return out;
}
function parseCsv(text) {
  const cleaned = text.replace(/^\uFEFF/, ""); // BOM remove
  const lines = cleaned.replace(/\r\n/g, "\n").split("\n").filter(l => l.trim() !== "");
  if (!lines.length) return { headers: [], rows: [], hasHeader: false };

  const delim = detectDelimiter(lines);
  const first = parseCsvLine(lines[0], delim);

  const hasHeader = first.some(h => {
    const k = normalizeKey(h);
    return ["出発","到着","空港","時刻","便","運航","airline","flight","origin","destination","departure","arrival","料金","運賃","fare"]
      .some(w => k.includes(normalizeKey(w)));
  });

  let headers = [];
  let startIdx = 0;
  if (hasHeader) { headers = first; startIdx = 1; }
  else { headers = first.map((_, i) => `col${i+1}`); startIdx = 0; }

  const rows = [];
  for (let i = startIdx; i < lines.length; i++) {
    rows.push(parseCsvLine(lines[i], delim));
  }
  return { headers, rows, hasHeader, delim };
}

// ==== Header mapping ====
const HEADER_SYNONYMS = {
  airline: ["運航会社","航空会社","キャリア","会社","airline","carrier"],
  flightNo: ["便名","便番号","フライト","flight","flightno","flight_number","便","便No"],
  origin: ["出発地","出発空港","出発","origin","from","departure_airport"],
  depTime: ["出発時刻","出発時間","dep","departure_time","time_departure","出発時"],
  dest:   ["到着地","到着空港","到着","destination","to","arrival_airport"],
  arrTime:["到着時刻","到着時間","arr","arrival_time","time_arrival","到着時"],
  fareStd:["標準料金","標準運賃","標準運賃(円)","料金","運賃","運賃(円)","farestd","fare_standard","price","base_fare","fare"]
};

function guessColumnIndexes(headers, sampleRows) {
  const idx = { airline:null, flightNo:null, origin:null, depTime:null, dest:null, arrTime:null, fareStd:null };
  const nkHeaders = headers.map(h => normalizeKey(h));

  function findBySynonyms(field) {
    const syns = HEADER_SYNONYMS[field].map(normalizeKey);
    for (let i = 0; i < nkHeaders.length; i++) {
      if (syns.some(s => nkHeaders[i].includes(s))) return i;
    }
    return null;
  }
  for (const f of Object.keys(idx)) idx[f] = findBySynonyms(f);

  if (idx.depTime === null || idx.arrTime === null) {
    const timeCols = [];
    for (let c = 0; c < headers.length; c++) {
      let count = 0;
      for (let r = 0; r < Math.min(sampleRows.length, 30); r++) {
        if (looksLikeTime(sampleRows[r][c])) count++;
      }
      if (count >= 3) timeCols.push(c);
    }
    if (idx.depTime === null && timeCols.length >= 1) idx.depTime = timeCols[0];
    if (idx.arrTime === null && timeCols.length >= 2) idx.arrTime = timeCols[1];
  }

  function guessAirportCol(excludeCols=[]) {
    let best = null, bestScore = -1;
    for (let c = 0; c < headers.length; c++) {
      if (excludeCols.includes(c)) continue;
      let uniq = new Set();
      let timeLike = 0;
      for (let r = 0; r < Math.min(sampleRows.length, 50); r++) {
        const v = sampleRows[r][c];
        if (!v) continue;
        if (looksLikeTime(v)) { timeLike++; continue; }
        uniq.add(v);
      }
      const score = uniq.size - timeLike * 10;
      if (score > bestScore) { bestScore = score; best = c; }
    }
    return best;
  }
  if (idx.origin === null) idx.origin = guessAirportCol([idx.depTime, idx.arrTime].filter(v=>v!==null));
  if (idx.dest === null) idx.dest = guessAirportCol([idx.origin, idx.depTime, idx.arrTime].filter(v=>v!==null));

  return idx;
}

// ==== North->South sort patterns ====
const REGION_PATTERNS = [
  ["稚内","利尻","礼文","札幌","新千歳","丘珠","函館","旭川","女満別","中標津","釧路","帯広","紋別"],
  ["青森","三沢","秋田","花巻","山形","仙台"],
  ["新潟","富山","小松","能登","松本"],
  ["茨城","成田","東京","羽田","静岡"],
  ["名古屋","中部","セントレア","小牧"],
  ["大阪","伊丹","関西","関空","神戸","南紀","白浜","但馬"],
  ["鳥取","米子","出雲","隠岐","岡山","広島","岩国","山口宇部"],
  ["徳島","高松","高知","松山"],
  ["北九州","福岡","佐賀","長崎","大分","熊本","宮崎","鹿児島"],
  ["対馬","壱岐","五島","福江","種子島","屋久島","奄美","喜界","徳之島","沖永良部","与論"],
  ["那覇","沖縄","久米島","宮古","下地島","多良間","石垣","与那国"]
];
function getAirportRank(name) {
  if (!name) return 1000;
  for (let region = 0; region < REGION_PATTERNS.length; region++) {
    for (const p of REGION_PATTERNS[region]) if (name.includes(p)) return region * 10;
  }
  return 900;
}

// ==== Load Flights ====
function loadFlightsFromCsv(headers, rows, delim) {
  const colIdx = guessColumnIndexes(headers, rows);

  safeText(columnGuessInfoEl,
    `区切り='${delim}' / 推定列：出発地=${headers[colIdx.origin]||"?"} / 出発時刻=${headers[colIdx.depTime]||"?"} / ` +
    `到着地=${headers[colIdx.dest]||"?"} / 到着時刻=${headers[colIdx.arrTime]||"?"} / 便名=${headers[colIdx.flightNo]||"(なし)"} / ` +
    `標準料金=${headers[colIdx.fareStd]||"(なし)"}`
  );

  flights = rows.map((cols, idx) => {
    const airline = colIdx.airline !== null ? (cols[colIdx.airline] || "") : "";
    const flightNoRaw = colIdx.flightNo !== null ? (cols[colIdx.flightNo] || "") : "";
    const originName = colIdx.origin !== null ? (cols[colIdx.origin] || "") : "";
    const depTime = colIdx.depTime !== null ? (cols[colIdx.depTime] || "") : "";
    const destName = colIdx.dest !== null ? (cols[colIdx.dest] || "") : "";
    const arrTime = colIdx.arrTime !== null ? (cols[colIdx.arrTime] || "") : "";
    const fareStdRaw = colIdx.fareStd !== null ? (cols[colIdx.fareStd] || "") : "";

    if (!originName || !destName || !looksLikeTime(depTime) || !looksLikeTime(arrTime)) return null;

    const flightNo = flightNoRaw ? String(flightNoRaw).trim() : (airline ? airline.trim() : "JAL") + (idx+1);
    const fareStd = parseFare(fareStdRaw);

    return {
      id: `row_${idx}_${flightNo}`,
      airline: String(airline || "").trim(),
      flightNo: String(flightNo).trim(),
      originName: originName.trim(),
      destName: destName.trim(),
      depTime: depTime.trim(),
      arrTime: arrTime.trim(),
      fareStd
    };
  }).filter(Boolean);

  safeText(flightCountEl, flights.length.toString());

  if (flights.length) {
    safeText(loadStatusEl, "CSVの読み込みに成功しました。");
    loadStatusEl.className = "status status-ok";
  } else {
    safeText(loadStatusEl, "有効なフライトデータがありません（列推定を確認）。");
    loadStatusEl.className = "status status-error";
  }

  rebuildAirportSelects();
  renderSearchInitial();
  renderSavedFlights();

  safeText(plansInfo, "");
  safeHTML(plansContainer, '<p class="muted small">出発空港と時間帯を指定して、「おすすめプラン生成」を押してください。</p>');
}

// FileReader
csvFileInput?.addEventListener("change", (e) => {
  const file = e.target.files && e.target.files[0];
  if (!file) return;
  safeText(fileNameEl, file.name);

  const reader = new FileReader();
  reader.onload = (event) => {
    try {
      const buffer = event.target.result;
      let text = "";
      try { text = new TextDecoder("utf-8", { fatal: true }).decode(buffer); }
      catch { text = new TextDecoder("shift_jis").decode(buffer); }

      const { headers, rows, delim } = parseCsv(text);
      loadFlightsFromCsv(headers, rows, delim);
      showToast("CSVを読み込みました");
    } catch (err) {
      console.error(err);
      flights = [];
      safeText(flightCountEl, "0");
      safeText(loadStatusEl, "CSV読み込みに失敗しました。");
      loadStatusEl.className = "status status-error";
      renderSearchInitial();
      renderSavedFlights();
      showToast("CSVの読み込みに失敗しました");
    }
  };
  reader.readAsArrayBuffer(file);
});

// ==== Selects / chips ====
function rebuildAirportSelects() {
  const airportSet = new Set();
  flights.forEach(f => { airportSet.add(f.originName); airportSet.add(f.destName); });

  const airports = [...airportSet].sort((a,b)=>{
    const ra=getAirportRank(a), rb=getAirportRank(b);
    if (ra!==rb) return ra-rb;
    return a.localeCompare(b,"ja");
  });

  function rebuildSelect(selectEl, withAll) {
    if (!selectEl) return;
    selectEl.innerHTML="";
    if (withAll) {
      const opt=document.createElement("option");
      opt.value=""; opt.textContent="（すべて）";
      selectEl.appendChild(opt);
    }
    airports.forEach(name=>{
      const opt=document.createElement("option");
      opt.value=name; opt.textContent=name;
      selectEl.appendChild(opt);
    });
  }

  rebuildSelect(originSelect, true);
  rebuildSelect(destSelect, true);

  startAirportSelect.innerHTML="";
  airports.forEach(name=>{
    const opt=document.createElement("option");
    opt.value=name; opt.textContent=name;
    startAirportSelect.appendChild(opt);
  });

  endAirportSelect.innerHTML="";
  const none=document.createElement("option");
  none.value=""; none.textContent="（指定なし）";
  endAirportSelect.appendChild(none);
  airports.forEach(name=>{
    const opt=document.createElement("option");
    opt.value=name; opt.textContent=name;
    endAirportSelect.appendChild(opt);
  });

  transitAirportsBox.innerHTML="";
  airports.forEach(name=>{
    const chip=document.createElement("span");
    chip.className="chip";
    chip.dataset.airport=name;
    chip.textContent=name;
    transitAirportsBox.appendChild(chip);
  });
}

// ==== Saved flights ====
function renderSavedFlights() {
  savedFlightsBody.innerHTML="";
  if (!savedFlights.length) {
    const tr=document.createElement("tr");
    const td=document.createElement("td");
    td.colSpan=8; td.className="muted";
    td.textContent="まだ便が保存されていません。④の検索結果から「＋保存」で追加できます。";
    tr.appendChild(td); savedFlightsBody.appendChild(tr);
    return;
  }

  const sorted=savedFlights.slice().sort((a,b)=>timeToMinutes(a.depTime)-timeToMinutes(b.depTime));
  sorted.forEach((f,idx)=>{
    const tr=document.createElement("tr");
    [idx+1,f.flightNo,f.originName,f.depTime,f.destName,f.arrTime,formatFare(f.fareStd)].forEach(c=>{
      const td=document.createElement("td"); td.textContent=c; tr.appendChild(td);
    });

    const tdConn=document.createElement("td");
    if (idx===0) tdConn.innerHTML='<span class="pill">始発</span>';
    else {
      const prev=sorted[idx-1];
      const diff=timeToMinutes(f.depTime)-timeToMinutes(prev.arrTime);
      const ok=diff>=MIN_CONNECT_MIN && diff<=MAX_CONNECT_MIN;
      const span=document.createElement("span");
      span.className="pill "+(ok?"good":"bad");
      span.textContent=(ok?"OK ":"NG ")+minutesToHM(diff);
      tdConn.appendChild(span);
    }
    tr.appendChild(tdConn);
    savedFlightsBody.appendChild(tr);
  });
}
function addFlightToSaved(f) {
  if (savedFlights.find(sf=>sf.id===f.id)) return showToast("この便はすでに保存されています");
  savedFlights.push(f);
    saveSavedFlightsToLocalStorage();
  saveSearchInputsToLocalStorage();
renderSavedFlights();
  savedFlightsBody.closest("section")?.scrollIntoView({behavior:"smooth",block:"start"});
  showToast("便を保存しました（②手動プランに追加）");
}
function clearSavedFlights() {
  if (!savedFlights.length) return showToast("保存された便はありません");
  if (!confirm("保存した便をすべて削除しますか？")) return;
  savedFlights=[];   saveSavedFlightsToLocalStorage();
renderSavedFlights(); showToast("削除しました");
}
function copyScheduleToClipboard() {
  if (!savedFlights.length) return showToast("コピーする便がありません");
  const sorted=savedFlights.slice().sort((a,b)=>timeToMinutes(a.depTime)-timeToMinutes(b.depTime));
  const lines=[
    "| # | 便名 | 出発空港 | 出発 | 到着空港 | 到着 | 標準料金 | 前便から |",
    "|:-:|:----|:---------|:----:|:---------|:----:|:--------:|:--------|"
  ];
  sorted.forEach((f,idx)=>{
    let conn="—";
    if (idx>0){
      const prev=sorted[idx-1];
      const diff=timeToMinutes(f.depTime)-timeToMinutes(prev.arrTime);
      conn=(diff>=MIN_CONNECT_MIN && diff<=MAX_CONNECT_MIN?"OK ":"NG ")+minutesToHM(diff);
    }
    lines.push(`| ${idx+1} | ${f.flightNo} | ${f.originName} | ${f.depTime} | ${f.destName} | ${f.arrTime} | ${formatFare(f.fareStd)} | ${conn} |`);
  });
  navigator.clipboard.writeText(lines.join("\n"))
    .then(()=>showToast("Markdown形式でコピーしました"))
    .catch(()=>showToast("コピーに失敗しました"));
}

// ==== Search ====
function renderSearchInitial() {
  searchResultsBody.innerHTML="";
  safeText(searchInfo, "");
  const tr=document.createElement("tr");
  const td=document.createElement("td");
  td.colSpan=7; td.className="muted";
  td.textContent=flights.length?"条件を指定して「検索」を押してください。":"まずは①CSV読み込みを行ってください。";
  tr.appendChild(td); searchResultsBody.appendChild(tr);
  currentSearchState=null; searchHistory.length=0;
}
function setSearchState(results,label){
  if (currentSearchState) searchHistory.push(currentSearchState);
  currentSearchState={results,label};
  renderSearchResults();
}
function renderSearchResults(){
  searchResultsBody.innerHTML="";
  const st=currentSearchState||{results:[],label:""};
  const results=st.results||[];
  safeText(searchInfo, st.label?`${st.label}：${results.length}件`:(results.length?`検索結果：${results.length}件`:""));

  if (!results.length){
    const tr=document.createElement("tr");
    const td=document.createElement("td");
    td.colSpan=7; td.className="muted";
    td.textContent=st.label?`${st.label}：該当なし`:"該当するフライトがありません。";
    tr.appendChild(td); searchResultsBody.appendChild(tr);
    return;
  }

  results.slice().sort((a,b)=>timeToMinutes(a.depTime)-timeToMinutes(b.depTime)).forEach(f=>{
    const tr=document.createElement("tr");
    [f.flightNo,f.originName,f.depTime,f.destName,f.arrTime,formatFare(f.fareStd)].forEach(c=>{
      const td=document.createElement("td"); td.textContent=c; tr.appendChild(td);
    });
    const tdAct=document.createElement("td");
    const btnSave=document.createElement("button");
    btnSave.textContent="＋保存"; btnSave.className="btn ghost";
    btnSave.addEventListener("click",()=>addFlightToSaved(f));
    const btnConn=document.createElement("button");
    btnConn.textContent="↪乗継候補"; btnConn.className="btn ghost"; btnConn.style.marginLeft="4px";
    btnConn.addEventListener("click",()=>runConnectionSearch(f));
    tdAct.appendChild(btnSave); tdAct.appendChild(btnConn);
    tr.appendChild(tdAct);
    searchResultsBody.appendChild(tr);
  });
}
function runNormalSearch(){
  if (!flights.length) return showToast("先にCSVを読み込んでください");
  const origin=originSelect.value;
  const dest=destSelect.value;
  const depFrom=depFromInput.value;
  const depTo=depToInput.value;
  const depFromMin=depFrom?timeToMinutes(depFrom):null;
  const depToMin=depTo?timeToMinutes(depTo):null;

  const results=flights.filter(f=>{
    if (origin && f.originName!==origin) return false;
    if (dest && f.destName!==dest) return false;
    const depMin=timeToMinutes(f.depTime);
    if (depFromMin!==null && depMin<depFromMin) return false;
    if (depToMin!==null && depMin>depToMin) return false;
    return true;
  });

  const parts=[];
  if (origin) parts.push(`出発:${origin}`);
  if (dest) parts.push(`到着:${dest}`);
  if (depFrom) parts.push(`From:${depFrom}`);
  if (depTo) parts.push(`To:${depTo}`);
  setSearchState(results, parts.length?parts.join(" / "):"検索結果");
}
function runConnectionSearch(base){
  const arrMin=timeToMinutes(base.arrTime);
  const results=flights.filter(f=>{
    if (f.originName!==base.destName) return false;
    const depMin=timeToMinutes(f.depTime);
    const diff=depMin-arrMin;
    return diff>=MIN_CONNECT_MIN && diff<=MAX_CONNECT_MIN;
  });
  setSearchState(results, `${base.flightNo}（${base.originName}→${base.destName}）からの乗継候補`);
}
function goBackSearch(){
  if (!searchHistory.length) return showToast("戻れる検索履歴がありません");
  currentSearchState=searchHistory.pop();
  renderSearchResults();
}

// ==== Transit chips 3-state ====
function getTransitConditions(){
  const include=[], exclude=[];
  transitAirportsBox.querySelectorAll(".chip").forEach(chip=>{
    const ap=chip.dataset.airport;
    if (chip.classList.contains("chip-include")) include.push(ap);
    if (chip.classList.contains("chip-exclude")) exclude.push(ap);
  });
  return {include, exclude};
}

// ==== Recommend plans (progress-enabled async DFS) ====
async function generatePlans(){
  if (!flights.length) return showToast("先にCSVを読み込んでください");
  const startAirport=startAirportSelect.value;
  if (!startAirport) return showToast("出発空港を選択してください");

  loadingIndicator.classList.remove("hidden");
  progressPanel.classList.remove("hidden");
  progressBarInner.style.width = "0%";
  progressPercentEl.textContent = "0";
  progressRoutesEl.textContent = "0";
  progressNodesEl.textContent = "0";
  progressElapsedEl.textContent = "0.0";

  const t0 = performance.now();
  let exploredRoutes = 0;
  let exploringNodes = 0;
  let lastUiUpdate = 0;

  // 近似ターゲット（進捗%用）
  let estimatedTarget = 5000;
  try {
    const userMax=parseInt(maxConnectionsInput.value||"0",10);
    const maxLegs=(userMax>0)?userMax+1:50;
    estimatedTarget = Math.min(40000, Math.max(2000, flights.length * maxLegs * 0.08));
  } catch {}

  function updateProgress(force=false){
    const now = performance.now();
    if (!force && now - lastUiUpdate < 120) return;
    lastUiUpdate = now;

    const elapsed = (now - t0)/1000;
    const approxPct = Math.min(99, Math.floor((exploredRoutes / estimatedTarget) * 100));

    progressElapsedEl.textContent = elapsed.toFixed(1);
    progressRoutesEl.textContent = exploredRoutes.toString();
    progressNodesEl.textContent = exploringNodes.toString();
    progressPercentEl.textContent = approxPct.toString();
    progressBarInner.style.width = approxPct + "%";
  }

  await new Promise(r=>setTimeout(r,0));

  try {
    const startMin=timeToMinutes(startTimeInput.value||"00:00");
    const endMin=timeToMinutes(endTimeInput.value||"23:59");
    if (endMin<=startMin) return showToast("終了時刻は開始時刻より後にしてください");

    const userMax=parseInt(maxConnectionsInput.value||"0",10);
    const maxLegs=(userMax>0)?userMax+1:50; // 未指定なら50

    const {include:mustAirports, exclude:avoidAirports}=getTransitConditions();
    const endAirport=endAirportSelect.value;

    const startFlights=flights.filter(f=>{
      if (f.originName!==startAirport) return false;
      const dep=timeToMinutes(f.depTime), arr=timeToMinutes(f.arrTime);
      return dep>=startMin && arr<=endMin;
    }).sort((a,b)=>timeToMinutes(a.depTime)-timeToMinutes(b.depTime));

    if (!startFlights.length){
      plansContainer.innerHTML='<p class="muted small">指定条件に合う出発便がありません。</p>';
      plansInfo.textContent="";
      return showToast("指定条件に合う出発便がありません");
    }

    const routes=[];
    const visitedIds=new Set();

    // ★ 同一区間(A→B) 1回まで（B→Aは別扱い）を扱うための usedSegs を追加
    async function dfs(route, usedSegs){
      if (route.length>maxLegs) return;

      exploredRoutes++;
      routes.push(route.slice());
      updateProgress();

      // UIに描画時間を渡す（数字が動くように）
      if (exploredRoutes % 200 === 0) {
        await new Promise(requestAnimationFrame);
      }

      if (route.length===maxLegs) return;

      const last=route[route.length-1];
      const lastArr=timeToMinutes(last.arrTime);

      const nexts=flights.filter(f=>{
        if (visitedIds.has(f.id)) return false;
        if (f.originName!==last.destName) return false;

        // ★ 同一区間1回制約（A→Bは1回まで / 往復OK）
        const segKey = `${f.originName}→${f.destName}`;
        if (usedSegs.has(segKey)) return false;

        const dep=timeToMinutes(f.depTime), arr=timeToMinutes(f.arrTime);
        const diff=dep-lastArr;
        return diff>=MIN_CONNECT_MIN && diff<=MAX_CONNECT_MIN && arr<=endMin;
      });

      exploringNodes += nexts.length;
      updateProgress();

      for (const n of nexts){
        visitedIds.add(n.id);

        const segKey = `${n.originName}→${n.destName}`;
        usedSegs.add(segKey);

        route.push(n);
        await dfs(route, usedSegs);

        route.pop();
        usedSegs.delete(segKey);

        visitedIds.delete(n.id);
        exploringNodes--;
        updateProgress();
      }
    }

    for (const sf of startFlights){
      visitedIds.clear();
      visitedIds.add(sf.id);

      const usedSegs = new Set([`${sf.originName}→${sf.destName}`]);
      await dfs([sf], usedSegs);
    }

    // ---- 条件フィルタ ----
    let filtered=routes;

    if (endAirport){
      filtered=filtered.filter(r=>r[r.length-1].destName===endAirport);
    }
    if (mustAirports.length){
      filtered=filtered.filter(r=>{
        const visited=new Set();
        r.forEach(f=>{visited.add(f.originName); visited.add(f.destName);});
        return mustAirports.every(ap=>visited.has(ap));
      });
    }
    if (avoidAirports.length){
      filtered=filtered.filter(r=>{
        const visited=new Set();
        r.forEach(f=>{visited.add(f.originName); visited.add(f.destName);});
        return avoidAirports.every(ap=>!visited.has(ap));
      });
    }

    if (!filtered.length){
      plansContainer.innerHTML='<p class="muted small">条件を満たすルートが見つかりませんでした。</p>';
      plansInfo.textContent="";
      return showToast("条件を満たす候補プランがありません");
    }

    // ---- 優先順位ソート ----
    function calcTotalWait(r){
      let waits=0;
      for (let i=1;i<r.length;i++){
        waits+=timeToMinutes(r[i].depTime)-timeToMinutes(r[i-1].arrTime);
      }
      return waits;
    }
    function calcTotalFare(r){
      return r.reduce((sum,f)=>sum+(f.fareStd||0),0);
    }

    // ★ 搭乗回数（降順）→標準料金合計（昇順）→同点なら総待ち（昇順）
    filtered.sort((a,b)=>{
      const la=a.length, lb=b.length;
      if (la!==lb) return lb-la;

      const fa=calcTotalFare(a), fb=calcTotalFare(b);
      if (fa!==fb) return fa-fb;

      const wa=calcTotalWait(a), wb=calcTotalWait(b);
      return wa-wb;
    });

    const top=filtered.slice(0,5);

    progressPercentEl.textContent = "100";
    progressBarInner.style.width = "100%";
    updateProgress(true);

    plansInfo.textContent=`候補ルート数: ${filtered.length}件（上位${top.length}件）`;

    plansContainer.innerHTML="";
    top.forEach((r,idx)=>{
      const planDiv=document.createElement("div");
      planDiv.className="plan";

      const title=document.createElement("div");
      title.className="plan-title";
      title.textContent=`候補${idx+1}：搭乗${r.length}回 / 合計${formatFare(calcTotalFare(r))}`;
      planDiv.appendChild(title);

      const table=document.createElement("table");
      table.className="plan-table";
      table.innerHTML=`
        <thead>
          <tr>
            <th>#</th><th>便名</th><th>出発空港</th><th>出発</th>
            <th>到着空港</th><th>到着</th><th>標準料金</th><th>前便から</th>
          </tr>
        </thead>
        <tbody></tbody>
      `;
      const tbody=table.querySelector("tbody");

      r.forEach((f,i)=>{
        const tr=document.createElement("tr");
        [i+1,f.flightNo,f.originName,f.depTime,f.destName,f.arrTime,formatFare(f.fareStd)].forEach(c=>{
          const td=document.createElement("td"); td.textContent=c; tr.appendChild(td);
        });
        const tdConn=document.createElement("td");
        if (i===0) tdConn.innerHTML='<span class="pill">始発</span>';
        else {
          const prev=r[i-1];
          const diff=timeToMinutes(f.depTime)-timeToMinutes(prev.arrTime);
          const ok=diff>=MIN_CONNECT_MIN && diff<=MAX_CONNECT_MIN;
          const span=document.createElement("span");
          span.className="pill "+(ok?"good":"bad");
          span.textContent=(ok?"OK ":"NG ")+minutesToHM(diff);
          tdConn.appendChild(span);
        }
        tr.appendChild(tdConn);
        tbody.appendChild(tr);
      });

      planDiv.appendChild(table);
      plansContainer.appendChild(planDiv);
    });

    showToast(`おすすめプランを ${top.length} 件生成しました`);
  } finally {
    loadingIndicator.classList.add("hidden");
    progressPanel.classList.add("hidden");
  }
}


// ==== Events ====
searchBtn.addEventListener("click", runNormalSearch);
resetBtn.addEventListener("click", ()=>{
  originSelect.value=""; destSelect.value="";
  depFromInput.value=""; depToInput.value="";
  renderSearchInitial();
});
backBtn.addEventListener("click", goBackSearch);

transitAirportsBox.addEventListener("click", (e)=>{
  const chip=e.target.closest(".chip");
  if (!chip) return;
  const none=!chip.classList.contains("chip-include") && !chip.classList.contains("chip-exclude");
  const isInclude=chip.classList.contains("chip-include");
  const isExclude=chip.classList.contains("chip-exclude");
  if (none) chip.classList.add("chip-include");
  else if (isInclude){ chip.classList.remove("chip-include"); chip.classList.add("chip-exclude"); }
  else if (isExclude){ chip.classList.remove("chip-exclude"); }
  saveSearchInputsToLocalStorage();
});

clearTransitBtn.addEventListener("click", ()=>{
  transitAirportsBox.querySelectorAll(".chip").forEach(c=>c.classList.remove("chip-include","chip-exclude"));
  showToast("経由空港の選択をクリアしました");
  saveSearchInputsToLocalStorage();
});

generatePlansBtn.addEventListener("click", generatePlans);
clearSavedBtn.addEventListener("click", clearSavedFlights);
copyScheduleBtn.addEventListener("click", copyScheduleToClipboard);
