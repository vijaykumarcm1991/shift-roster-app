let isDragging = false;
let selectedCells = [];
let startCell = null;
let rosterData = [];
let datesGlobal = [];
let dragCompleted = false;

function initMonthDropdown() {
    const monthSelect = document.getElementById("monthSelect");
    if (!monthSelect) return;

    monthSelect.innerHTML = "";

    const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

    months.forEach((m, i) => {
        const opt = document.createElement("option");
        opt.value = i + 1;
        opt.text = m;
        monthSelect.appendChild(opt);
    });
}

async function login() {

    const username = document.getElementById("username").value;
    const password = document.getElementById("password").value;

    const res = await fetch("/login", {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            username: username,
            password: password
        })
    });

    console.log("Login status:", res.status);

    let data;
    try {
        data = await res.json();
    } catch (e) {
        console.error("Response parse error:", e);
        alert("Server error (invalid response)");
        return;
    }

    console.log("Login response:", data);

    if (res.status !== 200) {
        alert(data.detail || "Login failed");
        return;
    }

    localStorage.setItem("token", data.access_token);

    alert("Login successful");

    // 🔥 REDIRECT FIX
    window.location.href = "/static/roster.html";
}

async function loadRoster() {

    const token = localStorage.getItem("token");
    const loginBox = document.getElementById("loginBox");

    if (token && loginBox) {
        loginBox.style.display = "none";
    }

    const monthEl = document.getElementById("monthSelect");
    const yearEl = document.getElementById("yearSelect");

    if (!monthEl || !yearEl) return;

    const month = monthEl.value;
    const year = yearEl.value;

    if (!month || !year) {
        console.warn("Month/Year missing");
        return;
    }

    const res = await fetch(`/roster?month=${month}&year=${year}`);
    const data = await res.json();

    if (!data || !data.length) return;

    // // ✅ STATUS
    // const statusLabel = document.getElementById("statusLabel");
    // if (statusLabel) {
    //     const rosterStatus = data[0].status || "DRAFT";
    //     statusLabel.innerText = "";
    // }

    rosterData = data;
    datesGlobal = Object.keys(data[0].shifts).sort();
    const dates = datesGlobal;

    const today = new Date();

    // ✅ GROUPING
    const groups = {};
    data.forEach(emp => {
        const team = emp.team || "Others";
        if (!groups[team]) groups[team] = [];
        if (!groups[team].some(e => e.employee_id === emp.employee_id)) {
            groups[team].push(emp);
        }
    });

    let html = "";

    for (const team in groups) {

        html += `<h3>${team}</h3>`;
        html += `<table class="border border-gray-300 text-sm border-separate" style="border-spacing:8px;">`;

        // 🔹 HEADER
        html += `<tr>
            <th class="px-6 py-4 border border-gray-300 rounded-xl bg-gray-50">
                Employee
            </th>`;

        dates.forEach(d => {

            const dateObj = new Date(d);

            const days = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
            const day = days[dateObj.getDay()];
            const dateNum = dateObj.getDate();

            const isWeekend = dateObj.getDay() === 0 || dateObj.getDay() === 6;

            const isToday =
                dateObj.getDate() === today.getDate() &&
                dateObj.getMonth() === today.getMonth() &&
                dateObj.getFullYear() === today.getFullYear();

            let style = "";
            if (isWeekend) style += "background:#ffecec;";
            if (isToday) style += "background:#4f46e5;color:white;";

            html += `<th 
                        class="px-6 py-4 sticky top-0 bg-gray-100 z-[1] border border-gray-300 text-center rounded-xl bg-gray-50"
                        style="${style}; min-width:75px;">
                        <div style="line-height:1.2;">
                            <div style="font-size:11px;">${day}</div>
                            <div style="font-size:13px;font-weight:bold;">${dateNum}</div>
                        </div>
                    </th>`;
        });

        html += `<th style="width:6px;background:#e5e7eb;"></th>`;
        html += `
                <th class="px-4 py-2 text-center border border-gray-300 rounded-lg bg-gray-50">S1</th>
                <th class="px-4 py-2 text-center border border-gray-300 rounded-lg bg-gray-50">S2</th>
                <th class="px-4 py-2 text-center border border-gray-300 rounded-lg bg-gray-50">S3</th>
                <th class="px-4 py-2 text-center border border-gray-300 rounded-lg bg-gray-50">G</th>
                <th class="px-4 py-2 text-center border border-gray-300 rounded-lg bg-gray-50">WO</th>
                <th class="px-4 py-2 text-center border border-gray-300 rounded-lg bg-gray-50">CO</th>
                <th class="px-4 py-2 text-center border border-gray-300 rounded-lg bg-gray-50">GH</th>
                <th class="px-4 py-2 text-center border border-gray-300 rounded-lg bg-gray-50">LV</th>
                <th class="px-4 py-2 text-center border border-gray-300 rounded-lg bg-gray-50">WD</th>
                `;
        html += "</tr>";

        // 🔹 EMPLOYEE ROWS
        groups[team].forEach(emp => {

            let counts = { S1:0,S2:0,S3:0,G:0,WO:0,CO:0,GH:0,LV:0 };

            html += `<tr>
                <td class="px-6 py-4 sticky left-0 bg-white z-[1] border border-gray-300 rounded-xl whitespace-nowrap font-medium">
                    ${emp.employee_name}
                </td>`;

            dates.forEach(d => {

                const shift = emp.shifts[d] || '-';
                const comment = emp.comments?.[d];

                if (counts[shift] !== undefined) counts[shift]++;

                let color = "#fff";
                if (shift === "S1") color = "#cce5ff";
                else if (shift === "S2") color = "#ffe5cc";
                else if (shift === "S3") color = "#e6ccff";
                else if (shift === "WO") color = "#d6d6d6";
                else if (shift === "G") color = "#ccffd9";
                else if (shift === "LV") color = "#ffcccc";
                else if (shift === "GH") color = "#ffffcc";
                else if (shift === "CO") color = "#ccf2ff";

                const dateObj = new Date(d);
                const isWeekend = dateObj.getDay() === 0 || dateObj.getDay() === 6;

                const isToday =
                    dateObj.getDate() === today.getDate() &&
                    dateObj.getMonth() === today.getMonth() &&
                    dateObj.getFullYear() === today.getFullYear();

                let bgColor = color;
                if (isToday) bgColor = "#e0e7ff";
                if (isWeekend && shift === '-') bgColor = "#fff5f5";

                html += `<td 
                            class="${comment ? "comment-cell" : ""} px-6 py-4 text-center cursor-pointer border border-gray-300 rounded-xl shadow-sm hover:shadow-md transition"
                            style="background:${bgColor}; min-width:75px;"
                            data-emp="${emp.employee_id}"
                            data-date="${d}"
                            title="${comment || ""}">
                            ${shift}
                        </td>`;
            });

            html += `<td style="background:#e5e7eb;"></td>`;

            const wd = counts.S1 + counts.S2 + counts.S3 + counts.G;

            html += `
                <td class="px-4 py-2 text-center border border-gray-300 rounded-lg bg-gray-50">${counts.S1}</td>
                <td class="px-4 py-2 text-center border border-gray-300 rounded-lg bg-gray-50">${counts.S2}</td>
                <td class="px-4 py-2 text-center border border-gray-300 rounded-lg bg-gray-50">${counts.S3}</td>
                <td class="px-4 py-2 text-center border border-gray-300 rounded-lg bg-gray-50">${counts.G}</td>
                <td class="px-4 py-2 text-center border border-gray-300 rounded-lg bg-gray-50">${counts.WO}</td>
                <td class="px-4 py-2 text-center border border-gray-300 rounded-lg bg-gray-50">${counts.CO}</td>
                <td class="px-4 py-2 text-center border border-gray-300 rounded-lg bg-gray-50">${counts.GH}</td>
                <td class="px-4 py-2 text-center border border-gray-300 rounded-lg bg-gray-50">${counts.LV}</td>
                <td class="px-4 py-2 text-center border border-gray-300 rounded-lg bg-gray-50"><b>${wd}</b></td>
            `;

            html += "</tr>";
        });

        // 🔹 SPACER
        html += `<tr><td colspan="${dates.length + 11}" style="height:8px;background:#f5f7fb;"></td></tr>`;

        // 🔹 SHIFT SUMMARY HEADER (FIXED)
        html += `<tr>
            <td class="px-4 py-2 font-bold text-gray-700 border border-gray-300 rounded-lg bg-gray-50">
                Shift Summary
            </td>`;
        for (let i=0;i<dates.length;i++) html += `<td></td>`;
        html += `<td style="background:#e5e7eb;"></td>`;
        for (let i=0;i<9;i++) html += `<td></td>`;
        html += `</tr>`;

        // 🔹 PIVOT
        let pivot = { S1:{},S2:{},S3:{},G:{},WO:{},CO:{},GH:{},LV:{} };

        dates.forEach(d=>{
            Object.keys(pivot).forEach(s=>pivot[s][d]=0);
        });

        groups[team].forEach(emp=>{
            dates.forEach(d=>{
                const s = emp.shifts[d] || '-';
                if (pivot[s]) pivot[s][d]++;
            });
        });

        Object.keys(pivot).forEach(s=>{
            html += `<tr class="font-semibold">
                    <td class="px-4 py-2 border border-gray-300 rounded-lg bg-blue-50">${s}</td>`;
            dates.forEach(d=>{
                let val = pivot[s][d];
                let style="";
                if (val > 2) style="background:#16a34a;color:white;";
                else if (val < 2) style="background:#fecaca;color:#7f1d1d;";
                html += `<td 
                        class="px-4 py-2 text-center border border-gray-300 rounded-lg" style="${style}">${val}
                    </td>`;
            });
            html += `<td style="background:#e5e7eb;"></td>`;
            for (let i=0;i<9;i++) html+=`<td></td>`;
            html += `</tr>`;
        });

        // 🔹 TOTAL
        html += `<tr class="font-bold">
                <td class="px-4 py-2 border border-gray-300 rounded-lg bg-green-100">Total</td>`;
        dates.forEach(d=>{
            let t = pivot.S1[d]+pivot.S2[d]+pivot.S3[d]+pivot.G[d];
            html += `<td class="px-4 py-2 text-center border border-gray-300 rounded-lg"
                         style="background:#059669;color:white;">${t}</td>`;
        });
        html += `<td style="background:#e5e7eb;"></td>`;
        for (let i=0;i<9;i++) html+=`<td></td>`;
        html += `</tr>`;

        html += "</table><br>";
    }

    const tableEl = document.getElementById("rosterTable");
    if (tableEl) tableEl.innerHTML = html;

    // 🔥 AUTO SCROLL TO CURRENT DAY
    setTimeout(() => {

        const today = new Date();

        const todayStr = today.toISOString().split("T")[0];

        const todayCell = document.querySelector(`[data-date="${todayStr}"]`);

        if (todayCell) {
            todayCell.scrollIntoView({
                behavior: "smooth",
                inline: "center",
                block: "nearest"
            });
        }

    }, 200);

    attachEvents();

    // 🔹 SAFE ROLE UI
    const logoutBtn = document.getElementById("logoutBtn");

    if (!token) {
        if (logoutBtn) logoutBtn.style.display = "none";
        if (loginBox) loginBox.style.display = "block";
    } else {
        if (logoutBtn) logoutBtn.style.display = "inline-block";
        if (loginBox) loginBox.style.display = "none";
    }
}

