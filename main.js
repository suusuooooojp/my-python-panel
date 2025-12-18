// --- Service Worker ---
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});

// --- System Monitor (Load Meter) ---
let lastLoop = Date.now();
let fps = 60;
function updateMonitor() {
    const now = Date.now();
    const delta = (now - lastLoop);
    lastLoop = now;
    
    // FPS Calc
    fps = Math.round(1000 / delta);
    // Rough Load Calc based on FPS drop
    let load = Math.max(0, 100 - (fps / 60 * 100)); 
    if(load > 100) load = 100;
    
    document.getElementById('cpu-val').innerText = Math.round(load) + "%";
    document.getElementById('cpu-bar').style.width = load + "%";
    
    // Memory (Chrome only)
    if(performance && performance.memory) {
        const mem = Math.round(performance.memory.usedJSHeapSize / 1024 / 1024);
        document.getElementById('mem-val').innerText = mem + "MB";
    }

    requestAnimationFrame(updateMonitor);
}
requestAnimationFrame(updateMonitor);

// --- Zoom Logic ---
let currentZoom = 1.0;
function changeZoom(delta) {
    currentZoom += delta;
    if(currentZoom < 0.5) currentZoom = 0.5;
    if(currentZoom > 2.0) currentZoom = 2.0;
    document.getElementById('app-wrapper').style.transform = `scale(${currentZoom})`;
    // Fix layout after zoom
    const w = 100 / currentZoom;
    const h = 100 / currentZoom;
    document.getElementById('app-wrapper').style.width = `${w}%`;
    document.getElementById('app-wrapper').style.height = `${h}%`;
    document.getElementById('zoom-val').innerText = Math.round(currentZoom * 100) + "%";
    if(editor) editor.layout();
}

// --- Layout Logic (Right Preview) ---
let isRightPreview = false;
function toggleLayout() {
    isRightPreview = !isRightPreview;
    const rightPane = document.getElementById('right-preview-pane');
    const resizeV = document.getElementById('resizer-v');
    const bottomPrevTab = document.getElementById('tab-prev');
    
    if (isRightPreview) {
        rightPane.classList.add('show');
        resizeV.style.display = 'block';
        bottomPrevTab.style.display = 'none'; // Bottom preview tab hide
        switchPanel('terminal'); // Force terminal on bottom
    } else {
        rightPane.classList.remove('show');
        resizeV.style.display = 'none';
        bottomPrevTab.style.display = 'flex';
    }
    if(editor) editor.layout();
}

// --- Monaco Setup ---
require.config({ paths: { 'vs': 'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.45.0/min/vs' }});
window.MonacoEnvironment = { getWorkerUrl: () => `data:text/javascript;charset=utf-8,${encodeURIComponent(`self.MonacoEnvironment = { baseUrl: 'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.45.0/min/' }; importScripts('https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.45.0/min/vs/base/worker/workerMain.js');`)}` };

let editor;
let files = {};
let currentPath = "";
let expandedFolders = new Set();

