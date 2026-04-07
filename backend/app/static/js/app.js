let isDragging = false;
let selectedCells = [];
let startCell = null;
let rosterData = [];
let datesGlobal = [];
let dragCompleted = false;
let historyStack = [];
let redoStack = [];
let auditOpen = false;

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

    document.getElementById("loginBox").style.display = "none";

    loadRoster();

}

async function loadRoster() {
    if (localStorage.getItem("token")) {
        document.getElementById("loginBox").style.display = "none";
    }
    const month = document.getElementById("monthSelect").value;
    const year = document.getElementById("yearSelect").value;

    const res = await fetch(`/roster?month=${month}&year=${year}`);
    const data = await res.json();
    if (!data.length) return;
    // ✅ ADD THIS BLOCK
    const rosterStatus = data[0].status || "DRAFT";

    document.getElementById("statusLabel").innerText =
        rosterStatus === "FINAL" ? "🔒 FINAL" : "✏️ DRAFT";

    rosterData = data;
    datesGlobal = Object.keys(data[0].shifts).sort();

    const dates = Object.keys(data[0].shifts).sort();

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
        html += `<table border="1">`;

        html += "<tr><th>Employee</th>";
        dates.forEach(d => {
            const dateObj = new Date(d);

            const day = dateObj.toLocaleDateString("en-US", { weekday: "short" });
            const dateNum = dateObj.getDate();

            const isWeekend = dateObj.getDay() === 0 || dateObj.getDay() === 6;

            html += `<th style="${isWeekend ? 'background:#ffecec;' : ''}">
                <div style="line-height:1.2;">
                    <div style="font-size:11px;">${day}</div>
                    <div style="font-size:13px; font-weight:bold;">${dateNum}</div>
                </div>
            </th>`;
        });
        // 👉 spacer column
        html += `<th style="width:6px; background:#e5e7eb;"></th>`;

        // 👉 summary headers
        html += `<th>S1</th><th>S2</th><th>S3</th><th>G</th><th>WO</th><th>CO</th><th>GH</th><th>LV</th><th>WD</th>`;
        html += "</tr>";

        groups[team].forEach(emp => {

            // 👉 initialize counters
            let counts = {
                S1:0, S2:0, S3:0, G:0, WO:0, CO:0, GH:0, LV:0
            };

            html += `<tr><td>${emp.employee_name}</td>`;

            dates.forEach(d => {
                const shift = emp.shifts[d] || '-';
                const comment = emp.comments ? emp.comments[d] : null;

                if (counts[shift] !== undefined) {
                    counts[shift]++;
                }

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

                let bgColor = color;

                if (isWeekend && shift === '-') {
                    bgColor = "#fff5f5";
                }

                let extraClass = "";

                if (comment) {
                    extraClass = "comment-cell";
                }

                html += `<td class="${extraClass}"
                            style="background:${bgColor}"
                            data-emp="${emp.employee_id}"
                            data-date="${d}"
                            title="${comment || ''}">
                            ${shift}
                        </td>`;
            });

            // 👉 spacer cell
            html += `<td style="background:#e5e7eb;"></td>`;

            const workingDays = counts.S1 + counts.S2 + counts.S3 + counts.G;
            // 👉 ADD RIGHT SIDE SUMMARY
            html += "<td>"+counts.S1+"</td>" +
                    "<td>"+counts.S2+"</td>" +
                    "<td>"+counts.S3+"</td>" +
                    "<td>"+counts.G+"</td>" +
                    "<td>"+counts.WO+"</td>" +
                    "<td>"+counts.CO+"</td>" +
                    "<td>"+counts.GH+"</td>" +
                    "<td>"+counts.LV+"</td>" +
                    "<td><b>"+workingDays+"</b></td>";

            html += "</tr>";
        });

        // html += `<tr style="height:2px;"></tr>`;

        // html += `<tr style="background:#eef2ff; font-weight:bold;">
        //     <td colspan="${dates.length + 10}" style="text-align:center;">
        //         Shift Summary
        //     </td>
        // </tr>`;

        // spacer row
        html += `<tr>
            <td colspan="${dates.length + 11}" style="height:8px; background:#f5f7fb;"></td>
        </tr>`;

        // Employee column
        html += `<td><b>Shift Summary</b></td>`;

        // date columns
        for (let i = 0; i < dates.length; i++) {
            html += `<td></td>`;
        }

        // spacer
        html += `<td style="background:#e5e7eb;"></td>`;

        // summary columns (9)
        for (let i = 0; i < 9; i++) {
            html += `<td></td>`;
        }

        html += `</tr>`;

        // 👉 Pivot summary (Shift vs Date)
        let pivot = {
            S1:{}, S2:{}, S3:{}, G:{}, WO:{}, CO:{}, GH:{}, LV:{}
        };

        // initialize
        dates.forEach(d => {
            Object.keys(pivot).forEach(shift => {
                pivot[shift][d] = 0;
            });
        });

        // fill data
        groups[team].forEach(emp => {
            dates.forEach(d => {
                const shift = emp.shifts[d] || '-';
                const comment = emp.comments ? emp.comments[d] : null;

                if (pivot[shift]) {
                    pivot[shift][d]++;
                }
            });
        });

        // 👉 render pivot rows
        Object.keys(pivot).forEach(shift => {

            html += `<tr style="background:#e8f0fe; font-weight:bold;">
                <td style="background:#e8f0fe;">
                    <b>${shift}</b>
                </td>`;

            dates.forEach(d => {
                const count = pivot[shift][d];

                let style = "font-weight:normal;";

                if (count > 2) {
                    style += "background:#28a745; color:white; font-weight:bold;";
                } else if (count < 2) {
                    style += "background:#dc3545; color:white; font-weight:bold;";
                }

                html += `<td style="${style}">${count}</td>`;
            });

            // empty for right-side summary columns
            // divider column
            html += `<td style="background:#e5e7eb;"></td>`;

            // remaining empty summary columns
            for (let i = 0; i < 9; i++) {
                html += `<td></td>`;
            }

            html += `</tr>`;
        });

        // 👉 TOTAL RESOURCES ROW
        html += `<tr style="background:#d1fae5; font-weight:bold;">
            <td><b>Total</b></td>`;

        dates.forEach(d => {
            const total =
                pivot.S1[d] +
                pivot.S2[d] +
                pivot.S3[d] +
                pivot.G[d];

            html += `<td style="background:#059669; color:white;">${total}</td>`;
        });

        // divider column
        html += `<td style="background:#e5e7eb;"></td>`;

        // remaining summary columns
        for (let i = 0; i < 9; i++) {
            html += `<td></td>`;
        }

        html += `</tr>`;

        html += "</table><br>";
    }

    document.getElementById("rosterTable").innerHTML = html;

    const bulkSelect = document.getElementById("bulkSelect");

    if (bulkSelect) {
        bulkSelect.onchange = async function() {
            if (!localStorage.getItem("token")) {
                alert("Login required");
                return;
            }
            const shift = this.value;
            if (!shift) return;

            redoStack = [];

            for (let item of selectedCells) {
                const res = await fetch(`/roster-entry?employee_id=${item.empId}&date=${item.date}&shift_code=${shift}`, {
                    method: "PUT",
                    headers: {
                        "Authorization": "Bearer " + localStorage.getItem("token")
                    }
                });

                if (res.status === 401) {
                    alert("Session expired. Please login again.");
                    localStorage.removeItem("token");
                    loadRoster();
                    return;
                }

                const oldValue = item.cell.innerText.trim();

                historyStack.push({
                    empId: item.empId,
                    date: item.date,
                    oldValue,
                    newValue: shift
                });

                // redoStack = []; // ✅ CLEAR REDO STACK

                const existingComment = item.cell.title;

                item.cell.innerHTML = shift;
                applyColor(item.cell, shift);

                // restore comment style
                if (existingComment) {
                    item.cell.title = existingComment;
                    item.cell.classList.add("comment-cell");
                }
                // 🔥 ADD THIS
                updateRowSummary(item.empId, oldValue, shift);
                updatePivot(item.date, oldValue, shift);
            }

            clearSelection();
            document.getElementById("bulkDropdown").style.display = "none";
            // ✅ ADD THIS LINE HERE
            document.getElementById("bulkSelect").value = "";
        };
    }

    const token = localStorage.getItem("token");

    const createBtn = document.querySelector("button[onclick='createRoster()']");
    const addBtn = document.querySelector("button[onclick='showAddEmployee()']");
    const delBtn = document.querySelector("button[onclick='deleteEmployee()']");
    const adminSection = document.getElementById("adminSection");

    if (!token) {
        document.getElementById("undoBtn").style.display = "none";
        document.getElementById("redoBtn").style.display = "none";
        document.getElementById("logoutBtn").style.display = "none";
        document.getElementById("loginBox").style.display = "block";
        document.getElementById("finalizeBtn").style.display = "none";

        if (createBtn) createBtn.style.display = "none";
        if (addBtn) addBtn.style.display = "none";
        if (delBtn) delBtn.style.display = "none";
        if (adminSection) adminSection.style.display = "none";

    } else {
        document.getElementById("undoBtn").style.display = "inline-block";
        document.getElementById("redoBtn").style.display = "inline-block";
        document.getElementById("logoutBtn").style.display = "inline-block";
        document.getElementById("loginBox").style.display = "none";
        document.getElementById("finalizeBtn").style.display = "inline-block";

        if (createBtn) createBtn.style.display = "inline-block";
        if (addBtn) addBtn.style.display = "inline-block";
        if (delBtn) delBtn.style.display = "inline-block";
        if (adminSection) adminSection.style.display = "block";
}
    attachEvents(); // ✅ IMPORTANT
}