function attachEvents() {

    const table = document.getElementById("rosterTable");

    // ✅ PREVENT DUPLICATE EVENT BINDING
    table.replaceWith(table.cloneNode(true));
    const newTable = document.getElementById("rosterTable");

    // 🔥 EVENT DELEGATION (FIX)
    newTable.addEventListener("click", (e) => {

        const cell = e.target.closest("td");
        if (!cell || !cell.dataset.emp) return;

        if (dragCompleted) {
            dragCompleted = false;
            return; // ✅ PREVENT CLICK AFTER DRAG
        }

        if (selectedCells.length > 1) {
            return; // ✅ DON'T OPEN DROPDOWN
        }

        activeCell = cell; // just focus
    });

    newTable.addEventListener("mousedown", (e) => {

        const cell = e.target.closest("td");
        if (!cell || !cell.dataset.emp) return;

        if (!localStorage.getItem("token")) return;
        if (e.button !== 0) return;

        isDragging = true;
        startCell = cell;
        updateSelection(cell);
    });

    newTable.addEventListener("mouseover", (e) => {
        const cell = e.target.closest("td");
        if (!cell || !cell.dataset.emp) return;

        if (!isDragging) return;
        updateSelection(cell);
    });

    newTable.addEventListener("contextmenu", async (e) => {
        const cell = e.target.closest("td");
        if (!cell || !cell.dataset.emp) return;

        e.preventDefault();

        if (!localStorage.getItem("token")) {
            alert("Login required");
            return;
        }

        const empId = cell.dataset.emp;
        const date = cell.dataset.date;

        const comment = prompt("Enter comment:");
        if (comment === null) return;

        await fetch(`/roster-entry/comment?employee_id=${empId}&date=${date}&comment=${encodeURIComponent(comment)}`, {
            method: "PUT",
            headers: {
                "Authorization": "Bearer " + localStorage.getItem("token")
            }
        });

        cell.title = comment;
        cell.classList.add("comment-cell");
    });

    document.addEventListener("mouseup", async (e) => {
        if (!isDragging) return;

        isDragging = false;
        dragCompleted = true;

        // 🔥 AUTO-FILL LOGIC
        if (
            selectedCells.length > 1 &&
            window.selectionPattern &&
            window.selectionPattern.length > 0
        ) {
            const pattern = window.selectionPattern;

            for (let i = 0; i < selectedCells.length; i++) {

                const item = selectedCells[i];
                let shift = pattern[i % pattern.length];

                if (shift === "-") continue; // ❌ skip empty cells

                const old = item.cell.innerText.trim() || "-";

                // 🔹 API CALL
                await fetch(
                    `/roster-entry?employee_id=${item.empId}&date=${item.date}&shift_code=${shift}`,
                    {
                        method: "PUT",
                        headers: {
                            "Authorization": "Bearer " + localStorage.getItem("token")
                        }
                    }
                );

                // 🔹 UI UPDATE
                item.cell.innerHTML = shift;
                applyColor(item.cell, shift);

                updateRowSummary(item.empId, old, shift);
                updatePivot(item.date, old, shift);

                // 🔹 visual feedback
                item.cell.style.outline = "2px solid green";
                setTimeout(() => item.cell.style.outline = "none", 200);
            }
        }

        setTimeout(() => {
            dragCompleted = false;
        }, 100);

        clearSelection();
    });
}

