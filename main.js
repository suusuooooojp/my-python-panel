// --- Service Worker ---
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});

// --- System Monitor (Status Bar) ---
let lastLoop = Date.now();
function updateMonitor() {
    const now = Date.now();
    const delta = (now - lastLoop);
    lastLoop = now;
    
    // CPU Load Estimate (FPS based)
    const fps = Math.round(1000 / (delta || 1));
    let load = Math.max(0, 100 - (fps / 60 * 100)); 
    if(load > 100) load = 100;
    
    const cpuEl = document.getElementById('cpu-val');
    if(cpuEl) cpuEl.innerText = Math.round(load) + "%";
    
    // Memory (Safe Check)
    const memEl = document.getElementById('mem-val');
    if(memEl) {
        if(performance && performance.memory) {
            memEl.innerText = Math.round(performance.memory.usedJSHeapSize / 1024 / 1024) + "MB";
        } else {
            memEl.innerText = "N/A";
        }
    }

    requestAnimationFrame(updateMonitor);
}
requestAnimationFrame(updateMonitor);

// --- Monaco Setup ---
require.config({ paths: { 'vs': 'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.45.0/min/vs' }});
window.MonacoEnvironment = { getWorkerUrl: () => `data:text/javascript;charset=utf-8,${encodeURIComponent(`self.MonacoEnvironment = { baseUrl: 'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.45.0/min/' }; importScripts('https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.45.0/min/vs/base/worker/workerMain.js');`)}` };

let editor;
let files = {};
let currentPath = "";
let expandedFolders = new Set();

const DEFAULT_FILES = {
    'main.py': { content: `import sys\nimport pypanel\n\nprint(f"🐍 Python {sys.version.split()[0]}")\npypanel.dom_write("out", "<h2>Hello from Python!</h2>")`, mode: 'python' },
    'index.html': { content: `<html><body>\n  <h1>Bridge Demo</h1>\n  <div id="out">Waiting...</div>\n</body></html>`, mode: 'html' }
};

try { files = JSON.parse(localStorage.getItem('pypanel_files')) || DEFAULT_FILES; } catch(e) { files = DEFAULT_FILES; }

require(['vs/editor/editor.main'], function() {
    currentPath = Object.keys(files)[0] || "main.py";
    editor = monaco.editor.create(document.getElementById('editor-container'), {
        value: files[currentPath] ? files[currentPath].content : "",
        language: getLang(currentPath),
        theme: 'vs-dark',
        fontSize: 14,
        automaticLayout: true,
        minimap: { enabled: true },
        padding: { top: 10 }
    });

    document.getElementById('loading-screen').style.display = 'none';

    editor.onDidChangeModelContent(() => {
        if(files[currentPath]) {
            files[currentPath].content = editor.getValue();
            localStorage.setItem('pypanel_files', JSON.stringify(files));
        }
    });

    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, runProject);
    renderTree();
    updateTabs();
    updateFileCount();
});

function updateFileCount() {
    document.getElementById('file-count').innerText = Object.keys(files).length;
}

// --- Python Worker ---
let pyWorker = null;
function initPyWorker() {
    const status = document.getElementById('py-status-text');
    status.innerText = "Loading...";
    
    try {
        pyWorker = new Worker('py-worker.js');
        pyWorker.onmessage = (e) => {
            const d = e.data;
            if(d.type === 'stdout') log(d.text);
            else if(d.type === 'ready') { status.innerText = "Ready"; log("Python Ready", '#4caf50'); }
            else if(d.type === 'dom_op') handleDomOp(d);
            else if(d.type === 'results') document.getElementById('runBtn').disabled = false;
            else if(d.type === 'error') { log(d.error, 'red'); document.getElementById('runBtn').disabled = false; }
        };
    } catch(e) { console.error(e); }
}
initPyWorker();

function handleDomOp(data) {
    const frame = isRightPreview ? document.getElementById('right-preview-frame') : document.getElementById('bottom-preview-frame');
    if (!frame || !frame.contentDocument) return;
    const el = frame.contentDocument.getElementById(data.id);
    if (el) {
        if (data.op === 'write') el.innerHTML = data.content;
        if (data.op === 'append') el.innerHTML += data.content;
    }
}

// --- Runner ---
async function runProject() {
    const btn = document.getElementById('runBtn');
    btn.disabled = true;
    
    let entry = files['index.html'] ? 'index.html' : null;
    let htmlContent = entry ? bundleFiles(entry) : "<html><body><h2>No index.html</h2><div id='out'></div></body></html>";
    
    const frames = [document.getElementById('bottom-preview-frame'), document.getElementById('right-preview-frame')];
    frames.forEach(f => f.srcdoc = htmlContent);

    if (currentPath.endsWith('.py')) {
        switchPanel('terminal');
        setTimeout(runPython, 500);
    } else {
        if (!isRightPreview) switchPanel('preview');
        btn.disabled = false;
    }
}

function runPython() {
    const d = {};
    for(let f in files) d[f] = files[f].content;
    pyWorker.postMessage({ cmd: 'run', code: files[currentPath].content, files: d });
}

