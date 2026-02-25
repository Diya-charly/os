(function() {
    // ----- DATA MODEL -----
    let processes = [
        { id: 'P1', arrival: 0, burst: 5 },
        { id: 'P2', arrival: 2, burst: 3 },
        { id: 'P3', arrival: 4, burst: 1 }
    ];

    // ----- DOM elements -----
    const tbody = document.getElementById('tableBody');
    const addBtn = document.getElementById('addRowBtn');
    const removeBtn = document.getElementById('removeRowBtn');
    const simulateBtn = document.getElementById('simulateBtn');
    const ganttDiv = document.getElementById('ganttChart');
    const statsBody = document.getElementById('statsBody');
    const avgWaitSpan = document.getElementById('avgWaitValue');
    const sjfLogBox = document.getElementById('sjfLogBox');
    const sjfLogEntries = document.getElementById('sjfLogEntries');

    // ----- render table from processes array -----
    function renderTable() {
        let html = '';
        processes.forEach((p, index) => {
            html += `<tr>
                <td><input type="text" value="${p.id}" placeholder="P${index+1}" data-index="${index}" data-field="id"></td>
                <td><input type="number" value="${p.arrival}" step="0.1" min="0" data-index="${index}" data-field="arrival"></td>
                <td><input type="number" value="${p.burst}" step="0.1" min="0.1" data-index="${index}" data-field="burst"></td>
            </tr>`;
        });
        tbody.innerHTML = html;

        document.querySelectorAll('#tableBody input').forEach(input => {
            input.addEventListener('input', function(e) {
                const idx = this.dataset.index;
                const field = this.dataset.field;
                if (idx === undefined) return;
                if (field === 'id') {
                    processes[idx].id = this.value || `P${parseInt(idx)+1}`;
                } else if (field === 'arrival') {
                    let val = parseFloat(this.value);
                    processes[idx].arrival = isNaN(val) ? 0 : Math.max(0, val);
                } else if (field === 'burst') {
                    let val = parseFloat(this.value);
                    processes[idx].burst = (isNaN(val) || val <= 0) ? 0.1 : val;
                }
            });
        });
    }

    addBtn.addEventListener('click', () => {
        processes.push({ id: `P${processes.length+1}`, arrival: 0, burst: 1 });
        renderTable();
    });

    removeBtn.addEventListener('click', () => {
        if (processes.length > 1) {
            processes.pop();
            renderTable();
        } else {
            alert("At least one process required.");
        }
    });

    renderTable();

    // ----- SIMULATION ENGINES -----
    function simulateFCFS(procs) {
        let remaining = procs.map(p => ({ ...p, finished: false }));
        remaining.sort((a,b) => a.arrival - b.arrival);
        let time = 0;
        const segments = [];
        const results = [];
        for (let p of remaining) {
            if (time < p.arrival) time = p.arrival;
            const start = time;
            const finish = time + p.burst;
            segments.push({ pid: p.id, start, finish, burst: p.burst });
            results.push({
                id: p.id,
                arrival: p.arrival,
                burst: p.burst,
                start: start,
                finish: finish,
                waiting: start - p.arrival,
                turnaround: finish - p.arrival
            });
            time = finish;
        }
        const avgWait = results.reduce((acc, r) => acc + r.waiting, 0) / results.length;
        return { segments, results, avgWait, sjfLog: null };
    }

    function simulateSJF(procs) {
        let processesCopy = procs.map(p => ({ ...p, finished: false }));
        let time = 0;
        let completed = 0;
        const n = processesCopy.length;
        const segments = [];
        const results = [];
        const log = [];
        const startMap = new Map();
        const finishMap = new Map();

        while (completed < n) {
            let available = processesCopy.filter(p => !p.finished && p.arrival <= time);
            
            if (available.length === 0) {
                const nextArrival = Math.min(...processesCopy.filter(p => !p.finished).map(p => p.arrival));
                log.push(`⏳ CPU idle from ${time} to ${nextArrival} (no process ready)`);
                time = nextArrival;
                available = processesCopy.filter(p => !p.finished && p.arrival <= time);
            }

            available.sort((a, b) => {
                if (a.burst !== b.burst) return a.burst - b.burst;
                if (a.arrival !== b.arrival) return a.arrival - b.arrival;
                return a.id.localeCompare(b.id);
            });

            const chosen = available[0];
            const readyDescr = available.map(p => `${p.id}(burst=${p.burst})`).join(', ');
            log.push(`🕒 time ${time.toFixed(2)}  → ready: [ ${readyDescr} ]  → selected ${chosen.id} (shortest burst ${chosen.burst})`);

            const start = time;
            const finish = time + chosen.burst;
            segments.push({ pid: chosen.id, start, finish, burst: chosen.burst });
            startMap.set(chosen.id, start);
            finishMap.set(chosen.id, finish);
            chosen.finished = true;
            time = finish;
            completed++;
        }

        for (let p of procs) {
            const start = startMap.get(p.id);
            const finish = finishMap.get(p.id);
            const waiting = start - p.arrival;
            const turnaround = finish - p.arrival;
            results.push({
                id: p.id,
                arrival: p.arrival,
                burst: p.burst,
                start: start,
                finish: finish,
                waiting: waiting,
                turnaround: turnaround
            });
        }
        const avgWait = results.reduce((acc, r) => acc + r.waiting, 0) / results.length;
        return { segments, results, avgWait, sjfLog: log };
    }

    // ----- RENDER OUTPUT -----
    function drawGantt(segments) {
        if (!segments.length) {
            ganttDiv.innerHTML = '<div style="padding:20px;color:#667;">No execution segments</div>';
            return;
        }
        const totalBurst = segments.reduce((acc, s) => acc + s.burst, 0);
        let html = '';
        const palette = ['#3173a5', '#46997a', '#c27e3b', '#a6587c', '#5f6db0', '#b55b5b'];
        segments.forEach((seg, idx) => {
            const color = palette[idx % palette.length];
            html += `<div class="gantt-block" style="background: ${color}; flex: ${seg.burst} 1 0; min-width: 50px;">
                        <strong>${seg.pid}</strong>
                        <div class="gantt-label">${seg.start.toFixed(1)}-${seg.finish.toFixed(1)}</div>
                    </div>`;
        });
        ganttDiv.innerHTML = html;
    }

    function drawStats(results, avgWait) {
        let rows = '';
        results.forEach(r => {
            rows += `<tr>
                <td><strong>${r.id}</strong></td>
                <td>${r.arrival.toFixed(1)}</td>
                <td>${r.burst.toFixed(1)}</td>
                <td>${r.waiting.toFixed(2)}</td>
                <td>${r.turnaround.toFixed(2)}</td>
            </tr>`;
        });
        statsBody.innerHTML = rows;
        avgWaitSpan.innerText = avgWait.toFixed(3);
    }

    function showSjfLog(logEntries) {
        if (!logEntries || logEntries.length === 0) {
            sjfLogEntries.innerHTML = '<span class="empty-log">No SJF log (FCFS selected or no processes)</span>';
            return;
        }
        let logHtml = '';
        logEntries.forEach(entry => {
            logHtml += `📌 ${entry}<br>`;
        });
        sjfLogEntries.innerHTML = logHtml;
    }

    // ----- SIMULATE BUTTON -----
    simulateBtn.addEventListener('click', () => {
        const validProcesses = processes.filter(p => p.burst > 0);
        if (validProcesses.length === 0) {
            alert('Add at least one process with burst time > 0');
            return;
        }

        const algorithm = document.querySelector('input[name="algorithm"]:checked').value;
        let result;
        if (algorithm === 'fcfs') {
            result = simulateFCFS(validProcesses);
            sjfLogBox.style.display = 'none';
        } else {
            result = simulateSJF(validProcesses);
            sjfLogBox.style.display = 'block';
            showSjfLog(result.sjfLog);
        }

        drawGantt(result.segments);
        drawStats(result.results, result.avgWait);
    });

    // ----- INITIAL SIMULATION -----
    window.addEventListener('load', () => {
        document.querySelector('input[value="fcfs"]').checked = true;
        simulateBtn.click();
    });
})();