function updateSelection(endCell) {
    
    clearSelection();

    // reset pattern each new drag
    window.selectionPattern = [];

    const table = endCell.closest("table");
    const rows = Array.from(table.querySelectorAll("tr")).slice(1);

    const startRow = startCell.parentElement.rowIndex - 1;
    const startCol = startCell.cellIndex;

    const endRow = endCell.parentElement.rowIndex - 1;
    const endCol = endCell.cellIndex;

    const minRow = Math.min(startRow, endRow);
    const maxRow = Math.max(startRow, endRow);
    const minCol = Math.min(startCol, endCol);
    const maxCol = Math.max(startCol, endCol);

    selectedCells = [];

    for (let r = minRow; r <= maxRow; r++) {
        const row = rows[r];

        for (let c = minCol; c <= maxCol; c++) {
            if (c === 0) continue;

            const cell = row.cells[c];
            if (!cell) continue;

            cell.style.outline = "2px solid red";
            if (!cell.dataset.originalBg) {
                cell.dataset.originalBg = cell.style.background;
            } // ✅ store original
            cell.style.background = "#fff7edcc"; // semi-transparent

            selectedCells.push({
                cell,
                empId: cell.dataset.emp,
                date: cell.dataset.date
            });
        }
    }

    console.log("Selected:", selectedCells.length);

    // 🔥 detect direction
    const isHorizontal = Math.abs(endCol - startCol) > Math.abs(endRow - startRow);

    if (isHorizontal) {
        // 👉 LEFT → RIGHT → use FIRST COLUMN
        window.selectionPattern = selectedCells
            .filter(c => c.cell.cellIndex === startCol)
            .map(c => c.cell.innerText.trim() || "-");
    } else {
        // 👉 TOP → DOWN → use FIRST ROW
        window.selectionPattern = selectedCells
            .filter(c => c.cell.parentElement.rowIndex - 1 === startRow)
            .map(c => c.cell.innerText.trim() || "-");
    }
}

