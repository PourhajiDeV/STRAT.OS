const storageKey = "STRATOS_DATA";
const historicalKey = "STRATOS_HISTORICAL";
let fileHandle = null;

const IRAN_HOLIDAYS_OFFLINE = {
    "1/1": "جشن نوروز - تعطیل رسمی", "1/2": "عید نوروز - تعطیل رسمی", "1/3": "عید نوروز - تعطیل رسمی", "1/4": "عید نوروز - تعطیل رسمی",
    "1/12": "روز جمهوری اسلامی", "1/13": "روز طبیعت (سیزده بدر)",
    "3/14": "رحلت امام خمینی", "3/15": "قیام ۱۵ خرداد",
    "11/22": "پیروزی انقلاب اسلامی", "12/29": "ملی شدن صنعت نفت"
};

function getIranianHoliday(dateObj) {
    if (dateObj.getDay() === 5) return "جمعه (تعطیل پایان هفته)";
    try {
        let parts = new Intl.DateTimeFormat('en-US-u-ca-persian', {month:'numeric', day:'numeric'}).format(dateObj).split('/');
        let md = parts[0] + '/' + parts[1];
        return IRAN_HOLIDAYS_OFFLINE[md] || null;
    } catch(e) { return null; }
}

let appState = JSON.parse(localStorage.getItem(storageKey)) || {
    tasks: [], habits: {}, goals: [], workoutProgram: {}, notes: "", 
    isDayEnded: false, lastDateStr: new Date().toDateString(),
    calLang: "fa", timezone: "Asia/Tehran", theme: "theme-cyberpunk", profileTheme: "pt-cyber",
    userName: "فرمانده استراتژیک", userRole: "STRAT.OS ELITE OPERATOR",
    userBio: "«تمرکز روی اهداف، کلید فتح آینده است...»", userAvatar: "shield",
    dailyLogs: {}, dbEngine: "local", mysqlEndpoint: "",
    streak: 0, lastStreakDate: "", points: 0, dailyPointsToday: 0, lastPointsDate: "", weeklyBonusDate: ""
};

if(!appState.workoutProgram || !appState.workoutProgram["شنبه"]) {
    appState.workoutProgram = { "شنبه": [], "یکشنبه": [], "دوشنبه": [], "سه_شنبه": [], "چهارشنبه": [], "پنجشنبه": [], "جمعه": [] };
}

let histData = JSON.parse(localStorage.getItem(historicalKey)) || {
    days: {"شنبه":0,"۱شنبه":0,"۲شنبه":0,"۳شنبه":0,"۴شنبه":0,"۵شنبه":0,"جمعه":0},
    totalCompleted: 0, totalFailed: 0, completionHours: [],
    priorityStats: { highDone: 0, highTotal: 0, medDone: 0, medTotal: 0, lowDone: 0, lowTotal: 0 }
};

let selectedCalDateStr = new Date().toDateString();
let activeWorkoutDay = "شنبه";

document.addEventListener("DOMContentLoaded", () => {
    document.body.className = appState.theme || 'theme-cyberpunk';
    const cardEl = document.getElementById('export-card-dom');
    if(cardEl) cardEl.className = `profile-export-card ${appState.profileTheme || 'pt-cyber'}`;
    updateThemeCardsUI();
    checkNewDay();
    
    document.getElementById('notes-area').value = appState.notes || "";
    document.getElementById('config-calendar-type').value = appState.calLang;
    document.getElementById('config-timezone').value = appState.timezone;
    document.getElementById('db-engine-select').value = appState.dbEngine || "local";
    changeDbEngine();

    if(appState.userName) {
        document.getElementById('prof-display-name').innerText = appState.userName;
        document.getElementById('prof-name-input').value = appState.userName;
    }
    if(appState.userRole) {
        document.getElementById('prof-display-role').innerText = appState.userRole;
        document.getElementById('prof-role-input').value = appState.userRole;
    }
    if(appState.userBio) {
        document.getElementById('prof-display-bio').innerText = appState.userBio;
        document.getElementById('prof-bio-input').value = appState.userBio;
    }
    if(appState.userAvatar) {
        document.getElementById('prof-display-avatar').innerHTML = `<svg class="ico"><use href="#i-${appState.userAvatar}"/></svg>`;
        document.getElementById('prof-avatar-select').value = appState.userAvatar;
    }
    if(appState.mysqlEndpoint) {
        document.getElementById('mysql-endpoint-input').value = appState.mysqlEndpoint;
    }

    setInterval(updateLiveTime, 1000);
    setInterval(checkTaskDeadlines, 10000);
    refreshUI();
    generateCalendarGrid();
    renderWorkoutHub();
    renderAnalytics();
});

function changeDbEngine() {
    const engine = document.getElementById('db-engine-select').value;
    appState.dbEngine = engine;
    saveToDatabase();

    const sqlitePanel = document.getElementById('sqlite-config-panel');
    const mysqlPanel = document.getElementById('mysql-config-panel');
    const activeText = document.getElementById('db-active-engine');
    const descText = document.getElementById('db-status-desc');

    sqlitePanel.style.display = "none";
    mysqlPanel.style.display = "none";

    if(engine === 'sqlite') {
        sqlitePanel.style.display = "block";
        activeText.innerText = "SQLite (Local File System)";
        descText.innerText = "ذخیره‌سازی مستقیم روی فایل انتخابی در سیستم شما.";
    } else if(engine === 'mysql') {
        mysqlPanel.style.display = "block";
        activeText.innerText = "MySQL / REST API Server";
        descText.innerText = "ارسال زنده کوئری‌ها و اطلاعات به سرور بک‌اند.";
    } else {
        activeText.innerText = "LocalStorage (مرورگر)";
        descText.innerText = "داده‌ها در حافظه امن مرورگر ذخیره می‌شوند.";
    }
}

async function connectLocalSqliteFile() {
    if ('showSaveFilePicker' in window) {
        try {
            const options = {
                suggestedName: 'STRATOS_Database.sqlite',
                types: [{ description: 'SQLite / STRATOS Database', accept: { 'application/x-sqlite3': ['.sqlite', '.db', '.json'] } }]
            };
            fileHandle = await window.showSaveFilePicker(options);
            alert(`فایل دیتابیس با موفقیت متصل شد:\n${fileHandle.name}\nاز این پس تمام اطلاعات روی این فایل در سیستم شما نوشته می‌شود.`);
            saveToDatabase();
        } catch (err) {}
    } else {
        alert("مرورگر شما از قابلیت File System Access API پشتیبانی نمی‌کند. لطفاً از Google Chrome یا Edge استفاده کنید.");
    }
}

function saveMysqlConfig() {
    const endpoint = document.getElementById('mysql-endpoint-input').value.trim();
    appState.mysqlEndpoint = endpoint;
    saveToDatabase();
    alert("آدرس سرور MySQL ذخیره شد. درخواست‌ها به این آدرس ارسال خواهند شد.");
}

function saveToDatabase() {
    localStorage.setItem(storageKey, JSON.stringify(appState));
    localStorage.setItem(historicalKey, JSON.stringify(histData));
    if (appState.dbEngine === 'sqlite' && fileHandle) writeToLocalFile();
    if (appState.dbEngine === 'mysql' && appState.mysqlEndpoint) sendToMysqlServer();
}

async function writeToLocalFile() {
    try {
        const writable = await fileHandle.createWritable();
        const fullBackup = { appState, histData, exportDate: new Date().toISOString() };
        await writable.write(JSON.stringify(fullBackup, null, 2));
        await writable.close();
    } catch(e) {}
}

function sendToMysqlServer() {
    fetch(appState.mysqlEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: "sync_db", payload: { appState, histData } })
    }).catch(e => {});
}

function exportDatabase() {
    const fullBackup = { appState, histData, exportDate: new Date().toISOString() };
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(fullBackup, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", `STRATOS_Backup_${new Date().toISOString().slice(0,10)}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
}

function importDatabase(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const imported = JSON.parse(e.target.result);
            if (imported.appState && imported.histData) {
                appState = imported.appState;
                histData = imported.histData;
                saveToDatabase();
                alert("اطلاعات دیتابیس با موفقیت بازیابی شد!");
                location.reload();
            } else { alert("فایل انتخاب‌شده ساختار معتبری برای STRAT.OS ندارد."); }
        } catch(err) { alert("خطا در پردازش فایل JSON."); }
    };
    reader.readAsText(file);
}

