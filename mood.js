// ---- Config emotions (8 types) ----
const EMOTIONS = [
    { id: 'love', label: 'Yêu thích', emoji: '😍', color: '#ffc0cb' },
    { id: 'happy', label: 'Vui vẻ', emoji: '😊', color: '#b8e986' },
    { id: 'calm', label: 'Bình thản', emoji: '🙂', color: '#bfe6ff' },
    { id: 'sad', label: 'Buồn', emoji: '😢', color: '#adbfd3ff' },
    { id: 'anxious', label: 'Lo lắng', emoji: '😰', color: '#ffd28e' },
    { id: 'angry', label: 'Tức giận', emoji: '😡', color: '#ff9aa2' },
    { id: 'tired', label: 'Mệt mỏi', emoji: '😪', color: '#c7c7c7' },
    { id: 'grateful', label: 'Biết ơn', emoji: '🙏', color: '#d0a6ff' },
    { id: 'zzz', label: 'None', emoji: '💤', color: '#f0eff1ff' },
];
const emotionById = Object.fromEntries(EMOTIONS.map(e => [e.id, e]));

// ---- State ----
let current = new Date();
let selectedDateStr = null; // YYYY-MM-DD
let selectedEmotion = null; // id
let fileHandle = null;      // File System Access API handle
let data = { entries: [] }; // {date:'YYYY-MM-DD', emotion:'id', note:'...'}

// ---- Helpers ----
const fmtDate = (y, m, d) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
const getDaysInMonth = (y, m) => new Date(y, m, 0).getDate(); // m: 1..12
const startWeekday = (y, m) => new Date(y, m - 1, 1).getDay();  // 0=Sun..6=Sat

function upsertEntry(dateStr, emotionId, note) {
    const idx = data.entries.findIndex(e => e.date === dateStr);
    if (idx >= 0) data.entries[idx] = { date: dateStr, emotion: emotionId, note: note || '' };
    else data.entries.push({ date: dateStr, emotion: emotionId, note: note || '' });

    // Tự động cập nhật lịch + thống kê
    renderCalendar();
    renderStatsTitle();
    drawStats();
}
function getEntry(dateStr) { return data.entries.find(e => e.date === dateStr); }


// Hiển thị ngày theo DD/MM/YYYY từ dateStr (YYYY-MM-DD)
function fmtDisplay(dateStr) {
    const d = new Date(dateStr);
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yyyy = String(d.getFullYear());
    return `${dd}/${mm}/${yyyy}`;
}


// ---- LocalStorage fallback ----
const LS_KEY = 'mood-tracker-data';
function loadFromLocal() {
    try { const raw = localStorage.getItem(LS_KEY); if (raw) data = JSON.parse(raw); } catch { }
}
function saveToLocal() { try { localStorage.setItem(LS_KEY, JSON.stringify(data)); } catch { } }

// ---- File System Access API ----

// async function pickJsonFile() {
//     try {
//         const [h] = await window.showOpenFilePicker({
//             types: [{ description: 'JSON', accept: { 'application/json': ['.json'] } }]
//         });
//         fileHandle = h;
//         document.getElementById('fileStatus').textContent = `Đã kết nối: ${fileHandle.name}`;
//         await loadFromFile();
//     } catch (e) { console.warn('pickJsonFile', e); }
// }
// async function loadFromFile() {
//     if (!fileHandle) return;
//     try {
//         const file = await fileHandle.getFile();
//         const text = await file.text();
//         data = JSON.parse(text || '{"entries":[]}');
//         renderCalendar(); renderLegend(); renderStatsTitle(); drawStats();
//     } catch (e) { console.error('loadFromFile', e); }
// }
// async function saveToFile() {
//     if (!fileHandle) { saveToLocal(); return; }
//     try {
//         const writable = await fileHandle.createWritable();
//         await writable.write(JSON.stringify(data, null, 2));
//         await writable.close();
//     } catch (e) { console.error('saveToFile', e); }
// }