function clearSelection() {
    selectedCells.forEach(item => {
        item.cell.style.outline = "none";
        item.cell.style.background = item.cell.dataset.originalBg || "";
    });
    selectedCells = [];
}



function applyColor(cell, shift) {
    let color = "#fff";

    if (shift === "S1") color = "#cce5ff";
    else if (shift === "S2") color = "#ffe5cc";
    else if (shift === "S3") color = "#e6ccff";
    else if (shift === "WO") color = "#d6d6d6";
    else if (shift === "G") color = "#ccffd9";
    else if (shift === "LV") color = "#ffcccc";
    else if (shift === "GH") color = "#ffffcc";
    else if (shift === "CO") color = "#ccf2ff";

    cell.style.background = color;
}

function updateRowSummary(empId, oldShift, newShift) {

    const cell = document.querySelector(`[data-emp="${empId}"][data-date]`);
    if (!cell) return;

    const row = cell.closest("tr");

    const summaryCells = row.querySelectorAll("td");
    const totalCols = summaryCells.length;

    // last 9 columns = summary (added WD)
    const summaryStart = totalCols - 9;

    // ❗ ADD THIS SAFETY FIX
    if (summaryStart < 0) return;

    const shiftIndex = {
        S1:0, S2:1, S3:2, G:3, WO:4, CO:5, GH:6, LV:7
    };

    // decrease old
    if (shiftIndex[oldShift] !== undefined) {
        let cell = summaryCells[summaryStart + shiftIndex[oldShift]];
        cell.innerText = Math.max(0, (parseInt(cell.innerText) || 0) - 1);
    }

    // increase new
    if (shiftIndex[newShift] !== undefined) {
        let cell = summaryCells[summaryStart + shiftIndex[newShift]];
        cell.innerText = parseInt(cell.innerText) + 1;
    }

    // ✅ NOW calculate WD (CORRECT)
    const wdCell = summaryCells[summaryStart + 8];

    const s1 = parseInt(summaryCells[summaryStart + 0].innerText);
    const s2 = parseInt(summaryCells[summaryStart + 1].innerText);
    const s3 = parseInt(summaryCells[summaryStart + 2].innerText);
    const g  = parseInt(summaryCells[summaryStart + 3].innerText);

    wdCell.innerText = s1 + s2 + s3 + g;
}