function attachEvents() {
    const cells = document.querySelectorAll("#rosterTable td");

    cells.forEach(cell => {

        cell.addEventListener("mousedown", (e) => {
            if (!localStorage.getItem("token")) return;
            if (e.button !== 0) return;

            isDragging = true;
            startCell = cell;
            updateSelection(cell);
        });

        cell.addEventListener("mouseenter", () => {
            if (!isDragging) return;
            updateSelection(cell);
        });

        cell.addEventListener("click", () => {

            // ✅ MAIN FIX: block click right after drag
            if (dragCompleted) {
                dragCompleted = false;
                return;
            }

            // existing condition
            if (selectedCells.length > 1) return;

            editCell(cell, cell.dataset.emp, cell.dataset.date);
        });

        cell.addEventListener("contextmenu", async (e) => {
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
            loadAuditLogs();
        });

    });

    document.addEventListener("mouseup", (e) => {
        if (!isDragging) return;

        isDragging = false;
        dragCompleted = true; // ✅ IMPORTANT
        // 🔥 BONUS: safety reset (prevents stuck state)
        setTimeout(() => {
            dragCompleted = false;
        }, 100);

        if (selectedCells.length === 0) return;

        const dropdown = document.getElementById("bulkDropdown");

        dropdown.style.display = "block";
        dropdown.style.left = e.pageX + "px";
        dropdown.style.top = e.pageY + "px";
    });
}