function applyTheme(themeName, element) {
    document.body.className = themeName;
    appState.theme = themeName;
    saveToDatabase();
    document.querySelectorAll('.panel .themes-grid:last-of-type .theme-card').forEach(c => c.classList.remove('active'));
    if(element) element.classList.add('active');
}

function applyProfileTheme(themeClass, element) {
    const cardEl = document.getElementById('export-card-dom');
    if(cardEl) {
        cardEl.className = `profile-export-card ${themeClass}`;
        appState.profileTheme = themeClass;
        saveToDatabase();
        document.querySelectorAll('.panel .themes-grid:first-of-type .theme-card').forEach(c => c.classList.remove('active'));
        if(element) element.classList.add('active');
    }
}

function updateThemeCardsUI() {
    document.querySelectorAll('.panel .themes-grid:last-of-type .theme-card').forEach(c => {
        c.classList.remove('active');
        if(c.classList.contains('tc-' + (appState.theme || '').replace('theme-', ''))) c.classList.add('active');
    });
    document.querySelectorAll('.panel .themes-grid:first-of-type .theme-card').forEach(c => {
        c.classList.remove('active');
        if(c.classList.contains('tc-' + (appState.profileTheme || '').replace('pt-', '').replace('oled','night').replace('cyber','cyberpunk'))) c.classList.add('active');
    });
}

function checkNewDay() {
    let todayStr = new Date().toDateString();
    if (appState.lastDateStr !== todayStr) {
        logCurrentDayStats(appState.lastDateStr);
        appState.lastDateStr = todayStr;
        appState.isDayEnded = false;
        appState.tasks = [];
        for(let h in appState.habits) appState.habits[h].current = 0;
        saveToDatabase();
    }
    if(appState.lastPointsDate !== todayStr) {
        appState.dailyPointsToday = 0;
        appState.lastPointsDate = todayStr;
        saveToDatabase();
    }
}

function logCurrentDayStats(dateStr) {
    let done = appState.tasks.filter(t => t.done).length;
    let total = appState.tasks.length;
    let peakHour = histData.completionHours.length > 0 ? 
        histData.completionHours.slice(-1)[0] + ":00" : "ثبت نشده";
    appState.dailyLogs[dateStr] = { tasksDone: done, totalTasks: total, peakHour: peakHour, note: appState.notes || "" };
}