function updatePivot(date, oldShift, newShift) {

    const pivotRows = document.querySelectorAll("tr");

    pivotRows.forEach(row => {
        const firstCell = row.querySelector("td");
        if (!firstCell) return;

        const shift = firstCell.innerText.trim();

        const cells = row.querySelectorAll("td");

        // find column index
        let colIndex = datesGlobal.indexOf(date) + 1;

        if (colIndex <= 0) return;

        // decrease old shift
        if (shift === oldShift) {
            let val = parseInt(cells[colIndex].innerText);
            let newVal = val - 1;
            cells[colIndex].innerText = newVal;
            applyPivotColor(cells[colIndex], newVal); // ✅ ADD THIS
        }

        // increase new shift
        if (shift === newShift) {
            let val = parseInt(cells[colIndex].innerText);
            let newVal = val + 1;
            cells[colIndex].innerText = newVal;
            applyPivotColor(cells[colIndex], newVal); // ✅ ADD THIS
        }
    });

    // 👉 update TOTAL row
    const totalRow = Array.from(document.querySelectorAll("tr")).find(row => {
        const firstCell = row.querySelector("td");
        return firstCell && firstCell.innerText.trim() === "Total";
    });

    if (totalRow) {
        const cells = totalRow.querySelectorAll("td");
        let colIndex = datesGlobal.indexOf(date) + 1;

        if (colIndex > 0) {

            const s1 = getPivotValue("S1", colIndex);
            const s2 = getPivotValue("S2", colIndex);
            const s3 = getPivotValue("S3", colIndex);
            const g  = getPivotValue("G", colIndex);

            let total = s1 + s2 + s3 + g;
            cells[colIndex].innerText = total;
            applyPivotColor(cells[colIndex], total); // ✅ ADD THIS
        }
    }

    // helper
    function getPivotValue(shift, colIndex) {
        const row = Array.from(document.querySelectorAll("tr")).find(r => {
            const cell = r.querySelector("td");
            return cell && cell.innerText.trim() === shift;
        });

        if (!row) return 0;

        const val = parseInt(row.querySelectorAll("td")[colIndex].innerText);
        return isNaN(val) ? 0 : val;
    }
}

function applyPivotColor(cell, val) {
    if (val > 2) {
        cell.style.background = "#16a34a";
        cell.style.color = "white";
    } else if (val < 2) {
        cell.style.background = "#fecaca";
        cell.style.color = "#7f1d1d";
    } else {
        cell.style.background = "";
        cell.style.color = "";
    }
}