async function pickJsonFile() {
    try {
        const [h] = await window.showOpenFilePicker({
            types: [{ description: 'JSON Files', accept: { 'application/json': ['.json'] } }],
            // Thêm suggestedName nếu muốn
        });

        // Xin quyền readwrite ngay từ đầu
        const permission = await h.requestPermission({ mode: 'readwrite' });
        if (permission !== 'granted') {
            alert('Bạn cần cấp quyền ghi file để ứng dụng có thể lưu dữ liệu.');
            return;
        }

        fileHandle = h;
        document.getElementById('fileStatus').textContent = `Đã kết nối: ${fileHandle.name} (có quyền ghi)`;
        await loadFromFile();
    } catch (e) {
        if (e.name !== 'AbortError') {
            console.warn('pickJsonFile error:', e);
        }
    }
}

async function saveToFile() {
    if (!fileHandle) {
        saveToLocal();
        return;
    }

    try {
        // BƯỚC QUAN TRỌNG: Kiểm tra và xin lại quyền ghi nếu cần
        const permission = await fileHandle.queryPermission({ mode: 'readwrite' });
        if (permission !== 'granted') {
            const newPermission = await fileHandle.requestPermission({ mode: 'readwrite' });
            if (newPermission !== 'granted') {
                console.warn('Không có quyền ghi file → fallback LocalStorage');
                saveToLocal();
                return;
            }
        }

        // Giờ mới ghi file
        const writable = await fileHandle.createWritable();
        await writable.write(JSON.stringify(data, null, 2));
        await writable.close();

        console.log('Đã lưu thành công vào file JSON');
    } catch (e) {
        console.error('Lỗi khi lưu file:', e);
        // Nếu có lỗi gì → fallback LocalStorage và thông báo người dùng
        saveToLocal();
        alert('Không thể lưu vào file đã chọn (quyền bị thu hồi hoặc file bị di chuyển).\nDữ liệu đã được lưu tạm trong trình duyệt.\nVui lòng chọn lại file để tiếp tục lưu vĩnh viễn.');
        
        // Tùy chọn: reset fileHandle để buộc chọn lại lần sau
        fileHandle = null;
        document.getElementById('fileStatus').textContent = 'Chưa kết nối file dữ liệu - sẽ lưu vào LocalStorage';
    }
}


// ---- Calendar rendering ----
function renderMonthYearSelectors() {
    const mSel = document.getElementById('monthSelect');
    const ySel = document.getElementById('yearSelect');
    mSel.innerHTML = '';
    for (let m = 1; m <= 12; m++) { const opt = document.createElement('option'); opt.value = m; opt.text = String(m); mSel.appendChild(opt); }
    const cy = current.getFullYear();
    const yMin = cy - 5, yMax = cy + 5;
    ySel.innerHTML = '';
    for (let y = yMin; y <= yMax; y++) { const opt = document.createElement('option'); opt.value = y; opt.text = String(y); ySel.appendChild(opt); }
    mSel.value = String(current.getMonth() + 1);
    ySel.value = String(current.getFullYear());
    mSel.onchange = () => { current.setMonth(Number(mSel.value) - 1); renderCalendar(); };
    ySel.onchange = () => { current.setFullYear(Number(ySel.value)); renderCalendar(); };
    document.getElementById('prevMonth').onclick = () => {
        const m = current.getMonth(); current.setMonth(m - 1); renderCalendar();
        mSel.value = String(current.getMonth() + 1); ySel.value = String(current.getFullYear());
    };
    document.getElementById('nextMonth').onclick = () => {
        const m = current.getMonth(); current.setMonth(m + 1); renderCalendar();
        mSel.value = String(current.getMonth() + 1); ySel.value = String(current.getFullYear());
    };
    document.getElementById('pickFile').onclick = pickJsonFile;
}