function updateLiveTime() {
    const now = new Date();
    const locale = appState.calLang === "fa" ? 'fa-IR' : 'en-US';
    document.getElementById('live-date').innerText = now.toLocaleDateString(locale, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    document.getElementById('live-clock').innerText = now.toLocaleTimeString('en-US', { timeZone: appState.timezone, hour12: false });
}

function changeConfig() {
    appState.calLang = document.getElementById('config-calendar-type').value;
    appState.timezone = document.getElementById('config-timezone').value;
    refreshUI();
}

function switchAppView(viewId, element) {
    document.querySelectorAll('.nav-item').forEach(item => item.classList.remove('active'));
    element.classList.add('active');
    document.querySelectorAll('.app-view').forEach(view => view.classList.remove('active-view'));
    document.getElementById(`view-${viewId}`).classList.add('active-view');
    
    let titles = { 
        dashboard: "داشبورد استراتژیک", 
        workout: "برنامه ورزشی حرفه‌ای STRAT.OS",
        goals: "اهداف و چشم‌انداز کلان",
        timers: "زمان‌سنج و تمرکز", 
        calendar: "تقویم و گزارش‌ها", 
        profile: "پروفایل و تم‌ها", 
        analytics: "آنالیز عملکرد", 
        about: "درباره STRAT.OS", 
        settings: "تنظیمات عمومی" 
    };
    document.getElementById('view-title').innerText = titles[viewId] || "STRAT.OS";

    if(viewId === 'workout') renderWorkoutHub();
    if(viewId === 'goals') renderGoals();
    if(viewId === 'analytics') renderAnalytics();
    if(viewId === 'profile') renderProfileStats();
    if(viewId === 'calendar') generateCalendarGrid();
}

function toggleEndDay() {
    appState.isDayEnded = !appState.isDayEnded;
    if(appState.isDayEnded) logCurrentDayStats(new Date().toDateString());
    refreshUI();
}

function refreshUI() {
    saveToDatabase();

    document.getElementById('header-streak').innerText = `🔥 ${appState.streak || 0} روز استریک`;
    document.getElementById('header-points').innerText = `${appState.points || 0} امتیاز`;

    const endBtn = document.getElementById('end-day-btn');
    const taskPanel = document.getElementById('task-panel');
    if(appState.isDayEnded) {
        endBtn.innerHTML = '<svg class="ico"><use href="#i-lock"/></svg><span>ادامه روز / قفل</span>';
        endBtn.className = "status-badge status-ended";
        taskPanel.classList.add('locked');
    } else {
        endBtn.innerHTML = '<svg class="ico"><use href="#i-unlock"/></svg><span>پایان روز / قفل</span>';
        endBtn.className = "status-badge status-active";
        taskPanel.classList.remove('locked');
    }

    const listContainer = document.getElementById('task-list');
    listContainer.innerHTML = '';
    let doneCount = 0; let failCount = 0;

    appState.tasks.forEach(task => {
        if(task.done) doneCount++;
        if(task.failed) failCount++;

        let priorityText = task.priority === 'high' ? 'High' : (task.priority === 'medium' ? 'Med' : 'Low');
        let timeText = (task.start || task.end) ? `<div class="task-time-info"><svg class="ico"><use href="#i-clock"/></svg> ${task.start || '...'} الی ${task.end || '...'}</div>` : "";
        let stateClass = task.done ? 'completed' : (task.failed ? 'failed' : '');
        
        const li = document.createElement('li');
        li.className = `task-item ${stateClass}`;
        li.innerHTML = `
            <div class="task-left">
                ${!task.failed ? `<div class="check-container" onclick="toggleTask(${task.id})"><svg class="ico" style="${task.done ? '' : 'display:none;'}"><use href="#i-check"/></svg></div>` : '<svg class="ico" style="color:#fb7185;"><use href="#i-xmark"/></svg>'}
                <div class="task-text"><span>${task.text}</span>${timeText}</div>
            </div>
            <div style="display:flex; align-items:center; gap:8px; flex-shrink:0;">
                <span class="badge ${task.priority}">${priorityText}</span>
                <div class="task-actions">
                    ${!task.done && !task.failed ? `<button class="action-btn fail" onclick="markTaskFail(${task.id})"><svg class="ico"><use href="#i-xmark"/></svg></button>` : ''}
                    <button class="action-btn del" onclick="deleteTask(${task.id})"><svg class="ico"><use href="#i-trash"/></svg></button>
                </div>
            </div>
        `;
        listContainer.appendChild(li);
    });

    const habitContainer = document.getElementById('habits-list');
    habitContainer.innerHTML = '';
    for(let id in appState.habits) {
        const h = appState.habits[id];
        habitContainer.innerHTML += `
            <div class="habit-card">
                <div class="habit-details"><h4>${h.name}</h4><p>${h.current} از ${h.target} تیک</p></div>
                <div class="habit-ctrls">
                    <button class="action-btn del" onclick="deleteHabit('${id}')"><svg class="ico"><use href="#i-trash"/></svg></button>
                    <button class="btn-inc" onclick="adjustHabit('${id}', -1)"><svg class="ico"><use href="#i-minus"/></svg></button>
                    <button class="btn-inc" onclick="adjustHabit('${id}', 1)"><svg class="ico"><use href="#i-plus"/></svg></button>
                </div>
            </div>`;
    }

    document.getElementById('kpi-total').innerText = appState.tasks.length;
    document.getElementById('kpi-done').innerText = doneCount;
    document.getElementById('kpi-failed').innerText = failCount;
    document.getElementById('kpi-today-points').innerText = `${appState.dailyPointsToday || 0} / 15`;

    updateHistoryChartData(doneCount, appState.tasks.length);
    logCurrentDayStats(new Date().toDateString());
}

function addNewTask() {
    if(appState.isDayEnded) return;
    const text = document.getElementById('task-input').value.trim();
    if(!text) return;
    const priority = document.getElementById('task-priority').value;
    appState.tasks.push({
        id: Date.now(), text: text, priority: priority,
        start: document.getElementById('task-start').value,
        end: document.getElementById('task-end').value,
        done: false, failed: false
    });
    if(!histData.priorityStats) histData.priorityStats = { highDone: 0, highTotal: 0, medDone: 0, medTotal: 0, lowDone: 0, lowTotal: 0 };
    histData.priorityStats[priority + 'Total']++;
    document.getElementById('task-input').value = '';
    refreshUI();
}

function toggleTask(id) {
    if(appState.isDayEnded) return;
    const t = appState.tasks.find(x => x.id === id);
    if(t && !t.failed) {
        t.done = !t.done;
        let todayStr = new Date().toDateString();
        if(appState.lastPointsDate !== todayStr) { appState.dailyPointsToday = 0; appState.lastPointsDate = todayStr; }

        if(!histData.priorityStats) histData.priorityStats = { highDone: 0, highTotal: 0, medDone: 0, medTotal: 0, lowDone: 0, lowTotal: 0 };
        
        let pts = t.priority === 'high' ? 5 : (t.priority === 'medium' ? 3 : 2);
        
        if(t.done) {
            histData.totalCompleted++;
            histData.completionHours.push(new Date().getHours());
            histData.priorityStats[t.priority + 'Done']++;

            let available = 15 - (appState.dailyPointsToday || 0);
            let toAdd = Math.min(pts, Math.max(0, available));
            appState.dailyPointsToday = (appState.dailyPointsToday || 0) + toAdd;
            appState.points = (appState.points || 0) + toAdd;

            if(appState.lastStreakDate !== todayStr) {
                let yest = new Date(); yest.setDate(yest.getDate() - 1);
                if(appState.lastStreakDate === yest.toDateString()) {
                    appState.streak = (appState.streak || 0) + 1;
                } else {
                    appState.streak = 1;
                }
                appState.lastStreakDate = todayStr;
            }

            if(new Date().getDay() === 5 && (appState.streak || 0) >= 7 && appState.weeklyBonusDate !== todayStr) {
                appState.points += 50;
                appState.weeklyBonusDate = todayStr;
                triggerAlertNotification("🎉 پاداش استریک هفتگی!", "شما ۷ روز استریک کامل داشتید! ۵۰ امتیاز هدیه به شما تعلق گرفت.");
            }
        } else {
            histData.totalCompleted = Math.max(0, histData.totalCompleted - 1);
            histData.priorityStats[t.priority + 'Done'] = Math.max(0, histData.priorityStats[t.priority + 'Done'] - 1);

            appState.dailyPointsToday = Math.max(0, (appState.dailyPointsToday || 0) - pts);
            appState.points = Math.max(0, (appState.points || 0) - pts);
        }
        refreshUI();
    }
}

function markTaskFail(id) {
    if(appState.isDayEnded) return;
    const t = appState.tasks.find(x => x.id === id);
    if(t && !t.done && !t.failed) { t.failed = true; histData.totalFailed++; refreshUI(); }
}

function deleteTask(id) {
    if(appState.isDayEnded) return;
    const t = appState.tasks.find(x => x.id === id);
    if(t && histData.priorityStats) {
        histData.priorityStats[t.priority + 'Total'] = Math.max(0, histData.priorityStats[t.priority + 'Total'] - 1);
        if(t.done) {
            histData.priorityStats[t.priority + 'Done'] = Math.max(0, histData.priorityStats[t.priority + 'Done'] - 1);
            let pts = t.priority === 'high' ? 5 : (t.priority === 'medium' ? 3 : 2);
            appState.dailyPointsToday = Math.max(0, (appState.dailyPointsToday || 0) - pts);
            appState.points = Math.max(0, (appState.points || 0) - pts);
        }
    }
    appState.tasks = appState.tasks.filter(t => t.id !== id);
    refreshUI();
}

function checkTaskDeadlines() {
    if(appState.isDayEnded) return;
    const now = new Date().toLocaleTimeString('en-US', {hour12: false, hour:'2-digit', minute:'2-digit'});
    let needsRefresh = false;
    appState.tasks.forEach(t => {
        if(!t.done && !t.failed && t.end && now > t.end) { t.failed = true; histData.totalFailed++; needsRefresh = true; }
    });
    if(needsRefresh) refreshUI();
}

function createNewHabit() {
    const name = document.getElementById('habit-name-input').value.trim();
    if(!name) return;
    appState.habits["h_" + Date.now()] = { name: name, current: 0, target: parseInt(document.getElementById('habit-target-input').value)||1 };
    document.getElementById('habit-name-input').value = '';
    refreshUI();
}
function adjustHabit(id, val) { if(appState.habits[id]) { appState.habits[id].current = Math.max(0, appState.habits[id].current + val); refreshUI(); } }
function deleteHabit(id) { delete appState.habits[id]; refreshUI(); }
function saveCurrentNotes() { appState.notes = document.getElementById('notes-area').value; saveToDatabase(); }

function selectFitCat(cat, el) {
    document.querySelectorAll('.fit-cat-selector .fit-cat-pill').forEach(p => p.classList.remove('active'));
    if(el) el.classList.add('active');
    document.getElementById('work-exc-category').value = cat;
}

function selectWorkoutDay(day) {
    activeWorkoutDay = day;
    renderWorkoutHub();
}

function addNewWorkoutExercise() {
    const name = document.getElementById('work-exc-name').value.trim();
    if(!name) return;
    const cat = document.getElementById('work-exc-category').value || "سینه";
    const sets = document.getElementById('work-exc-sets').value || "4";
    const reps = document.getElementById('work-exc-reps').value || "12";
    const weight = document.getElementById('work-exc-weight').value || "وزن بدن";
    const rest = document.getElementById('work-exc-rest').value || "60";

    if(!appState.workoutProgram[activeWorkoutDay]) appState.workoutProgram[activeWorkoutDay] = [];
    
    appState.workoutProgram[activeWorkoutDay].push({
        id: Date.now(), name: name, category: cat, sets: sets, reps: reps, weight: weight, rest: rest, logged: false
    });

    document.getElementById('work-exc-name').value = '';
    document.getElementById('work-exc-weight').value = '';

    saveToDatabase();
    renderWorkoutHub();
}

function deleteWorkoutExercise(day, id) {
    appState.workoutProgram[day] = appState.workoutProgram[day].filter(x => x.id !== id);
    saveToDatabase();
    renderWorkoutHub();
}

function logWorkoutExerciseAsTask(day, id) {
    const exercise = appState.workoutProgram[day].find(x => x.id === id);
    if(!exercise) return;
    
    appState.tasks.push({
        id: Date.now(),
        text: `🏋️ تمرین: ${exercise.name} (${exercise.sets} ست × ${exercise.reps} تکرار)`,
        priority: "medium",
        start: "",
        end: "",
        done: false,
        failed: false
    });
    
    saveToDatabase();
    refreshUI();
    alert(`حرکت «${exercise.name}» به لیست تسک‌های استراتژیک امروز اضافه شد!`);
}

function calculate1RM() {
    const w = parseFloat(document.getElementById('calc-weight').value);
    const r = parseInt(document.getElementById('calc-reps').value);
    const resBox = document.getElementById('calc-result-box');
    if(!w || !r || r < 1) { resBox.innerHTML = `تخمین رکورد شما: <span style="color:#fb7185;">اطلاعات نامعتبر</span>`; return; }
    
    const oneRm = Math.round(w * (1 + r / 30));
    resBox.innerHTML = `تخمین رکورد ۱ تکرار بیشینه (1RM): <span style="color:#34d399; font-size:16px;">${oneRm} کیلوگرم</span>`;
}

function clearAllWorkoutData() {
    if(confirm("آیا از حذف کل برنامه ورزشی هفته اطمینان دارید؟")) {
        appState.workoutProgram = { "شنبه": [], "یکشنبه": [], "دوشنبه": [], "سه_شنبه": [], "چهارشنبه": [], "پنجشنبه": [], "جمعه": [] };
        saveToDatabase();
        renderWorkoutHub();
    }
}

function loadEliteRoutine(type) {
    if(!confirm("با بارگذاری برنامه جدید، تمرینات فعلی شما جایگزین می‌شوند. موافقید؟")) return;
    
    if(type === 'ppl') {
        appState.workoutProgram = {
            "شنبه": [
                { id: 1, name: "پرس سینه هالتر", category: "سینه", sets: "4", reps: "10", weight: "70kg", rest: "90" },
                { id: 2, name: "پرس بالاسینه دمبل", category: "سینه", sets: "4", reps: "12", weight: "25kg", rest: "75" },
                { id: 3, name: "پرس سرشانه دمبل نشسته", category: "سرشانه", sets: "4", reps: "10", weight: "20kg", rest: "75" },
                { id: 4, name: "نشر جانب سیمکش", category: "سرشانه", sets: "3", reps: "15", weight: "15kg", rest: "60" },
                { id: 5, name: "پشت بازو سیمکش ایستاده", category: "پشت بازو", sets: "4", reps: "12", weight: "25kg", rest: "60" }
            ],
            "یکشنبه": [
                { id: 6, name: "بارفیکس دست باز", category: "زیربغل و پشت", sets: "4", reps: "8", weight: "وزن بدن", rest: "90" },
                { id: 7, name: "زیربغل قایقی سیمکش", category: "زیربغل و پشت", sets: "4", reps: "12", weight: "50kg", rest: "75" },
                { id: 8, name: "فیس پول (Face Pull)", category: "سرشانه", sets: "3", reps: "15", weight: "20kg", rest: "60" },
                { id: 9, name: "جلو بازو هالتر ایستاده", category: "جلو بازو", sets: "4", reps: "10", weight: "30kg", rest: "60" },
                { id: 10, name: "جلو بازو چکشی دمبل", category: "جلو بازو", sets: "3", reps: "12", weight: "15kg", rest: "60" }
            ],
            "دوشنبه": [
                { id: 11, name: "اسکات هالتر از پشت", category: "پا", sets: "4", reps: "8", weight: "90kg", rest: "120" },
                { id: 12, name: "پرس پا دستگاه", category: "پا", sets: "4", reps: "12", weight: "150kg", rest: "90" },
                { id: 13, name: "پشت پا ماشین خوابیده", category: "پا", sets: "4", reps: "12", weight: "40kg", rest: "60" },
                { id: 14, name: "ساق پا ایستاده", category: "پا", sets: "4", reps: "20", weight: "60kg", rest: "45" },
                { id: 15, name: "کرانچ شکم خلبانی", category: "شکم و فیله", sets: "4", reps: "15", weight: "وزن بدن", rest: "45" }
            ],
            "سه_شنبه": [],
            "چهارشنبه": [
                { id: 16, name: "پرس سینه دمبل", category: "سینه", sets: "4", reps: "10", weight: "30kg", rest: "90" },
                { id: 17, name: "قفسه سینه دستگاه (پک دک)", category: "سینه", sets: "3", reps: "15", weight: "40kg", rest: "60" },
                { id: 18, name: "نشر از جلو دمبل", category: "سرشانه", sets: "3", reps: "12", weight: "12kg", rest: "60" },
                { id: 19, name: "پشت بازو هالتر خوابیده (سوپینِیت)", category: "پشت بازو", sets: "4", reps: "10", weight: "30kg", rest: "75" }
            ],
            "پنجشنبه": [
                { id: 20, name: "لت از جلو دست باز (سیمکش)", category: "زیربغل و پشت", sets: "4", reps: "12", weight: "55kg", rest: "75" },
                { id: 21, name: "زیربغل دمبل تک خم", category: "زیربغل و پشت", sets: "4", reps: "10", weight: "25kg", rest: "75" },
                { id: 22, name: "جلو بازو لاری دستگاه", category: "جلو بازو", sets: "4", reps: "12", weight: "25kg", rest: "60" },
                { id: 23, name: "پلانک ایزومتریک", category: "شکم و فیله", sets: "3", reps: "1", weight: "60 ثانیه", rest: "45" }
            ],
            "جمعه": []
        };
    } else if(type === 'fullbody') {
        appState.workoutProgram = {
            "شنبه": [
                { id: 31, name: "اسکات هالتر", category: "پا", sets: "3", reps: "10", weight: "80kg", rest: "90" },
                { id: 32, name: "پرس سینه هالتر", category: "سینه", sets: "3", reps: "10", weight: "65kg", rest: "90" },
                { id: 33, name: "زیربغل قایقی", category: "زیربغل و پشت", sets: "3", reps: "12", weight: "45kg", rest: "75" },
                { id: 34, name: "پرس سرشانه دمبل", category: "سرشانه", sets: "3", reps: "12", weight: "18kg", rest: "60" }
            ],
            "یکشنبه": [],
            "دوشنبه": [
                { id: 35, name: "ددلیفت رومانیایی", category: "پا", sets: "3", reps: "10", weight: "70kg", rest: "90" },
                { id: 36, name: "لت از جلو سیمکش", category: "زیربغل و پشت", sets: "3", reps: "12", weight: "50kg", rest: "75" },
                { id: 37, name: "پرس بالاسینه دمبل", category: "سینه", sets: "3", reps: "10", weight: "22kg", rest: "75" },
                { id: 38, name: "جلو بازو دمبل تناوبی", category: "جلو بازو", sets: "3", reps: "12", weight: "14kg", rest: "60" }
            ],
            "سه_شنبه": [],
            "چهارشنبه": [
                { id: 39, name: "پرس پا ماشین", category: "پا", sets: "3", reps: "15", weight: "140kg", rest: "90" },
                { id: 40, name: "بارفیکس", category: "زیربغل و پشت", sets: "3", reps: "8", weight: "وزن بدن", rest: "75" },
                { id: 41, name: "شنا سوئدی دیپ", category: "سینه", sets: "3", reps: "15", weight: "وزن بدن", rest: "60" },
                { id: 42, name: "کرانچ شکم روی میز", category: "شکم و فیله", sets: "4", reps: "20", weight: "وزن بدن", rest: "45" }
            ],
            "پنجشنبه": [],
            "جمعه": []
        };
    } else {
        appState.workoutProgram = {
            "شنبه": [ { id: 51, name: "پرس سینه هالتر", category: "سینه", sets: "4", reps: "10", weight: "75kg", rest: "90" }, { id: 52, name: "پرس بالاسینه دمبل", category: "سینه", sets: "4", reps: "12", weight: "26kg", rest: "75" }, { id: 53, name: "قفسه سینه دمبل", category: "سینه", sets: "4", reps: "12", weight: "16kg", rest: "60" }, { id: 54, name: "کراس اور سیمکش", category: "سینه", sets: "4", reps: "15", weight: "20kg", rest: "60" } ],
            "یکشنبه": [ { id: 55, name: "لت از جلو دست باز", category: "زیربغل و پشت", sets: "4", reps: "10", weight: "60kg", rest: "90" }, { id: 56, name: "زیربغل هالتر خم", category: "زیربغل و پشت", sets: "4", reps: "10", weight: "60kg", rest: "90" }, { id: 57, name: "زیربغل قایقی دست جمع", category: "زیربغل و پشت", sets: "4", reps: "12", weight: "55kg", rest: "75" }, { id: 58, name: "پول اور دمبل", category: "زیربغل و پشت", sets: "3", reps: "15", weight: "22kg", rest: "60" } ],
            "دوشنبه": [ { id: 59, name: "پرس سرشانه هالتر از جلو", category: "سرشانه", sets: "4", reps: "10", weight: "45kg", rest: "90" }, { id: 60, name: "نشر جانب دمبل", category: "سرشانه", sets: "4", reps: "15", weight: "12kg", rest: "60" }, { id: 61, name: "نشر خم دمبل (پشت سرشانه)", category: "سرشانه", sets: "4", reps: "15", weight: "10kg", rest: "60" }, { id: 62, name: "شراگ دمبل", category: "سرشانه", sets: "4", reps: "15", weight: "30kg", rest: "60" } ],
            "سه_شنبه": [ { id: 63, name: "جلو بازو هالتر", category: "جلو بازو", sets: "4", reps: "10", weight: "30kg", rest: "75" }, { id: 64, name: "جلو بازو دمبل روی میز شیبدار", category: "جلو بازو", sets: "4", reps: "12", weight: "14kg", rest: "60" }, { id: 65, name: "پشت بازو هالتر خوابیده", category: "پشت بازو", sets: "4", reps: "10", weight: "35kg", rest: "75" }, { id: 66, name: "پشت بازو سیمکش طناب", category: "پشت بازو", sets: "4", reps: "15", weight: "25kg", rest: "60" } ],
            "چهارشنبه": [ { id: 67, name: "اسکات هالتر", category: "پا", sets: "4", reps: "8", weight: "95kg", rest: "120" }, { id: 68, name: "پرس پا دستگاه", category: "پا", sets: "4", reps: "12", weight: "160kg", rest: "90" }, { id: 69, name: "جلو پا ماشین", category: "پا", sets: "4", reps: "15", weight: "50kg", rest: "60" }, { id: 70, name: "پشت پا ماشین خوابیده", category: "پا", sets: "4", reps: "12", weight: "45kg", rest: "60" } ],
            "پنجشنبه": [],
            "جمعه": []
        };
    }
    
    saveToDatabase();
    renderWorkoutHub();
    alert("برنامه الیت با موفقیت بارگذاری و جایگزین شد!");
}

function renderWorkoutHub() {
    const days = ["شنبه", "یکشنبه", "دوشنبه", "سه_شنبه", "چهارشنبه", "پنجشنبه", "جمعه"];
    const daysDisplay = ["شنبه", "یکشنبه", "دوشنبه", "سه‌شنبه", "چهارشنبه", "پنجشنبه", "جمعه"];
    const selectorEl = document.getElementById("fit-days-selector");
    if(!selectorEl) return;
    
    selectorEl.innerHTML = "";
    let totalExc = 0; let activeDaysCount = 0; let totalSets = 0;
    let catCounts = {};

    days.forEach((day, idx) => {
        const list = appState.workoutProgram[day] || [];
        const count = list.length;
        if(count > 0) activeDaysCount++;
        totalExc += count;

        list.forEach(ex => {
            totalSets += (parseInt(ex.sets) || 0);
            catCounts[ex.category] = (catCounts[ex.category] || 0) + 1;
        });

        const pill = document.createElement("div");
        pill.className = `fit-day-pill ${day === activeWorkoutDay ? 'active' : ''}`;
        pill.onclick = () => selectWorkoutDay(day);
        pill.innerHTML = `
            <span class="fit-day-name">${daysDisplay[idx]}</span>
            <span class="fit-day-count">${count} حرکت</span>
        `;
        selectorEl.appendChild(pill);
    });

    document.getElementById("fit-stat-total").innerText = totalExc;
    document.getElementById("fit-stat-days").innerText = `${activeDaysCount} / 7`;
    document.getElementById("fit-stat-sets").innerText = totalSets;

    let topMuscle = "-"; let maxC = -1;
    for(let c in catCounts) { if(catCounts[c] > maxC) { maxC = catCounts[c]; topMuscle = c; } }
    document.getElementById("fit-stat-muscle").innerText = topMuscle;

    const activeIdx = days.indexOf(activeWorkoutDay);
    document.getElementById("active-day-title").innerText = daysDisplay[activeIdx !== -1 ? activeIdx : 0];
    
    const currentList = appState.workoutProgram[activeWorkoutDay] || [];
    document.getElementById("active-day-badge").innerText = `${currentList.length} حرکت فعال`;

    const excContainer = document.getElementById("fit-exc-container");
    excContainer.innerHTML = "";

    if(currentList.length === 0) {
        excContainer.innerHTML = `<div style="grid-column: 1/-1; text-align:center; padding: 50px 20px; color: var(--text-muted); font-size: 13.5px; background: rgba(255,255,255,0.01); border-radius: 18px; border: 1px dashed var(--glass-border);">هیچ حرکت تمرینی برای این روز ثبت نشده است. از فرم سمت چپ حرکت جدید اضافه کنید یا از برنامه‌های آماده الیت استفاده نمایید.</div>`;
        return;
    }

    const catIcons = { "سینه": "💪", "زیربغل و پشت": "🦾", "سرشانه": "🏋️", "جلو بازو": "💥", "پشت بازو": "🔥", "پا": "🦵", "شکم و فیله": "⚡", "هوازی": "🏃" };

    currentList.forEach(ex => {
        const item = document.createElement("div");
        item.className = "fit-exc-item";
        item.innerHTML = `
            <div class="fit-exc-top">
                <div class="fit-exc-icon-wrap">${catIcons[ex.category] || '🏋️'}</div>
                <div class="fit-exc-name-wrap">
                    <div class="fit-exc-name">${ex.name}</div>
                    <span class="fit-exc-cat">${ex.category}</span>
                </div>
                <button class="btn-fit-del" onclick="deleteWorkoutExercise('${activeWorkoutDay}', ${ex.id})"><svg class="ico" style="width:18px;height:18px;"><use href="#i-trash"/></svg></button>
            </div>

            <div class="fit-exc-stats">
                <div class="fit-stat-box"><span class="fit-stat-val">${ex.sets}</span><span class="fit-stat-lbl">ست (Sets)</span></div>
                <div class="fit-stat-box"><span class="fit-stat-val">${ex.reps}</span><span class="fit-stat-lbl">تکرار (Reps)</span></div>
                <div class="fit-stat-box"><span class="fit-stat-val">${ex.weight}</span><span class="fit-stat-lbl">وزنه (Weight)</span></div>
            </div>

            <div style="font-size:11px; color:var(--text-muted); display:flex; justify-content:space-between; padding: 0 4px;">
                <span><svg class="ico" style="width:12px;height:12px;"><use href="#i-clock"/></svg> استراحت: ${ex.rest || 60} ثانیه</span>
                <span style="color:#34d399;">● آماده تمرین</span>
            </div>

            <div class="fit-exc-actions">
                <button class="btn-fit-log" onclick="logWorkoutExerciseAsTask('${activeWorkoutDay}', ${ex.id})">
                    <svg class="ico"><use href="#i-check"/></svg><span>افزودن به تسک‌های امروز</span>
                </button>
            </div>
        `;
        excContainer.appendChild(item);
    });
}

function exportWorkoutData() {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(appState.workoutProgram, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", `STRATOS_Workout_Routine.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
}

function importWorkoutData(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const imported = JSON.parse(e.target.result);
            if (imported && (imported["شنبه"] || imported["دوشنبه"] || imported["جمعه"])) {
                appState.workoutProgram = imported;
                saveToDatabase();
                alert("برنامه ورزشی با موفقیت وارد سیستم شد!");
                renderWorkoutHub();
            } else { alert("فرمت فایل برنامه ورزشی معتبر نیست."); }
        } catch(err) { alert("خطا در پردازش فایل برنامه ورزشی."); }
    };
    reader.readAsText(file);
}