function bundleFiles(htmlPath) {
    let html = files[htmlPath].content;
    // Simple Bundler
    html = html.replace(/<link\s+href=["']([^"']+)["'][^>]*>/g, (m, h) => files[h] ? `<style>${files[h].content}</style>` : m);
    html = html.replace(/<script\s+src=["']([^"']+)["'][^>]*><\/script>/g, (m, s) => files[s] ? `<script>${files[s].content}</script>` : m);
    return html;
}

// --- Layout Logic ---
let isRightPreview = false;
function toggleLayout() {
    isRightPreview = !isRightPreview;
    const right = document.getElementById('right-preview-pane');
    const rV = document.getElementById('resizer-v');
    
    if (isRightPreview) {
        right.classList.add('show');
        rV.style.display = 'flex';
        switchPanel('terminal'); // Ensure bottom is terminal
    } else {
        right.classList.remove('show');
        rV.style.display = 'none';
    }
    if(editor) editor.layout();
}

// --- Zoom ---
let zoom = 1.0;
function changeZoom(d) {
    zoom += d;
    if(zoom < 0.5) zoom = 0.5;
    if(zoom > 2) zoom = 2;
    const wrap = document.getElementById('app-wrapper');
    wrap.style.transform = `scale(${zoom})`;
    wrap.style.width = `${100/zoom}%`;
    wrap.style.height = `${100/zoom}%`;
    if(editor) editor.layout();
}

// --- UI Utils ---
const termLog = document.getElementById('term-log');
const shellIn = document.getElementById('shell-input');
shellIn.addEventListener('keydown', e => {
    if(e.key === 'Enter') { log(`$ ${shellIn.value}`, '#888'); shellIn.value = ""; }
});
function log(msg, color) {
    const d = document.createElement('div');
    d.textContent = msg; if(color) d.style.color = color;
    termLog.appendChild(d);
    document.getElementById('output').scrollTop = 99999;
}
function clearOutput() { termLog.innerHTML = ""; }
function switchPanel(p) {
    document.getElementById('tab-term').className = p === 'terminal' ? 'panel-tab active' : 'panel-tab';
    document.getElementById('tab-prev').className = p === 'preview' ? 'panel-tab active' : 'panel-tab';
    document.getElementById('terminal-area').className = p === 'terminal' ? 'show' : '';
    document.getElementById('bottom-preview-area').className = p === 'preview' ? 'show' : '';
}
function toggleSidebar() {
    const sb = document.getElementById('sidebar');
    sb.style.transform = sb.style.transform === 'translateX(-100%)' ? 'translateX(0)' : 'translateX(-100%)';
    setTimeout(() => editor.layout(), 250);
}

// --- Resizers (Fixed) ---
const rH = document.getElementById('resizer-h');
const bPanel = document.getElementById('bottom-panel');
rH.addEventListener('mousedown', initDragH);
rH.addEventListener('touchstart', initDragH, {passive:false});

function initDragH(e) {
    e.preventDefault();
    document.addEventListener('mousemove', doDragH);
    document.addEventListener('touchmove', doDragH, {passive:false});
    document.addEventListener('mouseup', stopDragH);
    document.addEventListener('touchend', stopDragH);
}
function doDragH(e) {
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    const h = window.innerHeight - clientY - 24; // 24 is status bar height
    if(h > 30) { bPanel.style.height = h + 'px'; editor.layout(); }
}
function stopDragH() {
    document.removeEventListener('mousemove', doDragH);
    document.removeEventListener('touchmove', doDragH);
    document.removeEventListener('mouseup', stopDragH);
    document.removeEventListener('touchend', stopDragH);
}

const rV = document.getElementById('resizer-v');
const rPane = document.getElementById('right-preview-pane');
rV.addEventListener('mousedown', initDragV);
function initDragV(e) {
    document.addEventListener('mousemove', doDragV);
    document.addEventListener('mouseup', stopDragV);
}
function doDragV(e) {
    const w = window.innerWidth - e.clientX;
    if(w > 50) { rPane.style.width = w + 'px'; editor.layout(); }
}
function stopDragV() { document.removeEventListener('mousemove', doDragV); document.removeEventListener('mouseup', stopDragV); }

// --- File System ---
function renderTree() {
    const tree = document.getElementById('file-tree');
    tree.innerHTML = "";
    // Simplified flat list for robustness, or recursive if needed
    // Using flat list with indentation visual
    Object.keys(files).sort().forEach(path => {
        const div = document.createElement('div');
        div.className = "tree-content " + (path === currentPath ? "active" : "");
        div.innerHTML = `<span class="tree-name">${path}</span>`;
        div.onclick = () => { currentPath = path; editor.setValue(files[path].content); renderTree(); updateTabs(); };
        tree.appendChild(div);
    });
}
function getLang(p) { return p.endsWith('.py')?'python':(p.endsWith('.js')?'javascript':(p.endsWith('.html')?'html':'plaintext')); }
function createNewFile() {
    const p = prompt("Name:"); if(!p || files[p]) return;
    files[p] = { content: "", mode: getLang(p) };
    localStorage.setItem('pypanel_files', JSON.stringify(files));
    renderTree(); updateFileCount();
}
function createNewFolder() { alert("Use 'folder/file.ext' to create folders."); }