function reloadRoster() {

    const today = new Date();

    document.getElementById("monthSelect").value = today.getMonth() + 1;
    document.getElementById("yearSelect").value = today.getFullYear();

    loadRoster();
}

function logout() {
    localStorage.removeItem("token");
    window.location.href = "/static/roster.html";
}

async function createRoster() {

    if (!localStorage.getItem("token")) {
        alert("Admin login required");
        return;
    }

    if (!confirm("Create empty roster for selected month?")) {
        return;
    }

    const month = document.getElementById("monthSelect").value;
    const year = document.getElementById("yearSelect").value;

    const res = await fetch(`/rosters?month=${month}&year=${year}`, {
        method: "POST",
        headers: {
            "Authorization": "Bearer " + localStorage.getItem("token")
        }
    });

    const data = await res.json();

    if (res.status !== 200) {
        alert(data.detail || "Failed to create roster");
        return;
    }

    alert("Empty roster created successfully");

    loadRoster(); // reload UI
}

async function showAddEmployee() {

    if (!localStorage.getItem("token")) {
        alert("Admin login required");
        return;
    }

    const name = prompt("Enter employee name:");
    if (!name) return;

    const team = prompt("Enter team:");
    if (!team) return;

    const res = await fetch("/employees", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Authorization": "Bearer " + localStorage.getItem("token")
        },
        body: JSON.stringify({ name, team })
    });

    const data = await res.json();

    if (res.status !== 200) {
        alert("Failed to add employee");
        return;
    }

    alert("Employee added successfully");

    loadRoster();
}

function exportRoster() {

    const month = document.getElementById("monthSelect").value;
    const year = document.getElementById("yearSelect").value;

    if (!month || !year) {
        alert("Please select month & year");
        return;
    }

    window.open(`/roster/export?month=${month}&year=${year}`, "_blank");
}

async function showAddAdmin() {

    const username = prompt("Enter admin username:");
    if (!username) return;

    const password = prompt("Enter password:");
    if (!password) return;

    const res = await fetch("/admin-users", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Authorization": "Bearer " + localStorage.getItem("token")
        },
        body: JSON.stringify({ username, password })
    });

    if (res.status !== 200) {
        alert("Failed to add admin");
        return;
    }

    alert("Admin added successfully");
}

async function deleteAdmin() {

    const res = await fetch("/admin-users", {
        headers: {
            "Authorization": "Bearer " + localStorage.getItem("token")
        }
    });

    const admins = await res.json();

    const id = prompt(
        "Enter admin ID to delete:\n" +
        admins.map(a => `${a.id} - ${a.username}`).join("\n")
    );

    if (!id) return;

    await fetch(`/admin-users/${id}`, {
        method: "DELETE",
        headers: {
            "Authorization": "Bearer " + localStorage.getItem("token")
        }
    });

    alert("Admin removed");
}

function applyRoleUI() {
    const token = localStorage.getItem("token");
    const user = getUserFromToken();    

    const adminSection = document.getElementById("adminSection");
    const createBtn = document.getElementById("createRosterBtn");
    const addBtn = document.getElementById("addEmployeeBtn");
    const delBtn = document.getElementById("deleteEmployeeBtn");

    if (!token) {
        if (adminSection) adminSection.style.display = "none";
    } else {
        if (user?.role === "admin") {
            if (adminSection) adminSection.style.display = "block";
            if (createBtn) createBtn.style.display = "inline-block";
        } else {
            if (adminSection) adminSection.style.display = "none";
            if (createBtn) createBtn.style.display = "none";
        }
    }
}

async function loadAuditLogs() {

    const month = document.getElementById("monthSelect").value;
    const year = document.getElementById("yearSelect").value;

    const res = await fetch(`/audit-logs?month=${month}&year=${year}`);
    const data = await res.json();

    let html = "";

    data.forEach(log => {

        let text = "";

        if (log.old === "COMMENT") {
            text = `💬 ${log.user} added comment for ${log.employee}`;
        } else {
            text = `🔄 ${log.user} changed ${log.employee}: ${log.old || '-'} → ${log.new}`;
        }

        html += `
            <div style="border-bottom:1px solid #eee; padding:6px;">
                <div><b>${text}</b></div>
                <div style="font-size:11px; color:gray;">
                    ${log.date} | ${log.user} | ${log.time}
                </div>
            </div>
        `;
    });

    document.getElementById("auditContent").innerHTML = html;
}

