// --- Service Worker ---
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});

// --- System Monitor (2sec Interval) ---
let lastMonitorUpdate = 0;
let lastLoop = Date.now();
function updateMonitor() {
    const now = Date.now();
    const delta = (now - lastLoop);
    lastLoop = now;
    
    if (now - lastMonitorUpdate > 2000) {
        lastMonitorUpdate = now;
        const fps = Math.round(1000 / (delta || 1));
        let load = Math.max(0, 100 - (fps / 60 * 100)); 
        if(load > 100) load = 100;
        
        const cpuEl = document.getElementById('cpu-val');
        if(cpuEl) cpuEl.innerText = Math.round(load) + "%";
        
        const memEl = document.getElementById('mem-val');
        if(memEl) {
            if(performance && performance.memory) {
                memEl.innerText = Math.round(performance.memory.usedJSHeapSize / 1024 / 1024) + "MB";
            } else {
                memEl.innerText = "N/A";
            }
        }
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
    const wrap = document.getElementById('app-wrapper');
    wrap.style.transform = `scale(${currentZoom})`;
    wrap.style.width = `${100/currentZoom}%`;
    wrap.style.height = `${100/currentZoom}%`;
    if(editor) editor.layout();
}

// --- Layout Logic ---
let isRightPreview = false;
function toggleLayout() {
    isRightPreview = !isRightPreview;
    const rightPane = document.getElementById('right-preview-pane');
    const resizeV = document.getElementById('resizer-v');
    const bottomPrevTab = document.getElementById('tab-prev');
    
    if (isRightPreview) {
        rightPane.classList.add('show');
        resizeV.style.display = 'flex';
        bottomPrevTab.style.display = 'none';
        switchPanel('terminal'); 
    } else {
        rightPane.classList.remove('show');
        resizeV.style.display = 'none';
        bottomPrevTab.style.display = 'flex';
    }
    if(editor) setTimeout(() => editor.layout(), 100);
}

function toggleSidebar() {
    const sb = document.getElementById('sidebar');
    const isMobile = window.innerWidth <= 768;
    if(isMobile) {
        sb.classList.toggle('open');
    } else {
        sb.classList.toggle('collapsed');
    }
    setTimeout(() => editor.layout(), 250);
}

// --- Monaco Setup ---
require.config({ paths: { 'vs': 'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.45.0/min/vs' }});
window.MonacoEnvironment = { getWorkerUrl: () => `data:text/javascript;charset=utf-8,${encodeURIComponent(`self.MonacoEnvironment = { baseUrl: 'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.45.0/min/' }; importScripts('https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.45.0/min/vs/base/worker/workerMain.js');`)}` };

let editor;
let files = {};
let currentPath = "";
let expandedFolders = new Set();
let dragSrc = null;

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
    
    Object.keys(files).forEach(p => {
        const parts = p.split('/');
        if(parts.length > 1) expandedFolders.add(parts[0]);
    });

    renderTree();
    updateTabs();
    updateFileCount();
});