function renderCalendar() {
    const y = current.getFullYear(); const m = current.getMonth() + 1;
    const days = getDaysInMonth(y, m); const start = startWeekday(y, m);
    const cal = document.getElementById('calendar'); cal.innerHTML = '';
    const weekdays = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
    weekdays.forEach(w => { const h = document.createElement('div'); h.className = 'weekday'; h.textContent = w; cal.appendChild(h); });
    for (let i = 0; i < start; i++) {
        const empty = document.createElement('div');
        empty.className = 'day';
        empty.style.visibility = 'hidden';
        cal.appendChild(empty);
    }
    for (let d = 1; d <= days; d++) {
        const cell = document.createElement('div'); cell.className = 'day';
        cell.tabIndex = 0; // hỗ trợ focus bằng bàn phím
        const dn = document.createElement('div'); dn.className = 'day-number'; dn.textContent = String(d);
        cell.appendChild(dn);

        const dateStr = fmtDate(y, m, d);
        const entry = getEntry(dateStr);

        if (entry) {
            const emo = emotionById[entry.emotion] || EMOTIONS[0];
            const mark = document.createElement('div');
            mark.className = 'emoji-mark';
            mark.style.background = emo.color;
            mark.title = emo.label;
            mark.textContent = emo.emoji;
            cell.appendChild(mark);
        }

        // Tooltip ghi chú khi hover
        if (entry && entry.note && entry.note.trim().length > 0) {
            const dot = document.createElement('div');
            dot.className = 'note-indicator';
            cell.appendChild(dot);

            const tip = document.createElement('div');
            tip.className = 'note-tooltip';
            tip.textContent = entry.note.trim();
            // nếu ghi chú dài, chuyển tooltip sang phải
            if (entry.note.trim().length > 140) {
                tip.style.left = 'auto';
                tip.style.right = '6px';
            }
            cell.appendChild(tip);
        }

        cell.onclick = () => openModal(dateStr);
        cal.appendChild(cell);
    }
}

function renderLegend() {
    const legend = document.getElementById('legend'); legend.innerHTML = '';
    EMOTIONS.forEach(e => {
        const item = document.createElement('div'); item.className = 'legend-item';
        const dot = document.createElement('span'); dot.className = 'legend-dot'; dot.style.background = e.color;
        const txt = document.createElement('span'); txt.textContent = `${e.emoji} ${e.label}`;
        item.appendChild(dot); item.appendChild(txt); legend.appendChild(item);
    });
}

// ---- Modal (select mood) ----
function selectMood(moodId) {
    selectedEmotion = moodId;
    // reset trạng thái
    document.querySelectorAll('.mood').forEach(el => el.classList.remove('active', 'dimmed'));
    // gắn active + dimmed
    document.querySelectorAll('.mood').forEach(el => {
        if (el.dataset.id === moodId) el.classList.add('active');
        else el.classList.add('dimmed');
    });
}

function buildMoodGrid(initId = null) {
    const grid = document.getElementById('moodGrid'); grid.innerHTML = '';
    EMOTIONS.forEach(e => {
        const item = document.createElement('div'); item.className = 'mood'; item.style.background = e.color; item.dataset.id = e.id;
        item.tabIndex = 0;

        const em = document.createElement('div'); em.className = 'emoji'; em.textContent = e.emoji; item.appendChild(em);
        const label = document.createElement('div'); label.style.fontSize = '12px'; label.textContent = e.label; item.appendChild(label);

        // Trạng thái ban đầu
        if (initId === e.id) {
            item.classList.add('active');
            selectedEmotion = e.id;
        } else if (initId !== null) {
            item.classList.add('dimmed');
        }

        item.onclick = () => selectMood(e.id);
        item.onkeydown = (ev) => {
            if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); selectMood(e.id); }
        };

        grid.appendChild(item);
    });
}

function openModal(dateStr) {
    selectedDateStr = dateStr; const entry = getEntry(dateStr);
    document.getElementById('modalTitle').textContent = `Ngày ${new Date(dateStr).toLocaleDateString('vi-VN')}`;
    buildMoodGrid(entry?.emotion || null);
    document.getElementById('note').value = entry?.note || '';
    document.getElementById('backdrop').style.display = 'grid';
}
function closeModal() { document.getElementById('backdrop').style.display = 'none'; selectedEmotion = null; selectedDateStr = null; }

document.getElementById('saveBtn').onclick = async () => {
    if (!selectedDateStr || !selectedEmotion) { alert('Vui lòng chọn cảm xúc trước khi lưu.'); return; }
    const note = document.getElementById('note').value.trim();
    upsertEntry(selectedDateStr, selectedEmotion, note); // auto re-render & stats
    await saveToFile();
    closeModal();
};
document.getElementById('closeBtn').onclick = closeModal;