function updateSelection(endCell) {
    clearSelection();

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

            selectedCells.push({
                cell,
                empId: cell.dataset.emp,
                date: cell.dataset.date
            });
        }
    }

    console.log("Selected:", selectedCells.length);
}

function clearSelection() {
    selectedCells.forEach(item => {
        item.cell.style.outline = "none";
    });
    selectedCells = [];
}

function editCell(cell, empId, date) {
    if (!localStorage.getItem("token")) {
        alert("Login required");
        return;
    }

    const shifts = ["S1","S2","S3","G","WO","CO","GH","LV"];

    // prevent duplicate dropdown
    if (cell.querySelector("select")) return;

    let dropdown = document.createElement("select");

    let defaultOption = document.createElement("option");
    defaultOption.value = "";
    defaultOption.text = "Select";
    dropdown.appendChild(defaultOption);

    shifts.forEach(s => {
        let option = document.createElement("option");
        option.value = s;
        option.text = s;
        dropdown.appendChild(option);
    });

    cell.innerHTML = "";
    cell.appendChild(dropdown);

    dropdown.focus();

    dropdown.onchange = async function() {

        const selected = this.value;
        const oldValue = cell.innerText.trim();

        // ✅ SAVE HISTORY
        historyStack.push({
            empId,
            date,
            oldValue,
            newValue: selected
        });

        // clear redo stack
        redoStack = [];

        const res = await fetch(
            `/roster-entry?employee_id=${empId}&date=${date}&shift_code=${selected}`,
            {
                method: "PUT",
                headers: {
                    "Authorization": "Bearer " + localStorage.getItem("token")
                }
            }
        );

        if (res.status === 401) {
            alert("Session expired. Please login again.");
            localStorage.removeItem("token");
            loadRoster();
            return;
        }

        // preserve comment BEFORE updating UI
        const existingComment = cell.title;

        // update cell value + color
        cell.innerHTML = selected;
        applyColor(cell, selected);

        // restore comment (if exists)
        if (existingComment) {
            cell.title = existingComment;
            cell.classList.add("comment-cell");
        }

        // 🔥 update summaries
        updateRowSummary(empId, oldValue, selected);
        updatePivot(date, oldValue, selected);

        // 🔥 single audit refresh (FIXED)
        loadAuditLogs();
    };
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
            cells[colIndex].innerText = val - 1;
        }

        // increase new shift
        if (shift === newShift) {
            let val = parseInt(cells[colIndex].innerText);
            cells[colIndex].innerText = val + 1;
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

            cells[colIndex].innerText = s1 + s2 + s3 + g;
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

function undoLastChange() {

    if (historyStack.length === 0) {
        alert("Nothing to undo");
        return;
    }

    const last = historyStack.pop();

    redoStack.push(last);

    const { empId, date, oldValue, newValue } = last;

    const cell = document.querySelector(
        `[data-emp="${empId}"][data-date="${date}"]`
    );

    if (!cell) return;

    // revert UI
    cell.innerHTML = oldValue;
    applyColor(cell, oldValue);

    // 🔥 update summaries
    updateRowSummary(empId, newValue, oldValue);
    updatePivot(date, newValue, oldValue);
}

function redoLastChange() {

    if (redoStack.length === 0) {
        alert("Nothing to redo");
        return;
    }

    const last = redoStack.pop();

    // move back to history
    historyStack.push(last);

    const { empId, date, oldValue, newValue } = last;

    const cell = document.querySelector(
        `[data-emp="${empId}"][data-date="${date}"]`
    );

    if (!cell) return;

    cell.innerHTML = newValue;
    applyColor(cell, newValue);

    updateRowSummary(empId, oldValue, newValue);
    updatePivot(date, oldValue, newValue);
}

function reloadRoster() {
    loadRoster();
}

function logout() {

    localStorage.removeItem("token");

    alert("Logged out");

    loadRoster(); // reload UI
}

async function finalizeRoster() {

    const month = document.getElementById("monthSelect").value;
    const year = document.getElementById("yearSelect").value;

    const res = await fetch(`/roster/finalize?month=${month}&year=${year}`, {
        method: "PUT",
        headers: {
            "Authorization": "Bearer " + localStorage.getItem("token")
        }
    });

    if (res.status !== 200) {
        alert("Failed to finalize");
        return;
    }

    alert("Roster finalized");

    loadRoster();
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

async function deleteEmployee() {

    if (!localStorage.getItem("token")) {
        alert("Admin login required");
        return;
    }

    const res = await fetch("/employees");
    const employees = await res.json();

    const dropdown = document.getElementById("employeeDropdown");
    dropdown.innerHTML = "";

    employees.forEach(emp => {
        const option = document.createElement("option");
        option.value = emp.id;
        option.text = `${emp.name} (${emp.team})`;
        dropdown.appendChild(option);
    });

    document.getElementById("employeePopup").style.display = "block";
}

async function confirmDeleteEmployee() {

    const empId = document.getElementById("employeeDropdown").value;

    if (!confirm("Are you sure you want to remove this employee?")) return;

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

    alert("Employee removed");

    closeEmployeePopup();
    loadRoster();
}

function closeEmployeePopup() {
    document.getElementById("employeePopup").style.display = "none";
}

function exportRoster() {

    const month = document.getElementById("monthSelect").value;
    const year = document.getElementById("yearSelect").value;

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

    const adminSection = document.getElementById("adminSection");
    const createBtn = document.querySelector("button[onclick='createRoster()']");
    const addBtn = document.querySelector("button[onclick='showAddEmployee()']");
    const delBtn = document.querySelector("button[onclick='deleteEmployee()']");

    if (!token) {
        if (adminSection) adminSection.style.display = "none";
        if (createBtn) createBtn.style.display = "none";
        if (addBtn) addBtn.style.display = "none";
        if (delBtn) delBtn.style.display = "none";
    } else {
        if (adminSection) adminSection.style.display = "block";
        if (createBtn) createBtn.style.display = "inline-block";
        if (addBtn) addBtn.style.display = "inline-block";
        if (delBtn) delBtn.style.display = "inline-block";
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
            text = `🔄 ${log.employee}: ${log.old || '-'} → ${log.new}`;
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

function toggleAudit() {

    const panel = document.getElementById("auditPanel");
    const overlay = document.getElementById("auditOverlay");

    if (auditOpen) {
        panel.style.transform = "translateX(100%)";  // close
        overlay.style.display = "none";
    } else {
        panel.style.transform = "translateX(0%)";    // open
        overlay.style.display = "block";
        loadAuditLogs();
    }

    auditOpen = !auditOpen;
}

function toggleAdminMenu() {
    const menu = document.getElementById("adminDropdown");
    menu.style.display = (menu.style.display === "block") ? "none" : "block";
}

document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && auditOpen) {
        toggleAudit();
    }
});

document.addEventListener("DOMContentLoaded", function () {

    const today = new Date();

    document.getElementById("monthSelect").value = today.getMonth() + 1;
    document.getElementById("yearSelect").value = today.getFullYear();

    document.getElementById("auditOverlay").onclick = function () {
        toggleAudit();
    };

    const panel = document.getElementById("auditPanel");
    panel.style.transform = "translateX(100%)";

    applyRoleUI();
    loadRoster();
});

// ✅ ADD THIS BELOW
document.addEventListener("keydown", (e) => {
    if (e.ctrlKey && e.key === "z") {
        e.preventDefault();
        undoLastChange();
    }

    // ✅ ADD THIS
    if (e.ctrlKey && e.key === "y") {
        e.preventDefault();
        redoLastChange();
    }

});

document.addEventListener("click", function (e) {
    const menu = document.getElementById("adminDropdown");
    const button = document.querySelector(".admin-menu button");

    if (menu && button && !menu.contains(e.target) && e.target !== button) {
        menu.style.display = "none";
    }
});