function createStrategicGoal() {
    const title = document.getElementById('new-goal-title').value.trim();
    if(!title) return;
    const type = document.getElementById('new-goal-type').value;
    if(!appState.goals) appState.goals = [];
    appState.goals.push({ id: Date.now(), title: title, type: type, progress: 0, logs: [] });
    document.getElementById('new-goal-title').value = '';
    saveToDatabase();
    renderGoals();
}

function updateGoalProgress(id, delta) {
    const g = (appState.goals || []).find(x => x.id === id);
    if(g) {
        g.progress = Math.min(100, Math.max(0, g.progress + delta));
        saveToDatabase();
        renderGoals();
    }
}

function addGoalLog(id) {
    const g = (appState.goals || []).find(x => x.id === id);
    const inputEl = document.getElementById(`goal-log-input-${id}`);
    if(g && inputEl && inputEl.value.trim()) {
        const nowStr = new Date().toLocaleDateString(appState.calLang === "fa" ? 'fa-IR' : 'en-US');
        g.logs.unshift({ date: nowStr, text: inputEl.value.trim() });
        inputEl.value = '';
        saveToDatabase();
        renderGoals();
    }
}

function deleteGoal(id) {
    if(!confirm("آیا از حذف این چشم‌انداز اطمینان دارید؟")) return;
    appState.goals = (appState.goals || []).filter(x => x.id !== id);
    saveToDatabase();
    renderGoals();
}