// ---- Stats ----
const barRects = []; // lưu vị trí cột để bắt hover {id, x, y, w, h}
function renderStatsSelectors() {
    const mSel = document.getElementById('statsMonth');
    const ySel = document.getElementById('statsYear');
    mSel.innerHTML = '';
    const optAll = document.createElement('option'); optAll.value = 'all'; optAll.text = 'Tất cả các tháng'; mSel.appendChild(optAll);
    for (let m = 1; m <= 12; m++) { const opt = document.createElement('option'); opt.value = String(m); opt.text = String(m); mSel.appendChild(opt); }
    const cy = current.getFullYear(); const yMin = cy - 5, yMax = cy + 5; ySel.innerHTML = '';
    for (let y = yMin; y <= yMax; y++) { const opt = document.createElement('option'); opt.value = String(y); opt.text = String(y); ySel.appendChild(opt); }
    mSel.value = 'all'; ySel.value = String(current.getFullYear());

    // Auto update khi đổi bộ lọc thống kê
    mSel.onchange = () => { renderStatsTitle(); drawStats(); };
    ySel.onchange = () => { renderStatsTitle(); drawStats(); };

    // Ẩn nút refresh (đã auto)
    const btn = document.getElementById('refreshStats'); if (btn) btn.style.display = 'none';
}
function renderStatsTitle() {
    const sm = document.getElementById('statsMonth').value; const sy = Number(document.getElementById('statsYear').value);
    const title = document.getElementById('statsTitle');
    if (sm === 'all') title.textContent = `Thống kê cả năm ${sy}`; else title.textContent = `Thống kê tháng ${sm}/${sy}`;
}
function drawStats() {
    const sm = document.getElementById('statsMonth').value; const sy = Number(document.getElementById('statsYear').value);
    const canvas = document.getElementById('statsCanvas'); const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    barRects.length = 0;

    // Đếm số lần theo cảm xúc
    const counts = Object.fromEntries(EMOTIONS.map(e => [e.id, 0]));
    for (const e of data.entries) {
        const dt = new Date(e.date);
        const y = dt.getFullYear(); const m = dt.getMonth() + 1;
        if (y !== sy) continue;
        if (sm !== 'all' && m !== Number(sm)) continue;
        if (counts[e.emotion] !== undefined) counts[e.emotion]++;
    }

    // Vẽ biểu đồ cột
    const keys = EMOTIONS.filter(e => e.id != "zzz").map(e => e.id); // Loại bỏ trạng thái none ra khỏi biểu đồ
    const maxVal = Math.max(1, ...Object.values(counts));
    const margin = 60; const gap = 10;
    const barW = Math.floor((canvas.width - margin * 2) / keys.length) - gap;
    const baseY = canvas.height - margin;

    ctx.font = 'bold 14px system-ui'; ctx.fillStyle = '#333'; ctx.fillText('Số lần', 30, 20);
    // Trục
    ctx.strokeStyle = '#aaa'; ctx.beginPath(); ctx.moveTo(margin, margin); ctx.lineTo(margin, baseY); ctx.lineTo(canvas.width - margin, baseY); ctx.stroke();

    keys.forEach((id, i) => {
        const val = counts[id]; const emo = emotionById[id];
        const x = margin + i * (barW + gap) + gap;
        const h = Math.round((val / maxVal) * (baseY - margin - 10));
        const yTop = baseY - h;

        ctx.fillStyle = emo.color; ctx.fillRect(x, yTop, barW, h);
        ctx.fillStyle = '#222'; ctx.textAlign = 'center';
        ctx.fillText(`${emo.emoji}`, x + barW / 2, baseY + 18);
        ctx.fillText(String(val), x + barW / 2, yTop - 6);

        // Lưu rect để bắt hover
        barRects.push({ id, x, y: yTop, w: barW, h });
    });

    // đăng ký hover sau khi vẽ
    initBarHover();
}

// Gom ngày theo tháng cho 1 emotion (theo filter stats)
function listDatesByEmotion(emotionId, sm, sy) {
    const groups = new Map(); // month -> array of {date, note}
    for (let m = 1; m <= 12; m++) groups.set(m, []);
    for (const e of data.entries) {
        const dt = new Date(e.date);
        const y = dt.getFullYear(); const m = dt.getMonth() + 1;
        if (y !== sy) continue;
        if (sm !== 'all' && m !== Number(sm)) continue;
        if (e.emotion !== emotionId) continue;
        groups.get(m).push({ date: e.date, note: e.note || '' });
    }
    return groups;
}

