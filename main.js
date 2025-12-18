// --- Service Worker & Update Logic ---
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').then(reg => {
        // 初回は更新とみなさない
        if (!navigator.serviceWorker.controller) return;

        reg.onupdatefound = () => {
            const installingWorker = reg.installing;
            installingWorker.onstatechange = () => {
                if (installingWorker.state === 'installed') {
                    if (navigator.serviceWorker.controller) {
                        // 本当に更新があった場合のみ表示
                        document.getElementById('update-bar').style.display = 'block';
                    }
                }
            };
        };
    }).catch(console.error);
}

function updateProgress(percent, text) {
    const bar = document.getElementById('progress-bar');
    const txt = document.getElementById('loading-text');
    if (bar) bar.style.width = percent + '%';
    if (txt) txt.innerText = text;
}

// --- Monaco Setup ---
updateProgress(20, "Loading Editor...");
require.config({ 
    paths: { 'vs': 'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.45.0/min/vs' },
    waitSeconds: 30
});

window.MonacoEnvironment = {
    getWorkerUrl: () => `data:text/javascript;charset=utf-8,${encodeURIComponent(`
        self.MonacoEnvironment = { baseUrl: 'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.45.0/min/' };
        importScripts('https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.45.0/min/vs/base/worker/workerMain.js');`
    )}`
};

let editor;
let files = {};
let currentPath = "";
let expandedFolders = new Set();
let zenkakuDecorations = [];
let dragSrc = null;

const DEFAULT_FILES = {
    'main.py': { content: `import sys\nimport random\n\nprint(f"Python {sys.version.split()[0]} Running")\nprint(f"Random: {random.randint(1, 100)}")`, mode: 'python' },
    'index.html': { content: `<!DOCTYPE html>\n<html>\n<head>\n  <link rel="stylesheet" href="css/style.css">\n</head>\n<body>\n  <h1>Execution Ready</h1>\n  <p>HTML+CSS+JS linked automatically.</p>\n  <script src="js/main.js"></script>\n</body>\n</html>`, mode: 'html' },
    'css/style.css': { content: `body { background: #222; color: #fff; text-align: center; padding: 50px; font-family: sans-serif; }`, mode: 'css' },
    'js/main.js': { content: `console.log("JS Executed");`, mode: 'javascript' }
};

try { files = JSON.parse(localStorage.getItem('pypanel_files')) || DEFAULT_FILES; } 
catch(e) { files = DEFAULT_FILES; }

// --- Editor Init ---
updateProgress(50, "Initializing...");

require(['vs/editor/editor.main'], function() {
    registerPythonCompletion();

    currentPath = Object.keys(files)[0] || "main.py";
    editor = monaco.editor.create(document.getElementById('editor-container'), {
        value: files[currentPath] ? files[currentPath].content : "",
        language: getLang(currentPath),
        theme: 'vs-dark',
        fontSize: 14,
        automaticLayout: true,
        minimap: { enabled: true, scale: 0.75 },
        fontFamily: "'JetBrains Mono', monospace",
        padding: { top: 10 },
        wordWrap: "off",
        scrollBeyondLastLine: false,
        scrollbar: { useShadows: false, verticalHasArrows: false, horizontal: "visible" },
        autoClosingBrackets: "always"
    });

    updateProgress(100, "Done!");
    setTimeout(() => {
        document.getElementById('loading-screen').style.opacity = '0';
        setTimeout(() => document.getElementById('loading-screen').style.display = 'none', 500);
    }, 500);

    editor.onDidChangeModelContent(() => {
        if(files[currentPath]) {
            files[currentPath].content = editor.getValue();
            saveFiles();
        }
        updateZenkaku();
    });

    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => {
        showToast("Executing...");
        runProject();
    });
    
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
        saveFiles();
        showToast("Saved!");
    });

    Object.keys(files).forEach(p => {
        const parts = p.split('/');
        if(parts.length > 1) expandedFolders.add(parts[0]);
    });
    
    renderTree();
    updateTabs();
    updateZenkaku();
    
}, function(err) {
    console.error(err);
    alert("Offline mode: Editor loaded from cache.");
    document.getElementById('loading-screen').style.display = 'none';
});