async function loadEmployees() {

    const res = await fetch("/employees");
    const data = await res.json();

    let html = "";

    data.forEach(emp => {
        html += `
            <tr class="border-b">
                <td class="p-2">${emp.name}</td>
                <td class="p-2">${emp.team}</td>
                <td class="p-2">
                    <button 
                        class="bg-red-500 text-white px-3 py-1 rounded hover:bg-red-600"
                        onclick="deleteEmployeeById(${emp.id})">
                        Delete
                    </button>
                </td>
            </tr>
        `;
    });

    document.getElementById("employeeList").innerHTML = html;
}

async function deleteEmployeeById(empId) {

    if (!localStorage.getItem("token")) {
        alert("Admin login required");
        return;
    }

    if (!confirm("Are you sure you want to delete this employee?")) return;

    const res = await fetch(`/employees/${empId}`, {
        method: "DELETE",
        headers: {
            "Authorization": "Bearer " + localStorage.getItem("token")
        }
    });

    const data = await res.json();

    if (res.status !== 200) {
        alert(data.detail || "Failed to delete employee");
        return;
    }

    alert("Employee deleted successfully");

    loadEmployees(); // refresh table
}

async function addEmployee() {

    const name = document.getElementById("empName").value;
    const team = document.getElementById("empTeam").value;

    if (!name || !team) {
        alert("Enter name and team");
        return;
    }

    const res = await fetch("/employees", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Authorization": "Bearer " + localStorage.getItem("token")
        },
        body: JSON.stringify({ name, team })
    });

    const data = await res.json();

    if (res.status !== 200) {
        alert("Failed to add employee");
        return;
    }

    alert("Employee added");

    document.getElementById("empName").value = "";
    document.getElementById("empTeam").value = "";

    loadEmployees();
}

async function loadAdmins() {

    const res = await fetch("/admin-users", {
        headers: {
            "Authorization": "Bearer " + localStorage.getItem("token")
        }
    });

    const data = await res.json();

    let html = "";

    data.forEach(admin => {
        html += `
            <tr class="border-b">
                <td class="p-2">${admin.id}</td>
                <td class="p-2">${admin.username}</td>
                <td class="p-2">
                    <button 
                        class="bg-red-500 text-white px-3 py-1 rounded hover:bg-red-600"
                        onclick="deleteAdminById(${admin.id})">
                        Delete
                    </button>
                </td>
            </tr>
        `;
    });

    document.getElementById("adminList").innerHTML = html;
}

async function addAdmin() {

    const username = document.getElementById("adminUsername").value;
    const password = document.getElementById("adminPassword").value;

    if (!username || !password) {
        alert("Enter username & password");
        return;
    }

    const res = await fetch("/admin-users", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Authorization": "Bearer " + localStorage.getItem("token")
        },
        body: JSON.stringify({ username, password })
    });

    if (res.status !== 200) {
        alert("Failed to add admin");
        return;
    }

    alert("Admin added");

    document.getElementById("adminUsername").value = "";
    document.getElementById("adminPassword").value = "";

    loadAdmins();
}

async function deleteAdminById(id) {

    if (!confirm("Are you sure you want to delete this admin?")) return;

    const res = await fetch(`/admin-users/${id}`, {
        method: "DELETE",
        headers: {
            "Authorization": "Bearer " + localStorage.getItem("token")
        }
    });

    if (res.status !== 200) {
        alert("Failed to delete admin");
        return;
    }

    alert("Admin deleted");

    loadAdmins();
}

function initSidebar(page) {

    const token = localStorage.getItem("token");

    // 🔹 Page buttons
    const rosterBtn = document.getElementById("navRoster");
    const reportsBtn = document.getElementById("navReports");
    const empBtn = document.getElementById("navEmployees");
    const adminBtn = document.getElementById("navAdmin");

    if (page === "roster" && rosterBtn) rosterBtn.style.display = "none";
    if (page === "reports" && reportsBtn) reportsBtn.style.display = "none";
    if (page === "employees" && empBtn) empBtn.style.display = "none";
    if (page === "admin" && adminBtn) adminBtn.style.display = "none";

    // 🔹 Login / Logout
    const loginBtn = document.getElementById("loginBtn");
    const logoutBtn = document.getElementById("logoutBtn");
    const userLabel = document.getElementById("userLabel");

    if (token) {
        if (loginBtn) loginBtn.style.display = "none";
        if (logoutBtn) logoutBtn.style.display = "block";

        if (userLabel) {
            const user = getUserFromToken();

            userLabel.innerText = user?.username
                ? `👤 ${user.username}`
                : "👤 User";
            userLabel.style.display = "block";
        }
    } else {
        if (loginBtn) loginBtn.style.display = "block";
        if (logoutBtn) logoutBtn.style.display = "none";

        if (userLabel) userLabel.style.display = "none";
    }
}