function initBarHover() {
    const canvas = document.getElementById('statsCanvas');
    const panel = document.getElementById('hoverPanel');
    const sm = document.getElementById('statsMonth').value;
    const sy = Number(document.getElementById('statsYear').value);

    function hidePanel() {
        panel.style.display = 'none';
        panel.innerHTML = '';
    }

    function onMove(ev) {
        const rect = canvas.getBoundingClientRect();
        const mx = ev.clientX - rect.left;
        const my = ev.clientY - rect.top;

        // Tìm cột bị hover
        const hit = barRects.find(b => mx >= b.x && mx <= b.x + b.w && my >= b.y && my <= b.y + b.h);
        if (!hit) {
            hidePanel();
            return;
        }

        const emo = emotionById[hit.id];
        const groups = listDatesByEmotion(hit.id, sm, sy);

        // Tạo nội dung panel (giữ nguyên logic cũ)
        let html = '';
        html += `<h3><span class="badge" style="background:${emo.color}">${emo.emoji}</span> ${emo.label}</h3>`;
        html += `<div style="margin:8px 0; color:#666; font-size:13px;">`;
        html += (sm === 'all') ? `Các ngày trong năm ${sy}` : `Các ngày của tháng ${sm}/${sy}`;
        html += `</div>`;

        let hasData = false;
        if (sm === 'all') {
            for (let m = 1; m <= 12; m++) {
                const arr = groups.get(m);
                if (!arr || arr.length === 0) continue;
                hasData = true;
                html += `<div class="month">Tháng ${m}</div><ul>`;
                arr.forEach(it => {
                    // const label = new Date(it.date).toLocaleDateString('vi-VN');
                    const label = it.date;
                    const note = it.note ? ` — ${escapeHtml(it.note).slice(0, 30)}${it.note.length > 30 ? '...' : ''}` : '';
                    html += `<li>${label}${note}</li>`;
                });
                html += `</ul>`;
            }
        } else {
            const arr = groups.get(Number(sm)) || [];
            if (arr.length > 0) {
                hasData = true;
                html += `<ul>`;
                arr.forEach(it => {
                    // const label = new Date(it.date).toLocaleDateString('vi-VN');
                    const label = it.date;
                    const note = it.note ? ` — ${escapeHtml(it.note).slice(0, 30)}${it.note.length > 30 ? '...' : ''}` : '';
                    html += `<li>${label}${note}</li>`;
                });
                html += `</ul>`;
            }
        }

        if (!hasData) {
            html += `<div class="empty">Không có ngày nào.</div>`;
        }

        panel.innerHTML = html;
        panel.style.display = 'block';

        // === PHẦN MỚI: Đặt vị trí panel gần con trỏ chuột ===
        // Khoảng cách từ chuột đến panel
        const offsetX = 15;
        const offsetY = 15;

        let left = ev.clientX + offsetX;
        let top = ev.clientY + offsetY;

        // Lấy kích thước panel sau khi nội dung được render
        const panelRect = panel.getBoundingClientRect();

        // Nếu panel tràn sang phải → lật sang trái chuột
        if (left + panelRect.width > window.innerWidth) {
            left = ev.clientX - panelRect.width - offsetX;
        }

        // Nếu panel tràn xuống dưới → lật lên trên chuột
        if (top + panelRect.height > window.innerHeight) {
            top = ev.clientY - panelRect.height - offsetY;
        }

        // Đảm bảo không tràn trái/trên (dự phòng)
        if (left < 0) left = 10;
        if (top < 0) top = 10;

        panel.style.left = left + 'px';
        panel.style.top = top + 'px';
        panel.style.right = 'auto';  // quan trọng: bỏ right cố định
        panel.style.position = 'fixed';  // dùng fixed để theo toàn màn hình
    }

    // Gắn sự kiện
    canvas.addEventListener('mousemove', onMove);
    canvas.addEventListener('mouseleave', hidePanel);
    canvas.addEventListener('click', hidePanel); // hỗ trợ mobile: click để ẩn
}

// escape HTML để tránh chèn script trong ghi chú
function escapeHtml(str) {
    return String(str)
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');
}

// ---- Boot ----
function boot() {
    renderMonthYearSelectors(); renderCalendar(); renderLegend();
    renderStatsSelectors(); renderStatsTitle(); drawStats();
    loadFromLocal(); renderCalendar(); renderStatsTitle(); drawStats();
}
boot();