// --- Python Worker ---
let pyWorker = null;
function initPyWorker() {
    try {
        pyWorker = new Worker('py-worker.js');
        pyWorker.onmessage = (e) => {
            const d = e.data;
            if(d.type === 'stdout') log(d.text);
            else if(d.type === 'results') { log("<= " + d.results, '#4ec9b0'); resetRunBtn(); }
            else if(d.type === 'error') { log("Error: " + d.error, 'red'); resetRunBtn(); }
            else if(d.type === 'ready') log("🐍 Python Engine Ready", '#4caf50');
        };
        pyWorker.onerror = (e) => {
            log("Python Worker Failed: " + e.message, 'red');
            resetRunBtn();
        };
    } catch(e) { console.error(e); }
}
initPyWorker();

function registerPythonCompletion() {
    monaco.languages.registerCompletionItemProvider('python', {
        provideCompletionItems: function(model, position) {
            const suggestions = [...['import', 'from', 'def', 'class', 'return', 'if', 'print'].map(k => ({
                label: k, kind: monaco.languages.CompletionItemKind.Keyword, insertText: k
            }))];
            return { suggestions: suggestions };
        }
    });
}

function saveFiles() { localStorage.setItem('pypanel_files', JSON.stringify(files)); }
function showToast(msg) {
    const t = document.getElementById('toast');
    t.innerText = msg;
    t.classList.add('show');
    setTimeout(() => t.classList.remove('show'), 2000);
}

function updateZenkaku() {
    if(!editor) return;
    const model = editor.getModel();
    const matches = model.findMatches('　', false, false, false, null, true);
    const newDecorations = matches.map(match => ({
        range: match.range,
        options: { isWholeLine: false, className: 'zenkaku-bg', inlineClassName: 'zenkaku-bg' }
    }));
    zenkakuDecorations = model.deltaDecorations(zenkakuDecorations, newDecorations);
}
const style = document.createElement('style');
style.innerHTML = `.zenkaku-bg { background: rgba(255, 165, 0, 0.3); border: 1px solid orange; }`;
document.head.appendChild(style);

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
            content.draggable = true;
            
            let icon = isFile ? getIcon(key) : (expandedFolders.has(fullPath) ? '📂' : '📁');
            const menuBtn = document.createElement('span');
            menuBtn.className = 'tree-menu-btn';
            menuBtn.innerHTML = '⋮';
            menuBtn.onclick = (e) => { e.stopPropagation(); showCtx(e, fullPath, isFile); };

            content.innerHTML = `<span style="margin-right:5px;width:15px;display:inline-block;text-align:center;">${icon}</span><span class="tree-name">${key}</span>`;
            content.appendChild(menuBtn);
            
            content.onclick = (e) => {
                e.stopPropagation();
                if(isFile) openFile(item.path);
                else toggleFolder(fullPath);
            };
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

function toggleFolder(p) {
    if(expandedFolders.has(p)) expandedFolders.delete(p); else expandedFolders.add(p);
    renderTree();
}
function openFile(p) {
    currentPath = p;
    monaco.editor.setModelLanguage(editor.getModel(), getLang(p));
    editor.setValue(files[p].content);
    renderTree();
    updateTabs();
    updateZenkaku();
}

// Menu
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
    const p = prompt("Filename:", "");
    if(!p || files[p]) return;
    files[p] = { content: "", mode: getLang(p) };
    saveFiles(); renderTree(); openFile(p);
}
function createNewFolder() {
    const p = prompt("Folder:", "folder");
    if(!p) return;
    files[`${p}/.keep`] = { content: "", mode: "plaintext" };
    expandedFolders.add(p);
    saveFiles(); renderTree();
}

function getLang(p) {
    if(p.endsWith('.py')) return 'python';
    if(p.endsWith('.js')) return 'javascript';
    if(p.endsWith('.html')) return 'html';
    if(p.endsWith('.css')) return 'css';
    return 'plaintext';
}
function getIcon(p) {
    if(p.endsWith('.py')) return '🐍';
    if(p.endsWith('.js')) return '📜';
    if(p.endsWith('.html')) return '🌐';
    if(p.endsWith('.css')) return '🎨';
    return '📄';
}
function updateTabs() { document.getElementById('tabs').innerHTML = `<div class="tab active">${currentPath}</div>`; }