// Default with Python-HTML Bridge Demo
const DEFAULT_FILES = {
    'main.py': { 
        content: `import sys\nimport pypanel # Internal Bridge\n\nprint(f"🐍 Python {sys.version.split()[0]}")\n\n# PythonからHTMLを操作！\npypanel.dom_write("output-box", "<h2>Hello from Python!</h2>")\npypanel.dom_append("output-box", "<p>PythonでHTMLを書き換えました。</p>")\n\nprint("HTML Updated.")`, 
        mode: 'python' 
    },
    'index.html': { 
        content: `<!DOCTYPE html>\n<html>\n<head>\n  <link rel="stylesheet" href="css/style.css">\n</head>\n<body>\n  <div class="card">\n    <h1>PyPanel Bridge</h1>\n    <!-- Python will write here -->\n    <div id="output-box">Waiting for Python...</div>\n  </div>\n  <script src="js/main.js"></script>\n</body>\n</html>`, 
        mode: 'html' 
    },
    'css/style.css': { content: `body { background: #eee; font-family: sans-serif; padding: 20px; text-align: center; }\n.card { background: white; padding: 20px; border-radius: 8px; box-shadow: 0 4px 10px rgba(0,0,0,0.1); }`, mode: 'css' },
    'js/main.js': { content: `console.log("JS Ready");`, mode: 'javascript' }
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
        minimap: { enabled: true, scale: 0.75 },
        fontFamily: "'JetBrains Mono', monospace",
        wordWrap: "off",
        scrollBeyondLastLine: false
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

// --- Python Worker & Bridge ---
let pyWorker = null;
function initPyWorker() {
    document.getElementById('py-status-text').innerText = "Loading...";
    document.getElementById('py-status-text').className = "monitor-status busy";
    
    try {
        pyWorker = new Worker('py-worker.js');
        pyWorker.onmessage = (e) => {
            const d = e.data;
            if(d.type === 'stdout') log(d.text);
            else if(d.type === 'ready') {
                log("🐍 Python Ready", '#4caf50');
                document.getElementById('py-status-text').innerText = "Ready";
                document.getElementById('py-status-text').className = "monitor-status active";
            }
            // ★ Bridge Handler ★
            else if(d.type === 'dom_op') {
                handleDomOp(d);
            }
            else if(d.type === 'results') { resetRunBtn(); }
            else if(d.type === 'error') { log("Error: " + d.error, 'red'); resetRunBtn(); }
        };
    } catch(e) { console.error(e); }
}
initPyWorker();

// Pythonから受け取った指示でプレビュー内のDOMを操作
function handleDomOp(data) {
    // 操作対象のプレビューフレームを特定
    const frame = isRightPreview ? document.getElementById('right-preview-frame') : document.getElementById('bottom-preview-frame');
    if (!frame || !frame.contentDocument) return;
    
    const doc = frame.contentDocument;
    const el = doc.getElementById(data.id);
    if (el) {
        if (data.op === 'write') el.innerHTML = data.content;
        if (data.op === 'append') el.innerHTML += data.content;
    } else {
        log(`Bridge Error: Element #${data.id} not found in HTML`, 'orange');
    }
}

// --- Project Runner ---
async function runProject() {
    const btn = document.getElementById('runBtn');
    btn.disabled = true;
    
    // 1. まずHTMLをプレビューにセットする（Pythonが操作できるように）
    let entry = files['index.html'] ? 'index.html' : null;
    let htmlContent = "";
    if (entry) {
        htmlContent = bundleFiles(entry);
    } else {
        htmlContent = "<html><body><h2>No index.html</h2><div id='output'></div></body></html>";
    }
    
    // 両方のフレームにセット（表示されている方で見えるように）
    const targetFrames = [document.getElementById('bottom-preview-frame'), document.getElementById('right-preview-frame')];
    targetFrames.forEach(f => f.srcdoc = htmlContent);

    // 2. Python実行
    if (currentPath.endsWith('.py')) {
        switchPanel('terminal');
        // 少し待ってからPython実行（DOMロード待ち）
        setTimeout(runPython, 500); 
    } else {
        // HTMLの場合、プレビューを表示
        if (!isRightPreview) switchPanel('preview');
        resetRunBtn();
    }
}

function runPython() {
    const d = {};
    for(let f in files) d[f] = files[f].content;
    pyWorker.postMessage({ cmd: 'run', code: files[currentPath].content, files: d });
}

function bundleFiles(htmlPath) {
    let html = files[htmlPath].content;
    html = html.replace(/<link\s+[^>]*href=["']([^"']+)["'][^>]*>/g, (m, h) => files[h] ? `<style>\n${files[h].content}\n</style>` : m);
    html = html.replace(/<script\s+[^>]*src=["']([^"']+)["'][^>]*><\/script>/g, (m, s) => files[s] ? `<script>\n${files[s].content}\n</script>` : m);
    return html;
}

// --- UI Utils ---
function resetRunBtn() { document.getElementById('runBtn').disabled = false; }
const termLog = document.getElementById('term-log');
const shellIn = document.getElementById('shell-input');
shellIn.addEventListener('keydown', e => {
    if(e.key === 'Enter') {
        log(`$ ${shellIn.value}`, '#888');
        shellIn.value = "";
    }
});
function log(msg, color) {
    const d = document.createElement('div');
    d.textContent = msg;
    if(color) d.style.color = color;
    termLog.appendChild(d);
    document.getElementById('output').scrollTop = 99999;
}
function clearOutput() { termLog.innerHTML = ""; }
function resetAll() { if(confirm("Reset?")) { localStorage.removeItem('pypanel_files'); location.reload(); } }

function switchPanel(p) {
    // If Right Preview is ON, 'preview' switch is ignored or focuses right pane?
    // Simply toggle bottom tabs
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

// --- File System ---
function renderTree() {
    const tree = document.getElementById('file-tree');
    tree.innerHTML = "";
    const structure = {};
    Object.keys(files).sort().forEach(path => {
        const parts = path.split('/');
        let current = structure;
        parts.forEach((part, i) => {
            if (!current[part]) current[part] = (i === parts.length - 1) ? { __file: true, path: path } : {};
            current = current[part];
        });
    });
    function buildDom(obj, container, prefix = "") {
        Object.keys(obj).sort((a,b) => {
            const aF = obj[a].__file, bF = obj[b].__file;
            if(aF === bF) return a.localeCompare(b);
            return aF ? 1 : -1;
        }).forEach(key => {
            if(key === '__file' || key === 'path') return;
            const item = obj[key];
            const isFile = item.__file;
            const fullPath = prefix ? `${prefix}/${key}` : key;
            const node = document.createElement('div');
            node.className = 'tree-node';
            const content = document.createElement('div');
            content.className = `tree-content ${isFile && item.path === currentPath ? 'active' : ''}`;
            
            let icon = isFile ? getIcon(key) : (expandedFolders.has(fullPath) ? '📂' : '📁');
            content.innerHTML = `<span style="margin-right:5px;">${icon}</span><span class="tree-name">${key}</span>`;
            content.onclick = (e) => {
                e.stopPropagation();
                if(isFile) openFile(item.path); else toggleFolder(fullPath);
            };
            node.appendChild(content);
            if(!isFile) {
                const children = document.createElement('div');
                children.className = `tree-children ${expandedFolders.has(fullPath) ? 'open' : ''}`;
                buildDom(item, children, fullPath);
                node.appendChild(children);
            }
            container.appendChild(node);
        });
    }
    buildDom(structure, tree);
}
function toggleFolder(p) { if(expandedFolders.has(p)) expandedFolders.delete(p); else expandedFolders.add(p); renderTree(); }
function openFile(p) {
    currentPath = p;
    monaco.editor.setModelLanguage(editor.getModel(), getLang(p));
    editor.setValue(files[p].content);
    renderTree(); updateTabs();
}
function createNewFile() {
    const p = prompt("Name:", ""); if(!p || files[p]) return;
    files[p] = { content: "", mode: getLang(p) };
    saveFiles(); renderTree(); updateFileCount(); openFile(p);
}
function createNewFolder() {
    const p = prompt("Folder:", "folder"); if(!p) return;
    files[`${p}/.keep`] = { content: "", mode: "plaintext" };
    expandedFolders.add(p); saveFiles(); renderTree(); updateFileCount();
}
function getLang(p) { return p.endsWith('.py')?'python':(p.endsWith('.js')?'javascript':(p.endsWith('.html')?'html':(p.endsWith('.css')?'css':'plaintext'))); }
function getIcon(p) { return p.endsWith('.py')?'🐍':(p.endsWith('.js')?'📜':(p.endsWith('.html')?'🌐':(p.endsWith('.css')?'🎨':'📄'))); }
function updateTabs() { document.getElementById('tabs').innerHTML = `<div class="tab active">${currentPath}</div>`; }

// Resizers
const resizerH = document.getElementById('resizer-h');
const bottomPanel = document.getElementById('bottom-panel');
resizerH.addEventListener('mousedown', initDragH);
function initDragH(e) {
    document.addEventListener('mousemove', doDragH);
    document.addEventListener('mouseup', stopDragH);
}
function doDragH(e) {
    const h = window.innerHeight - e.clientY;
    if(h > 50) { bottomPanel.style.height = h + 'px'; editor.layout(); }
}
function stopDragH() { document.removeEventListener('mousemove', doDragH); document.removeEventListener('mouseup', stopDragH); }

const resizerV = document.getElementById('resizer-v');
const rightPane = document.getElementById('right-preview-pane');
resizerV.addEventListener('mousedown', initDragV);
function initDragV(e) {
    document.addEventListener('mousemove', doDragV);
    document.addEventListener('mouseup', stopDragV);
}
function doDragV(e) {
    const w = window.innerWidth - e.clientX;
    if(w > 100) { rightPane.style.width = w + 'px'; editor.layout(); }
}
function stopDragV() { document.removeEventListener('mousemove', doDragV); document.removeEventListener('mouseup', stopDragV); }