function updateFileCount() {
    document.getElementById('file-count').innerText = Object.keys(files).length;
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
            if (!current[part]) {
                current[part] = (i === parts.length - 1) ? { __file: true, path: path } : {};
            }
            current = current[part];
        });
    });

    function buildDom(obj, container, fullPathPrefix = "") {
        Object.keys(obj).sort((a,b) => {
            const aIsFile = obj[a].__file, bIsFile = obj[b].__file;
            if (aIsFile === bIsFile) return a.localeCompare(b);
            return aIsFile ? 1 : -1;
        }).forEach(key => {
            if (key === '__file' || key === 'path') return;
            const item = obj[key];
            const isFile = item.__file;
            const fullPath = fullPathPrefix ? `${fullPathPrefix}/${key}` : key;
            
            const node = document.createElement('div');
            node.className = 'tree-node';
            
            const content = document.createElement('div');
            content.className = `tree-content ${isFile && item.path === currentPath ? 'active' : ''}`;
            content.draggable = true;
            
            let iconHtml = '';
            if (isFile) {
                iconHtml = `<span class="file-spacer" style="width:15px;display:inline-block"></span>${getIcon(key)}`;
            } else {
                const isOpen = expandedFolders.has(fullPath);
                iconHtml = `<span class="arrow ${isOpen ? 'down' : ''}">▶</span>📁`;
            }
            
            const menuBtn = document.createElement('span');
            menuBtn.className = 'tree-menu-btn';
            menuBtn.innerHTML = '⋮';
            menuBtn.onclick = (e) => { e.stopPropagation(); showCtx(e, fullPath, isFile); };

            content.innerHTML = `${iconHtml}<span class="tree-name">${key}</span>`;
            content.appendChild(menuBtn);
            
            content.onclick = (e) => {
                e.stopPropagation();
                if(isFile) openFile(item.path); else toggleFolder(fullPath);
            };
            content.oncontextmenu = (e) => showCtx(e, fullPath, isFile);
            
            content.ondragstart = (e) => { dragSrc = fullPath; e.dataTransfer.effectAllowed = 'move'; };
            content.ondragover = (e) => { e.preventDefault(); if(!isFile) content.classList.add('drag-over'); };
            content.ondragleave = (e) => { content.classList.remove('drag-over'); };
            content.ondrop = (e) => {
                e.preventDefault(); content.classList.remove('drag-over');
                if(!dragSrc || dragSrc === fullPath) return;
                moveEntry(dragSrc, fullPath + "/" + dragSrc.split('/').pop());
                renderTree();
            };

            node.appendChild(content);

            if (!isFile) {
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

const ctxMenu = document.getElementById('context-menu');
let ctxTarget = null, ctxIsFile = true;
function showCtx(e, p, f) {
    e.preventDefault(); ctxTarget = p; ctxIsFile = f;
    let x = e.pageX, y = e.pageY;
    ctxMenu.style.display = 'block';
    const r = ctxMenu.getBoundingClientRect();
    if(x+r.width > window.innerWidth) x = window.innerWidth - r.width - 10;
    if(y+r.height > window.innerHeight) y = window.innerHeight - r.height - 10;
    ctxMenu.style.left = x+'px'; ctxMenu.style.top = y+'px';
}
document.addEventListener('click', () => ctxMenu.style.display = 'none');
if(editor) editor.onMouseDown(() => ctxMenu.style.display = 'none');

function ctxDelete() {
    if(confirm("Delete?")) {
        if(ctxIsFile) delete files[ctxTarget];
        else Object.keys(files).forEach(k => { if(k.startsWith(ctxTarget+'/')) delete files[k]; });
        if(!files[currentPath]) currentPath = Object.keys(files)[0] || "";
        if(currentPath) openFile(currentPath); else editor.setValue("");
        saveFiles(); renderTree();
    }
}
function ctxRename() {
    const n = prompt("New name:", ctxTarget.split('/').pop());
    if(!n) return;
    const dir = ctxTarget.substring(0, ctxTarget.lastIndexOf('/'));
    const np = dir ? `${dir}/${n}` : n;
    if(np === ctxTarget || files[np]) return;
    moveEntry(ctxTarget, np);
    renderTree();
}
function ctxMove() {
    const dest = prompt("Move to folder (empty for root):", "");
    if(dest === null) return;
    const d = dest.trim();
    const fn = ctxTarget.split('/').pop();
    const np = d ? `${d}/${fn}` : fn;
    moveEntry(ctxTarget, np);
    renderTree();
}
function moveEntry(oldP, newP) {
    if(files[oldP]) {
        files[newP] = files[oldP]; delete files[oldP];
        if(currentPath === oldP) { currentPath = newP; updateTabs(); }
    } else {
        Object.keys(files).forEach(k => {
            if(k.startsWith(oldP+'/')) {
                const suffix = k.substring(oldP.length);
                files[newP+suffix] = files[k]; delete files[k];
                if(currentPath === k) { currentPath = newP+suffix; updateTabs(); }
            }
        });
    }
    saveFiles();
}
function ctxRun() { if(ctxIsFile) { openFile(ctxTarget); runProject(); } }

function createNewFile() {
    const p = prompt("Filename:", ""); if(!p || files[p]) return;
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

let pyWorker = null;
function initPyWorker() {
    const status = document.getElementById('py-status-text');
    status.innerText = "Loading...";
    try {
        pyWorker = new Worker('py-worker.js');
        pyWorker.onmessage = (e) => {
            const d = e.data;
            if(d.type === 'stdout') log(d.text);
            else if(d.type === 'ready') { status.innerText = "Ready"; }
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

async function runProject() {
    const btn = document.getElementById('runBtn');
    btn.disabled = true;
    
    let entry = files['index.html'] ? 'index.html' : null;
    let htmlContent = entry ? bundleFiles(entry) : "<html><body><h2>No index.html</h2><div id='out'></div></body></html>";
    
    const frames = [document.getElementById('bottom-preview-frame'), document.getElementById('right-preview-frame')];
    frames.forEach(f => f.srcdoc = htmlContent);

    if (currentPath.endsWith('.py')) {
        switchPanel('terminal');
        setTimeout(() => {
            const d = {};
            for(let f in files) d[f] = files[f].content;
            pyWorker.postMessage({ cmd: 'run', code: files[currentPath].content, files: d });
        }, 500);
    } else {
        if (!isRightPreview) switchPanel('preview');
        btn.disabled = false;
    }
}

function bundleFiles(htmlPath) {
    let html = files[htmlPath].content;
    html = html.replace(/<link\s+href=["']([^"']+)["'][^>]*>/g, (m, h) => files[h] ? `<style>${files[h].content}</style>` : m);
    html = html.replace(/<script\s+src=["']([^"']+)["'][^>]*><\/script>/g, (m, s) => files[s] ? `<script>${files[s].content}</script>` : m);
    return html;
}

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
function resetAll() { if(confirm("Reset?")) { localStorage.removeItem('pypanel_files'); location.reload(); } }

function switchPanel(p) {
    document.getElementById('tab-term').className = p === 'terminal' ? 'panel-tab active' : 'panel-tab';
    document.getElementById('tab-prev').className = p === 'preview' ? 'panel-tab active' : 'panel-tab';
    document.getElementById('terminal-area').className = p === 'terminal' ? 'show' : '';
    document.getElementById('bottom-preview-area').className = p === 'preview' ? 'show' : '';
}

// --- Resizers (Clamped) ---
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
    const h = window.innerHeight - clientY - 24; 
    // Fix: Allow minimal height (30px) but prevent 0px (gray void)
    if(h >= 30 && h < window.innerHeight - 50) { 
        bPanel.style.height = h + 'px'; 
        if(editor) editor.layout(); 
    }
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