function renderGoals() {
    const container = document.getElementById('goals-container');
    if(!container) return;
    container.innerHTML = '';
    const goals = appState.goals || [];
    if(goals.length === 0) {
        container.innerHTML = `<p style="color:var(--text-muted); font-size:13px; text-align:center; width:100%; padding:30px;">هنوز هیچ هدف کلان یا چشم‌اندازی ثبت نکرده‌اید.</p>`;
        return;
    }
    
    const typeLabels = { 'short': 'هفتگی / کوتاه‌مدت', 'mid': 'ماهانه / میان‌مدت', 'long': 'سالانه / بلندمدت' };
    const typeIcons = { 'short': 'i-bolt', 'mid': 'i-layer', 'long': 'i-astro' };

    goals.forEach(g => {
        let logsHtml = (g.logs || []).map(l => `<div class="goal-log-item"><div class="goal-log-date">${l.date}</div><div>${l.text}</div></div>`).join('');
        let tKey = g.type || 'mid';
        
        container.innerHTML += `
            <div class="goal-card type-${tKey}">
                <div class="goal-header">
                    <div class="goal-icon-box"><svg class="ico"><use href="#${typeIcons[tKey]}"/></svg></div>
                    <div class="goal-title">
                        <h4>${g.title}</h4>
                        <p><svg class="ico" style="width:10px;height:10px;"><use href="#i-flag"/></svg> ${typeLabels[tKey]}</p>
                    </div>
                    <button class="action-btn del" onclick="deleteGoal(${g.id})"><svg class="ico"><use href="#i-trash"/></svg></button>
                </div>
                <div class="goal-progress-container">
                    <div class="goal-progress-info"><span>میزان پیشرفت فعلی</span><strong>${g.progress}%</strong></div>
                    <div class="goal-bar-bg"><div class="goal-bar-fill" style="width:${g.progress}%;"></div></div>
                    <div class="goal-quick-btns">
                        <div class="btn-goal-add" onclick="updateGoalProgress(${g.id}, 1)">+1%</div>
                        <div class="btn-goal-add" onclick="updateGoalProgress(${g.id}, 5)">+5%</div>
                        <div class="btn-goal-add" onclick="updateGoalProgress(${g.id}, 10)">+10%</div>
                        <div class="btn-goal-add" style="color:var(--text-muted);" onclick="updateGoalProgress(${g.id}, -5)">-5%</div>
                    </div>
                </div>
                <div class="goal-log-input-group">
                    <input type="text" id="goal-log-input-${g.id}" placeholder="یادداشت پیشرفت امروز...">
                    <button onclick="addGoalLog(${g.id})"><svg class="ico"><use href="#i-plus"/></svg></button>
                </div>
                ${logsHtml ? `<div class="goal-logs-section">${logsHtml}</div>` : ''}
            </div>`;
    });
}