async function runProject() {
    const btn = document.getElementById('runBtn');
    btn.disabled = true;
    showToast("Running...");
    
    // Python
    if(currentPath.endsWith('.py')) {
        switchPanel('terminal');
        runPython();
        return;
    }
    
    // Web
    let entry = files['index.html'] ? 'index.html' : (currentPath.endsWith('.html') ? currentPath : null);
    if(entry) {
        switchPanel('preview');
        // Force refresh iframe
        const frame = document.getElementById('preview-frame');
        frame.srcdoc = bundleFiles(entry);
        resetRunBtn();
        return;
    }
    
    log("Cannot run this file.", 'orange');
    resetRunBtn();
}
function resetRunBtn() { document.getElementById('runBtn').disabled = false; }

function bundleFiles(htmlPath) {
    let html = files[htmlPath].content;
    
    // CSS Inject: <link href="style.css"> -> matches exact or simple relative path
    html = html.replace(/<link\s+[^>]*href=["']([^"']+)["'][^>]*>/gi, (m, href) => {
        // Try finding file. If not exact match, search by filename
        let target = files[href] ? href : Object.keys(files).find(k => k.endsWith('/' + href));
        if (target && files[target]) {
            return `<style>/* ${target} */\n${files[target].content}\n</style>`;
        }
        return m;
    });
    
    // JS Inject: <script src="app.js">
    html = html.replace(/<script\s+[^>]*src=["']([^"']+)["'][^>]*><\/script>/gi, (m, src) => {
        let target = files[src] ? src : Object.keys(files).find(k => k.endsWith('/' + src));
        if (target && files[target]) {
            return `<script>/* ${target} */\n${files[target].content}\n</script>`;
        }
        return m;
    });
    
    return html;
}

function runPython() {
    const d = {};
    for(let f in files) d[f] = files[f].content;
    // Timeout check if worker is dead
    if(!pyWorker) {
        log("Worker died. Restarting...", 'red');
        initPyWorker();
    }
    pyWorker.postMessage({ cmd: 'run', code: files[currentPath].content, files: d });
}

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
function resetAll() { if(confirm("Reset data?")) { localStorage.removeItem('pypanel_files'); location.reload(); } }
function switchPanel(p) {
    document.getElementById('tab-term').className = p === 'terminal' ? 'panel-tab active' : 'panel-tab';
    document.getElementById('tab-prev').className = p === 'preview' ? 'panel-tab active' : 'panel-tab';
    document.getElementById('terminal-area').className = p === 'terminal' ? 'show' : '';
    document.getElementById('preview-area').className = p === 'preview' ? 'show' : '';
}
function openPopup() {
    document.getElementById('popup-overlay').style.display = 'flex';
    if(files['index.html']) document.getElementById('popup-content').srcdoc = bundleFiles('index.html');
}
function closePopup() { document.getElementById('popup-overlay').style.display = 'none'; }
function toggleSidebar() {
    const sb = document.getElementById('sidebar');
    sb.style.transform = sb.style.transform === 'translateX(-100%)' ? 'translateX(0)' : 'translateX(-100%)';
    setTimeout(() => editor.layout(), 250);
}

const resizer = document.getElementById('resizer');
const bottomPanel = document.getElementById('bottom-panel');
function handleDrag(e) {
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    const h = window.innerHeight - clientY;
    if(h > 50 && h < window.innerHeight - 50) {
        bottomPanel.style.height = h + 'px';
        editor.layout();
    }
}
resizer.addEventListener('mousedown', () => document.addEventListener('mousemove', handleDrag));
document.addEventListener('mouseup', () => document.removeEventListener('mousemove', handleDrag));
resizer.addEventListener('touchstart', () => document.addEventListener('touchmove', handleDrag, {passive:false}), {passive:false});
document.addEventListener('touchend', () => document.removeEventListener('touchmove', handleDrag));
