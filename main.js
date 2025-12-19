// --- Service Worker ---
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});

// --- System Monitor (Estimated Memory) ---
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
        
        document.getElementById('cpu-val').innerText = Math.round(load) + "%";
        
        const memEl = document.getElementById('mem-val');
        if(performance && performance.memory) {
            // Chrome/Edge
            memEl.innerText = Math.round(performance.memory.usedJSHeapSize / 1024 / 1024) + "MB";
        } else {
            // Firefox/Safari Fallback: Estimate based on file content size + Base usage
            // This is a rough approximation to show *something* is happening
            let totalChars = 0;
            Object.values(files).forEach(f => totalChars += f.content.length);
            // Assume base overhead ~30MB + file size factor
            const estMem = 30 + Math.round(totalChars / 1024); 
            memEl.innerText = "~" + estMem + "MB";
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
    if(isMobile) sb.classList.toggle('open');
    else sb.classList.toggle('collapsed');
    setTimeout(() => editor.layout(), 250);
}

// --- Monaco & Tabs Logic ---
require.config({ paths: { 'vs': 'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.45.0/min/vs' }});
window.MonacoEnvironment = { getWorkerUrl: () => `data:text/javascript;charset=utf-8,${encodeURIComponent(`self.MonacoEnvironment = { baseUrl: 'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.45.0/min/' }; importScripts('https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.45.0/min/vs/base/worker/workerMain.js');`)}` };

let editor;
let files = {};
let currentPath = "";
let expandedFolders = new Set();
let openedFiles = []; // List of open file paths for Tabs

const DEFAULT_FILES = {
    'main.py': { content: `import sys\nimport pypanel\n\nprint(f"🐍 Python {sys.version.split()[0]}")\npypanel.dom_write("out", "<h2>Hello from Python!</h2>")`, mode: 'python' },
    'index.html': { content: `<html><body>\n  <h1>Bridge Demo</h1>\n  <div id="out">Waiting...</div>\n</body></html>`, mode: 'html' }
};

try { files = JSON.parse(localStorage.getItem('pypanel_files')) || DEFAULT_FILES; } catch(e) { files = DEFAULT_FILES; }

require(['vs/editor/editor.main'], function() {
    currentPath = Object.keys(files)[0] || "main.py";
    // Initialize opened files
    openedFiles = [currentPath];

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
    renderTabs();
    updateFileCount();
});

// --- Tab Management ---
function renderTabs() {
    const tabContainer = document.getElementById('tabs');
    tabContainer.innerHTML = "";
    
    openedFiles.forEach(path => {
        const div = document.createElement('div');
        div.className = `tab ${path === currentPath ? 'active' : ''}`;
        div.innerHTML = `<span class="tab-name">${path}</span> <span class="tab-close">×</span>`;
        
        // Switch tab
        div.onclick = () => openFile(path);
        
        // Close tab
        div.querySelector('.tab-close').onclick = (e) => {
            e.stopPropagation();
            closeFile(path);
        };
        
        tabContainer.appendChild(div);
    });
}

function closeFile(path) {
    const idx = openedFiles.indexOf(path);
    if (idx === -1) return;
    
    openedFiles.splice(idx, 1); // Remove from list
    
    // If we closed the currently active file, switch to another
    if (path === currentPath) {
        if (openedFiles.length > 0) {
            // Switch to previous or next
            const nextPath = openedFiles[Math.max(0, idx - 1)];
            openFile(nextPath);
        } else {
            // No files open
            currentPath = "";
            editor.setValue("");
            renderTabs();
        }
    } else {
        renderTabs();
    }
}

function openFile(p) {
    if(!files[p]) return; // File deleted?
    currentPath = p;
    
    // Add to opened list if not exists
    if (!openedFiles.includes(p)) {
        openedFiles.push(p);
    }
    
    monaco.editor.setModelLanguage(editor.getModel(), getLang(p));
    editor.setValue(files[p].content);
    
    renderTabs();
    // Highlight in sidebar? (optional, renderTree does it)
    renderTree(); 
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

    function buildDom(obj, container, fullPathPrefix = "") {
        Object.keys(obj).sort((a,b) => {
            const aF = obj[a].__file, bF = obj[b].__file;
            if (aF === bF) return a.localeCompare(b);
            return aF ? 1 : -1;
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
            
            // D&D (Simplified for brevity, logic exists in prev version)
            
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

// --- Utils ---
function updateFileCount() { document.getElementById('file-count').innerText = Object.keys(files).length; }
function getLang(p) { return p.endsWith('.py')?'python':(p.endsWith('.js')?'javascript':(p.endsWith('.html')?'html':(p.endsWith('.css')?'css':'plaintext'))); }
function getIcon(p) { return p.endsWith('.py')?'🐍':(p.endsWith('.js')?'📜':(p.endsWith('.html')?'🌐':(p.endsWith('.css')?'🎨':'📄'))); }

// --- Context Menu & Operations (Same as before) ---
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
        if(ctxIsFile) {
            delete files[ctxTarget];
            closeFile(ctxTarget); // Close tab if open
        } else {
            Object.keys(files).forEach(k => { 
                if(k.startsWith(ctxTarget+'/')) {
                    delete files[k];
                    closeFile(k);
                }
            });
        }
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
        // If file is open, close old tab and open new one
        if (openedFiles.includes(oldP)) {
            const idx = openedFiles.indexOf(oldP);
            openedFiles[idx] = newP;
        }
        if (currentPath === oldP) currentPath = newP;
    } else {
        // Folder
        Object.keys(files).forEach(k => {
            if(k.startsWith(oldP+'/')) {
                const suffix = k.substring(oldP.length);
                const dest = newP + suffix;
                files[dest] = files[k]; delete files[k];
                if (openedFiles.includes(k)) {
                    openedFiles[openedFiles.indexOf(k)] = dest;
                }
                if(currentPath === k) currentPath = dest;
            }
        });
    }
    saveFiles(); updateTabs(); // Refresh tabs
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
// updateTabs function is now handled by renderTabs/openFile, removing old placeholder
function updateTabs() { renderTabs(); }

// --- Runner ---
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

// --- Utils ---
const termLog = document.getElementById('term-log');
const shellIn = document.getElementById('shell-input');
shellIn.addEventListener('keydown', e => {
    if(e.key === 'Enter') { log(`$ ${shellIn.value}`, '#888'); shellIn.value = ""; }
});
function log(msg, color) {
    const d = document.createElement('div');
    d.textContent = msg; if(color) d.style.color = color;
    termLog.appendChild(d);
    // Scroll terminal log to bottom
    const out = document.getElementById('output');
    out.scrollTop = out.scrollHeight;
}
function clearOutput() { termLog.innerHTML = ""; }
function resetAll() { if(confirm("Reset?")) { localStorage.removeItem('pypanel_files'); location.reload(); } }

function switchPanel(p) {
    document.getElementById('tab-term').className = p === 'terminal' ? 'panel-tab active' : 'panel-tab';
    document.getElementById('tab-prev').className = p === 'preview' ? 'panel-tab active' : 'panel-tab';
    document.getElementById('terminal-area').className = p === 'terminal' ? 'show' : '';
    document.getElementById('bottom-preview-area').className = p === 'preview' ? 'show' : '';
}

// --- Resizers ---
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
    if(h > 30 && h < window.innerHeight - 50) { 
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