function updateHistoryChartData(done, total) {
    const daysMap = {"Saturday":"شنبه","Sunday":"۱شنبه","Monday":"۲شنبه","Tuesday":"۳شنبه","Wednesday":"۴شنبه","Thursday":"۵شنبه","Friday":"جمعه"};
    const enDay = new Date().toLocaleString('en-US', { weekday: 'long' });
    histData.days[daysMap[enDay] || "شنبه"] = total > 0 ? Math.round((done / total) * 100) : 0;
}

let swStartTime = 0; let swElapsed = 0; let swTimer = null;
function startStopwatch() {
    if(swTimer) return;
    document.getElementById('stopwatch-hud').classList.add('is-running');
    document.getElementById('sw-status-text').innerText = "RECORDING TIME...";
    swStartTime = Date.now() - swElapsed;
    swTimer = setInterval(() => {
        swElapsed = Date.now() - swStartTime;
        updateStopwatchDisplay();
    }, 10);
}
function pauseStopwatch() {
    clearInterval(swTimer); swTimer = null;
    document.getElementById('stopwatch-hud').classList.remove('is-running');
    if(swElapsed > 0) document.getElementById('sw-status-text').innerText = "SYSTEM PAUSED";
}
function resetStopwatch() {
    pauseStopwatch(); swElapsed = 0;
    updateStopwatchDisplay();
    document.getElementById('sw-status-text').innerText = "SYSTEM STANDBY";
    document.getElementById('laps-list').innerHTML = "";
}
function updateStopwatchDisplay() {
    let totalSec = Math.floor(swElapsed / 1000);
    let h = Math.floor(totalSec / 3600).toString().padStart(2, '0');
    let m = Math.floor((totalSec % 3600) / 60).toString().padStart(2, '0');
    let s = (totalSec % 60).toString().padStart(2, '0');
    let ms = Math.floor((swElapsed % 1000) / 10).toString().padStart(2, '0');
    document.getElementById('stopwatch-display').innerHTML = `${h}:${m}:${s}<span class="millis">.${ms}</span>`;
}
function recordLap() {
    if(swElapsed === 0) return;
    let timeStr = document.getElementById('stopwatch-display').innerText;
    let lapNum = document.getElementById('laps-list').children.length + 1;
    let li = document.createElement('li');
    li.className = "lap-item";
    li.innerHTML = `<span class="lap-badge">LAP ${lapNum.toString().padStart(2, '0')}</span><strong>${timeStr}</strong>`;
    document.getElementById('laps-list').prepend(li);
}

let cdTimer = null; let cdTotalSeconds = 25 * 60; let cdSecondsRemaining = 25 * 60;
function setTimerPreset(mins, el) {
    pauseCountdown();
    document.getElementById('timer-mins-input').value = mins;
    cdTotalSeconds = mins * 60; cdSecondsRemaining = cdTotalSeconds;
    document.querySelectorAll('.preset-pills .preset-pill').forEach(p => p.classList.remove('active'));
    if(el) el.classList.add('active');
    updateCountdownDisplay();
}
function customTimerChange() {
    pauseCountdown();
    let mins = parseInt(document.getElementById('timer-mins-input').value) || 25;
    cdTotalSeconds = mins * 60; cdSecondsRemaining = cdTotalSeconds;
    document.querySelectorAll('.preset-pills .preset-pill').forEach(p => p.classList.remove('active'));
    updateCountdownDisplay();
}
function startCountdown() {
    if(cdTimer) return;
    let mins = parseInt(document.getElementById('timer-mins-input').value) || 25;
    if(cdSecondsRemaining === 0 || cdTotalSeconds !== mins * 60) {
        cdTotalSeconds = mins * 60; cdSecondsRemaining = cdTotalSeconds;
    }
    document.getElementById('countdown-hud').classList.add('is-running');
    document.getElementById('cd-status-text').innerText = "FOCUS MODE ACTIVE";
    updateCountdownDisplay();
    cdTimer = setInterval(() => {
        cdSecondsRemaining--;
        updateCountdownDisplay();
        if(cdSecondsRemaining <= 0) {
            pauseCountdown(); cdSecondsRemaining = 0; updateCountdownDisplay();
            document.getElementById('cd-status-text').innerText = "MISSION COMPLETED!";
            triggerAlertNotification("زمان تمرکز به پایان رسید", "تایمر تنظیم شده در STRAT.OS تکمیل شد.");
        }
    }, 1000);
}
function pauseCountdown() {
    clearInterval(cdTimer); cdTimer = null;
    document.getElementById('countdown-hud').classList.remove('is-running');
    if(cdSecondsRemaining > 0 && cdSecondsRemaining < cdTotalSeconds) {
        document.getElementById('cd-status-text').innerText = "FOCUS PAUSED";
    }
}
function resetCountdown() {
    pauseCountdown();
    let mins = parseInt(document.getElementById('timer-mins-input').value) || 25;
    cdTotalSeconds = mins * 60; cdSecondsRemaining = cdTotalSeconds;
    document.getElementById('cd-status-text').innerText = "READY FOR FOCUS";
    updateCountdownDisplay();
}
function updateCountdownDisplay() {
    let m = Math.floor(cdSecondsRemaining / 60).toString().padStart(2, '0');
    let s = (cdSecondsRemaining % 60).toString().padStart(2, '0');
    document.getElementById('countdown-display').innerText = `${m}:${s}`;
    let pct = cdTotalSeconds > 0 ? ((cdTotalSeconds - cdSecondsRemaining) / cdTotalSeconds) * 100 : 0;
    let fillEl = document.getElementById('cd-progress-fill');
    if(fillEl) fillEl.style.width = `${pct}%`;
}
function triggerAlertNotification(title, bodyText) {
    let ctx = new (window.AudioContext || window.webkitAudioContext)();
    let osc = ctx.createOscillator(); osc.type = 'sine'; osc.frequency.setValueAtTime(880, ctx.currentTime);
    osc.connect(ctx.destination); osc.start(); osc.stop(ctx.currentTime + 0.5);
    if (Notification.permission === "granted") { new Notification(title, { body: bodyText }); }
    else { alert(title + "\n" + bodyText); }
}
function requestNotificationPermission() {
    if ("Notification" in window) {
        Notification.requestPermission().then(res => {
            if(res === "granted") alert("اعلان‌های مرورگر با موفقیت فعال شدند.");
        });
    }
}