function getUserFromToken() {
    const token = localStorage.getItem("token");
    if (!token) return null;

    try {
        return JSON.parse(atob(token.split('.')[1]));
    } catch {
        return null;
    }
}

document.addEventListener("DOMContentLoaded", function () {

    initMonthDropdown();

    const today = new Date();

    if (document.getElementById("monthSelect")) {
        document.getElementById("monthSelect").value = today.getMonth() + 1;
    }

    if (document.getElementById("yearSelect")) {
        document.getElementById("yearSelect").value = today.getFullYear();
    }

    applyRoleUI();

    if (document.getElementById("rosterTable")) loadRoster();
    if (document.getElementById("employeeList")) loadEmployees();
    if (document.getElementById("adminList")) loadAdmins();
});

document.addEventListener("click", function (e) {
    const menu = document.getElementById("adminDropdown");
    const button = document.querySelector(".admin-menu button");

    if (menu && button && !menu.contains(e.target) && e.target !== button) {
        menu.style.display = "none";
    }
});

let buffer = "";

document.addEventListener("keydown", async function(e) {

    // 🔹 TARGET CELLS
    const targets = selectedCells.length > 0
        ? selectedCells
        : (activeCell ? [{
            cell: activeCell,
            empId: activeCell.dataset.emp,
            date: activeCell.dataset.date
        }] : []);

    if (!targets.length) return;

    // =========================
    // 🔤 TYPING (INLINE EDIT)
    // =========================
    if (/^[a-zA-Z0-9]$/.test(e.key)) {

        buffer += e.key.toUpperCase();
        if (buffer.length > 2) buffer = buffer.slice(-2);

        const valid = ["S1","S2","S3","G","WO","CO","GH","LV"];
        if (!valid.includes(buffer)) return;

        for (const item of targets) {

            const old = item.cell.innerText.trim() || "-"; // ✅ FIXED

            await fetch(
                `/roster-entry?employee_id=${item.empId}&date=${item.date}&shift_code=${buffer}`,
                {
                    method: "PUT",
                    headers: {
                        "Authorization": "Bearer " + localStorage.getItem("token")
                    }
                }
            );

            item.cell.innerHTML = buffer;
            applyColor(item.cell, buffer);

            updateRowSummary(item.empId, old, buffer);
            updatePivot(item.date, old, buffer);

            // ✅ VISUAL FEEDBACK
            item.cell.style.outline = "2px solid green";
            setTimeout(() => item.cell.style.outline = "none", 200);
        }

        buffer = "";
        clearSelection();
        return; // ✅ IMPORTANT (STOP HERE)
    }

    // =========================
    // ⬅️ NAVIGATION
    // =========================

    if (!activeCell) return;

    if (e.key === "Enter") {
        e.preventDefault();
        activeCell.parentElement.nextElementSibling?.cells[activeCell.cellIndex]?.click();
        return;
    }

    if (e.key === "Tab") {
        e.preventDefault();
        activeCell.parentElement.cells[activeCell.cellIndex + 1]?.click();
        return;
    }

    const row = activeCell.parentElement;
    const table = row.parentElement;

    let r = row.rowIndex;
    let c = activeCell.cellIndex;

    if (e.key === "ArrowRight") c++;
    if (e.key === "ArrowLeft") c--;
    if (e.key === "ArrowDown") r++;
    if (e.key === "ArrowUp") r--;

    const nextRow = table.rows[r];
    if (!nextRow) return;

    const nextCell = nextRow.cells[c];
    if (!nextCell || !nextCell.dataset.emp) return;

    activeCell = nextCell;

    nextCell.scrollIntoView({ block: "nearest", inline: "nearest" });
    nextCell.style.outline = "2px solid blue";

    setTimeout(() => nextCell.style.outline = "none", 300);
});

let activeCell = null;

document.addEventListener("click", (e) => {
    const cell = e.target.closest("td");
    if (cell && cell.dataset.emp) {
        activeCell = cell;
    }
});