function generateCalendarGrid() {
    const container = document.getElementById('cal-days-container');
    if(!container) return;
    container.innerHTML = "";
    let now = new Date();
    let year = now.getFullYear(); let month = now.getMonth();
    
    let locale = appState.calLang === "fa" ? 'fa-IR' : 'en-US';
    document.getElementById('cal-month-title').innerText = now.toLocaleDateString(locale, { year: 'numeric', month: 'long' });

    let firstDay = new Date(year, month, 1).getDay();
    let offset = (firstDay + 1) % 7;
    let daysInMonth = new Date(year, month + 1, 0).getDate();

    for(let i=0; i<offset; i++) {
        container.innerHTML += `<div class="cal-day" style="opacity:0.05; cursor:default; border-color:transparent;"></div>`;
    }

    for(let d=1; d<=daysInMonth; d++) {
        let dateObj = new Date(year, month, d);
        let dateStr = dateObj.toDateString();
        let isToday = (dateStr === new Date().toDateString());
        let log = appState.dailyLogs && appState.dailyLogs[dateStr];
        
        // بررسی روز تعطیل (آفلاین)
        let holidayName = getIranianHoliday(dateObj);
        
        let rateClass = "";
        if(log && log.totalTasks > 0) {
            let r = (log.tasksDone / log.totalTasks) * 100;
            if(r >= 75) rateClass = "rate-high";
            else if(r >= 40) rateClass = "rate-med";
            else rateClass = "rate-low";
        }

        let dayEl = document.createElement('div');
        dayEl.className = `cal-day ${isToday ? 'active-day' : ''} ${rateClass} ${holidayName ? 'holiday-day' : ''}`;
        dayEl.innerHTML = `<span>${d}</span><div class="cal-day-indicator"></div>`;
        dayEl.onclick = () => selectCalendarDay(dateStr, d, dayEl, holidayName);
        container.appendChild(dayEl);
    }
    selectCalendarDay(new Date().toDateString(), now.getDate(), null, getIranianHoliday(now));
}

function selectCalendarDay(dateStr, dayNum, el, holidayName) {
    selectedCalDateStr = dateStr;
    if(el) {
        document.querySelectorAll('.cal-day').forEach(d => {
            if(!d.classList.contains('holiday-day')) d.style.borderColor = "var(--glass-border)";
        });
        el.style.borderColor = "#38bdf8";
    }
    let locale = appState.calLang === "fa" ? 'fa-IR' : 'en-US';
    let formattedDate = new Date(dateStr).toLocaleDateString(locale, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    document.getElementById('selected-day-title').innerText = `گزارش: ${formattedDate}`;

    // نمایش وضعیت تعطیلی
    const holLine = document.getElementById('holiday-info-line');
    if(holidayName) {
        holLine.style.display = 'flex';
        document.getElementById('rep-holiday-title').innerText = holidayName;
    } else {
        holLine.style.display = 'none';
    }

    let log = (appState.dailyLogs && appState.dailyLogs[dateStr]) ? appState.dailyLogs[dateStr] : 
        (dateStr === new Date().toDateString() ? {
            tasksDone: appState.tasks.filter(t=>t.done).length, totalTasks: appState.tasks.length,
            peakHour: "امروز", note: appState.notes || ""
        } : { tasksDone:0, totalTasks:0, peakHour:"ثبت نشده", note:"" });

    document.getElementById('rep-task-ratio').innerText = `${log.tasksDone} از ${log.totalTasks}`;
    let ratioPct = log.totalTasks > 0 ? Math.round((log.tasksDone / log.totalTasks)*100) : 0;
    document.getElementById('rep-bar-ratio').style.width = `${ratioPct}%`;

    document.getElementById('rep-success-rate').innerText = `${ratioPct}%`;
    document.getElementById('rep-bar-rate').style.width = `${ratioPct}%`;

    document.getElementById('rep-peak-hour').innerText = log.peakHour || "ثبت نشده";
    document.getElementById('cal-day-note').value = log.note || "";
}

function saveSelectedDayNote() {
    if(!appState.dailyLogs) appState.dailyLogs = {};
    if(!appState.dailyLogs[selectedCalDateStr]) appState.dailyLogs[selectedCalDateStr] = { tasksDone:0, totalTasks:0, peakHour:"-" };
    appState.dailyLogs[selectedCalDateStr].note = document.getElementById('cal-day-note').value;
    if(selectedCalDateStr === new Date().toDateString()) {
        appState.notes = document.getElementById('cal-day-note').value;
        document.getElementById('notes-area').value = appState.notes;
    }
    saveToDatabase();
    alert("گزارش و یادداشت این تاریخ ذخیره شد.");
    generateCalendarGrid();
}

function updateProfileAvatar() {
    appState.userAvatar = document.getElementById('prof-avatar-select').value;
    document.getElementById('prof-display-avatar').innerHTML = `<svg class="ico"><use href="#i-${appState.userAvatar}"/></svg>`;
    saveToDatabase();
}

function updateProfileInfo() {
    let name = document.getElementById('prof-name-input').value.trim();
    let role = document.getElementById('prof-role-input').value.trim();
    let bio = document.getElementById('prof-bio-input').value.trim();
    
    if(name) { appState.userName = name; document.getElementById('prof-display-name').innerText = name; }
    if(role) { appState.userRole = role; document.getElementById('prof-display-role').innerText = role; }
    if(bio) { appState.userBio = bio; document.getElementById('prof-display-bio').innerText = bio; }
    
    saveToDatabase();
    alert("اطلاعات کارت شناسایی با موفقیت بروزرسانی شد.");
}

function renderProfileStats() {
    let habits = Object.values(appState.habits);
    let habitDone = habits.filter(h => h.current >= h.target).length;
    let habitRate = habits.length > 0 ? Math.round((habitDone / habits.length) * 100) : 0;
    
    let tasks = appState.tasks;
    let taskDoneCount = tasks.filter(t => t.done).length;
    let taskRate = tasks.length > 0 ? (taskDoneCount / tasks.length) * 60 : 0;
    let habitPoints = habits.length > 0 ? (habitDone / habits.length) * 40 : 0;
    let focusScore = Math.round(taskRate + habitPoints);

    document.getElementById('prof-stat-focus').innerText = focusScore;
    document.getElementById('prof-stat-done').innerText = histData.totalCompleted;
    document.getElementById('prof-stat-streak').innerText = `${habitRate}%`;

    let xp = (histData.totalCompleted * 10) + ((appState.points || 0) * 2);
    let level = Math.floor(xp / 100) + 1;
    let currentLevelXp = xp % 100;
    
    document.getElementById('prof-display-level').innerText = `LVL ${level}`;
    document.getElementById('prof-xp-fill').style.width = `${currentLevelXp}%`;
    document.getElementById('prof-xp-current').innerText = `XP: ${xp}`;
    document.getElementById('prof-xp-next').innerText = `Next Level: ${level * 100} XP`;
}

function exportProfileAsImage() {
    renderProfileStats();
    const cardEl = document.getElementById('export-card-dom');
    const wrapper = document.createElement('div');
    wrapper.style.position = 'fixed';
    wrapper.style.left = '-9999px';
    wrapper.style.top = '0';
    wrapper.style.width = '440px';
    wrapper.style.zIndex = '-1';
    document.body.appendChild(wrapper);
    
    const clone = cardEl.cloneNode(true);
    clone.style.margin = '0';
    clone.style.transform = 'none';
    clone.style.width = '440px';
    wrapper.appendChild(clone);

    if (window.htmlToImage && window.htmlToImage.toPng) {
        window.htmlToImage.toPng(clone, { quality: 1.0, pixelRatio: 2, width: 440, height: clone.offsetHeight }).then(dataUrl => {
            let link = document.createElement('a');
            link.download = `STRATOS_ID_${Date.now()}.png`;
            link.href = dataUrl;
            link.click();
            document.body.removeChild(wrapper);
        }).catch(err => {
            document.body.removeChild(wrapper);
            fallbackExport(cardEl);
        });
    } else {
        document.body.removeChild(wrapper);
        fallbackExport(cardEl);
    }
}

function fallbackExport(cardEl) {
    const width = cardEl.offsetWidth || 440;
    const height = cardEl.offsetHeight || 380;
    const clone = cardEl.cloneNode(true);
    const svgDoc = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><foreignObject width="100%" height="100%"><div xmlns="http://www.w3.org/1999/xhtml" dir="rtl" style="unicode-bidi:isolate;text-rendering:optimizeLegibility;width:${width}px;height:${height}px;">${clone.outerHTML}</div></foreignObject></svg>`;
    const img = new Image();
    const svgBlob = new Blob([svgDoc], {type: 'image/svg+xml;charset=utf-8'});
    const url = URL.createObjectURL(svgBlob);
    img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = width * 2;
        canvas.height = height * 2;
        const ctx = canvas.getContext('2d');
        ctx.scale(2, 2);
        ctx.drawImage(img, 0, 0);
        URL.revokeObjectURL(url);
        const a = document.createElement('a');
        a.download = `STRATOS_ID_${Date.now()}.png`;
        a.href = canvas.toDataURL('image/png');
        a.click();
    };
    img.src = url;
}
function renderAnalytics() {
    const days = ["شنبه", "۱شنبه", "۲شنبه", "۳شنبه", "۴شنبه", "۵شنبه", "جمعه"];
    const barIds = ["bar-sat", "bar-sun", "bar-mon", "bar-tue", "bar-wed", "bar-thu", "bar-fri"];
    const valIds = ["val-sat", "val-sun", "val-mon", "val-tue", "val-wed", "val-thu", "val-fri"];
    
    let totalWeeklyPct = 0; let countDays = 0;
    days.forEach((day, i) => {
        const val = histData.days[day] || 0;
        if(val > 0) { totalWeeklyPct += val; countDays++; }
        const barEl = document.getElementById(barIds[i]);
        const valEl = document.getElementById(valIds[i]);
        if(barEl && valEl) {
            barEl.style.height = val + '%';
            valEl.innerText = val + '%';
            barEl.style.background = val > 75 ? 'var(--glow-emerald)' : (val > 30 ? 'var(--glow-indigo)' : (val > 0 ? 'var(--glow-rose)' : 'rgba(255,255,255,0.05)'));
        }
    });

    let overall = countDays > 0 ? Math.round(totalWeeklyPct / countDays) : 0;
    document.getElementById("stat-overall-rate").innerText = overall + "%";

    if(!histData.priorityStats) histData.priorityStats = { highDone: 0, highTotal: 0, medDone: 0, medTotal: 0, lowDone: 0, lowTotal: 0 };
    const p = histData.priorityStats;
    let totalP = p.highTotal + p.medTotal + p.lowTotal;
    document.getElementById("donut-total-val").innerText = totalP;
    
    if(totalP > 0) {
        let hPct = Math.round((p.highTotal / totalP) * 100);
        let mPct = Math.round((p.medTotal / totalP) * 100);
        let lPct = 100 - (hPct + mPct);
        
        document.getElementById("legend-high").innerText = hPct + "%";
        document.getElementById("legend-med").innerText = mPct + "%";
        document.getElementById("legend-low").innerText = lPct + "%";
        
        document.getElementById("priority-donut").style.background = `conic-gradient(#f43f5e 0% ${hPct}%, #fbbf24 ${hPct}% ${hPct + mPct}%, #34d399 ${hPct + mPct}% 100%)`;
    }

    let habits = Object.values(appState.habits);
    let habitDone = habits.filter(h => h.current >= h.target).length;
    let habitRate = habits.length > 0 ? Math.round((habitDone / habits.length) * 100) : 0;
    document.getElementById("stat-habit-streak").innerText = habitRate + '%';

    let tasks = appState.tasks;
    let taskDoneCount = tasks.filter(t => t.done).length;
    let taskRate = tasks.length > 0 ? (taskDoneCount / tasks.length) * 60 : 0;
    let habitPoints = habits.length > 0 ? (habitDone / habits.length) * 40 : 0;
    let focusScore = Math.round(taskRate + habitPoints);
    document.getElementById("stat-focus-score").innerText = focusScore;

    document.getElementById("stat-total-completed").innerText = histData.totalCompleted;
    
    const hmContainer = document.getElementById("analytics-heatmap");
    hmContainer.innerHTML = "";
    let today = new Date();
    for(let i = 29; i >= 0; i--) {
        let d = new Date(today);
        d.setDate(d.getDate() - i);
        let dateStr = d.toDateString();
        let log = appState.dailyLogs && appState.dailyLogs[dateStr];
        
        let level = 0;
        if(log && log.totalTasks > 0) {
            let r = log.tasksDone / log.totalTasks;
            if(r >= 0.8) level = 4;
            else if(r >= 0.5) level = 3;
            else if(r >= 0.2) level = 2;
            else level = 1;
        }
        
        let cell = document.createElement("div");
        cell.className = "hm-cell";
        cell.setAttribute("data-level", level);
        cell.title = `${d.toLocaleDateString(appState.calLang === "fa" ? 'fa-IR' : 'en-US')} : ${log ? log.tasksDone + '/' + log.totalTasks : 'بدون فعالیت'}`;
        hmContainer.appendChild(cell);
    }

    let aiText = "بر اساس داده‌های فعلی، در حال تثبیت عادات هستید. وظایف کلیدی را در زمان طلایی خود انجام دهید.";
    let type = "نیاز به دیتای بیشتر";
    let burnout = "ایمن (Low Risk)";
    
    if(histData.totalFailed > histData.totalCompleted && histData.totalFailed > 10) {
        burnout = "خطر بالا (High Risk)";
        aiText = "هشدار سیستم: حجم تسک‌های سوخته بالاست. از تراکم برنامه کاسته و روی ریکاوری تمرکز کنید.";
        document.getElementById("stat-burnout").className = "badge high";
    } else {
        document.getElementById("stat-burnout").className = "badge low";
        if (habitRate > 80 && focusScore > 70) {
            aiText = "عملکرد شما در بالاترین سطح است! ریتم فعلی را حفظ کرده و برای ارتقا آماده باشید.";
        }
    }

    if(histData.completionHours && histData.completionHours.length > 0) {
        let avgHour = histData.completionHours.reduce((a,b)=>a+b,0) / histData.completionHours.length;
        if(avgHour >= 0 && avgHour < 6) type = "شب‌زنده‌دار (Night Owl)";
        else if(avgHour >= 6 && avgHour < 12) type = "سحرخیز (Early Bird)";
        else if(avgHour >= 12 && avgHour < 17) type = "فعال نیمروزی (Midday Performer)";
        else type = "جنگجوی عصرگاهی (Evening Grinder)";
    }
    
    document.getElementById("stat-personality").innerText = type;
    document.getElementById("stat-burnout").innerText = burnout;
    document.getElementById("stat-ai-recommendation").innerText = aiText;
}

function factoryResetDatabase() {
    if(confirm("آیا از حذف کامل اطلاعات هسته، تم‌ها و تاریخچه اطمینان دارید؟")) {
        localStorage.removeItem(storageKey);
        localStorage.removeItem(historicalKey);
        location.reload();
    }
}