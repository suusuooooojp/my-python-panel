// --- Service Worker ---
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});

// --- Loading & Status Logic ---
function updateProgress(percent, text) {
    const bar = document.getElementById('progress-bar');
    const txt = document.getElementById('loading-text');
    if (bar) bar.style.width = percent + '%';
    if (txt) txt.innerText = text;
}

// Timeout Logic: 20秒経過してもロード画面ならリトライボタンを表示
setTimeout(() => {
    const screen = document.getElementById('loading-screen');
    if (screen && screen.style.display !== 'none') {
        document.getElementById('retry-area').style.display = 'block';
        updateProgress(95, "Connection slow? Waiting...");
    }
}, 20000);

// Status Bar Update
function setPyStatus(state) {
    const dot = document.getElementById('py-dot');
    const txt = document.getElementById('py-text');
    dot.className = 'status-dot';
    
    if (state === 'loading') {
        dot.classList.add('loading');
        txt.innerText = "Py Loading...";
    } else if (state === 'ready') {
        dot.classList.add('ready');
        txt.innerText = "Py Ready";
    } else if (state === 'error') {
        dot.classList.add('error');
        txt.innerText = "Py Error";
    }
}

// --- Python Engine Pre-loading ---
// エディタロードと並行してPythonを読み込む
let pyWorker = null;
let isPyReady = false;

function initPyWorker() {
    setPyStatus('loading');
    pyWorker = new Worker('py-worker.js');
    
    pyWorker.onmessage = (e) => {
        const d = e.data;
        if (d.type === 'ready') {
            isPyReady = true;
            setPyStatus('ready');
            log("🐍 Python Engine Ready", '#4caf50');
        } else if (d.type === 'stdout') {
            log(d.text);
        } else if (d.type === 'results') {
            log("<= " + d.results, '#4ec9b0');
            resetRunBtn();
        } else if (d.type === 'error') {
            log("Error: " + d.error, 'red');
            if(!isPyReady) setPyStatus('error');
            resetRunBtn();
        }
    };
    
    pyWorker.onerror = (e) => {
        console.error("Worker Error:", e);
        setPyStatus('error');
        log("Python Worker Failed to Load", 'red');
    };
}

// ページ読み込みと同時にPython初期化開始
initPyWorker();


// --- Monaco Setup ---
updateProgress(20, "Loading Editor Core...");
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

// --- Globals ---
let editor;
let files = {};
let currentPath = "";
let expandedFolders = new Set();
let zenkakuDecorations = [];

const DEFAULT_FILES = {
    'main.py': { content: `import sys\nimport random\n\n# Python 3.11 Ready\nprint(f"Python {sys.version.split()[0]} Running")\nprint(f"Random: {random.randint(1, 100)}")`, mode: 'python' },
    'index.html': { content: `<!DOCTYPE html>\n<html>\n<head>\n  <link rel="stylesheet" href="css/style.css">\n</head>\n<body>\n  <div class="box">\n    <h1>PyPanel</h1>\n    <p>Everything is Ready!</p>\n    <button onclick="test()">Click Me</button>\n  </div>\n  <script src="js/main.js"></script>\n</body>\n</html>`, mode: 'html' },
    'css/style.css': { content: `body { background: #222; color: #fff; font-family: sans-serif; text-align: center; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }\n.box { border: 1px solid #444; padding: 20px; border-radius: 8px; background: #2a2a2a; }`, mode: 'css' },
    'js/main.js': { content: `function test() { alert("JS Works!"); }`, mode: 'javascript' }
};

try {
    files = JSON.parse(localStorage.getItem('pypanel_files')) || DEFAULT_FILES;
} catch(e) { files = DEFAULT_FILES; }

// --- Editor Init ---
updateProgress(50, "Starting Monaco...");

require(['vs/editor/editor.main'], function() {
    updateProgress(80, "Configuring Environment...");
    
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
        scrollBeyondLastLine: false,
        wordWrap: "on"
    });

    // Loading Finish
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
    console.error("Monaco Load Error:", err);
    updateProgress(90, "Editor Load Failed");
    document.getElementById('retry-area').style.display = 'block';
});

// --- Python Completion ---
function registerPythonCompletion() {
    monaco.languages.registerCompletionItemProvider('python', {
        provideCompletionItems: function(model, position) {
            const suggestions = [
                ...['import', 'from', 'def', 'class', 'return', 'if', 'else', 'elif', 'while', 'for', 'in', 'try', 'except', 'print', 'len', 'range', 'open', 'sys', 'os', 'math', 'numpy', 'pandas'].map(k => ({
                    label: k, kind: monaco.languages.CompletionItemKind.Keyword, insertText: k
                }))
            ];
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

// --- Zenkaku ---
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

// --- File System UI ---
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
            const aIsFile = obj[a].__file;
            const bIsFile = obj[b].__file;
            if (aIsFile === bIsFile) return a.localeCompare(b);
            return aIsFile ? 1 : -1;
        }).forEach(key => {
            if (key === '__file' || key === 'path') return;
            const item = obj[key];
            const isFile = item.__file;
            const currentFullPath = fullPathPrefix ? `${fullPathPrefix}/${key}` : key;
            
            const node = document.createElement('div');
            node.className = 'tree-node';
            
            const content = document.createElement('div');
            content.className = `tree-content ${isFile && item.path === currentPath ? 'active' : ''}`;
            
            let iconHtml = '';
            if (isFile) {
                iconHtml = `<span class="file-spacer"></span>${getIcon(key)}`;
            } else {
                const isOpen = expandedFolders.has(currentFullPath);
                iconHtml = `<span class="arrow ${isOpen ? 'down' : ''}">▶</span>📁`;
            }
            
            const menuBtn = document.createElement('span');
            menuBtn.className = 'tree-menu-btn';
            menuBtn.innerHTML = '⋮';
            menuBtn.onclick = (e) => { e.stopPropagation(); showCtx(e, currentFullPath, isFile); };

            const nameSpan = document.createElement('span');
            nameSpan.className = 'tree-name';
            nameSpan.innerText = key;

            content.innerHTML = iconHtml;
            content.appendChild(nameSpan);
            content.appendChild(menuBtn);
            
            content.onclick = (e) => {
                e.stopPropagation();
                if (isFile) openFile(item.path);
                else toggleFolder(currentFullPath);
            };
            content.oncontextmenu = (e) => showCtx(e, currentFullPath, isFile);

            node.appendChild(content);

            if (!isFile) {
                const childrenDiv = document.createElement('div');
                childrenDiv.className = `tree-children ${expandedFolders.has(currentFullPath) ? 'open' : ''}`;
                buildDom(item, childrenDiv, currentFullPath);
                node.appendChild(childrenDiv);
            }
            container.appendChild(node);
        });
    }
    buildDom(structure, tree);
}

function toggleFolder(path) {
    if(expandedFolders.has(path)) expandedFolders.delete(path);
    else expandedFolders.add(path);
    renderTree();
}

function openFile(path) {
    currentPath = path;
    const model = editor.getModel();
    monaco.editor.setModelLanguage(model, getLang(path));
    editor.setValue(files[path].content);
    renderTree();
    updateTabs();
    updateZenkaku();
}

// --- Menu Logic ---
const ctxMenu = document.getElementById('context-menu');
let ctxTarget = null;
let ctxIsFile = true;
function showCtx(e, path, isFile) {
    e.preventDefault(); e.stopPropagation();
    ctxTarget = path; ctxIsFile = isFile;
    let x = e.pageX, y = e.pageY;
    ctxMenu.style.display = 'block';
    const rect = ctxMenu.getBoundingClientRect();
    if(x + rect.width > window.innerWidth) x = window.innerWidth - rect.width - 10;
    if(y + rect.height > window.innerHeight) y = window.innerHeight - rect.height - 10;
    ctxMenu.style.left = x + 'px'; ctxMenu.style.top = y + 'px';
}
document.addEventListener('click', () => ctxMenu.style.display = 'none');
if(editor) editor.onMouseDown(() => ctxMenu.style.display = 'none');

function ctxDelete() {
    if(ctxTarget && confirm(`削除しますか？\n${ctxTarget}`)) {
        if(ctxIsFile) delete files[ctxTarget];
        else Object.keys(files).forEach(k => { if(k.startsWith(ctxTarget + '/')) delete files[k]; });
        if(!files[currentPath]) currentPath = Object.keys(files)[0] || "";
        if(currentPath) openFile(currentPath); else editor.setValue("");
        saveFiles(); renderTree();
        showToast("Deleted");
    }
}
function ctxRename() {
    if(!ctxTarget) return;
    const newName = prompt("新しい名前:", ctxTarget.split('/').pop());
    if(!newName) return;
    const parentDir = ctxTarget.substring(0, ctxTarget.lastIndexOf('/'));
    const newPath = parentDir ? `${parentDir}/${newName}` : newName;
    if(newPath === ctxTarget || files[newPath]) return;
    moveEntry(ctxTarget, newPath);
    renderTree();
    showToast("Renamed");
}
function ctxMove() {
    if(!ctxTarget) return;
    const folders = new Set(['(root)']);
    Object.keys(files).forEach(k => {
        const parts = k.split('/');
        if(parts.length > 1) {
            let p = "";
            for(let i=0; i<parts.length-1; i++){ p += (p?"/":"") + parts[i]; folders.add(p); }
        }
    });
    const dest = prompt(`移動先のフォルダ:\n${Array.from(folders).join(', ')}`, "");
    if(dest === null) return;
    let targetDir = dest.trim();
    if(targetDir === '(root)' || targetDir === '') targetDir = '';
    const fileName = ctxTarget.split('/').pop();
    const newPath = targetDir ? `${targetDir}/${fileName}` : fileName;
    if(newPath === ctxTarget) return;
    moveEntry(ctxTarget, newPath);
    renderTree();
    showToast("Moved");
}
function moveEntry(oldP, newP) {
    if(files[oldP]) {
        files[newP] = files[oldP]; delete files[oldP];
        if(currentPath === oldP) { currentPath = newP; updateTabs(); }
    } else {
        Object.keys(files).forEach(k => {
            if(k.startsWith(oldP + '/')) {
                const suffix = k.substring(oldP.length);
                const dest = newP + suffix;
                files[dest] = files[k]; delete files[k];
                if(currentPath === k) { currentPath = dest; updateTabs(); }
            }
        });
    }
    saveFiles();
}
function ctxRun() { if(ctxIsFile) { openFile(ctxTarget); runProject(); } }

function createNewFile() {
    let path = prompt("ファイル名 (例: src/test.py):", "");
    if(!path) return;
    if(files[path]) { alert("既に存在します"); return; }
    files[path] = { content: "", mode: getLang(path) };
    const parts = path.split('/');
    if(parts.length > 1) expandedFolders.add(parts[0]);
    saveFiles(); renderTree(); openFile(path);
    showToast("Created");
}
function createNewFolder() {
    let path = prompt("フォルダ名:", "folder");
    if(!path) return;
    files[`${path}/.keep`] = { content: "", mode: "plaintext" };
    expandedFolders.add(path);
    saveFiles(); renderTree();
    showToast("Created");
}

function getLang(p) {
    if(p.endsWith('.py')) return 'python';
    if(p.endsWith('.js')) return 'javascript';
    if(p.endsWith('.html')) return 'html';
    if(p.endsWith('.css')) return 'css';
    if(p.endsWith('.rb')) return 'ruby';
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

// --- Runner ---
async function runProject() {
    const btn = document.getElementById('runBtn');
    btn.disabled = true;
    btn.innerText = "Running...";
    showToast("Running Project...");

    if (currentPath.endsWith('.py')) {
        switchPanel('terminal');
        // Python Workerが準備できていなければ待つなどの処理も可だが、
        // InitPyWorkerがすでに走っているので状態をチェック
        if (!isPyReady) {
            log("⏳ Waiting for Python Engine...", 'orange');
            // Workerは裏で走っているのでReadyメッセージ待ち
        } else {
            runPython();
        }
        return;
    }
    let entry = files['index.html'] ? 'index.html' : (currentPath.endsWith('.html') ? currentPath : null);
    if (entry) {
        switchPanel('preview');
        log(`Bundling Web Project...`, '#4ec9b0');
        const html = bundleFiles(entry);
        document.getElementById('preview-frame').srcdoc = html;
        resetRunBtn();
        return;
    }
    log("実行不可 (index.html または .py が必要)", 'orange');
    resetRunBtn();
}

function resetRunBtn() {
    const btn = document.getElementById('runBtn');
    btn.disabled = false;
    btn.innerText = "▶ Run";
}

function bundleFiles(htmlPath) {
    let html = files[htmlPath].content;
    html = html.replace(/<link\s+[^>]*href=["']([^"']+)["'][^>]*>/g, (m, h) => files[h] ? `<style>/* ${h} */\n${files[h].content}</style>` : m);
    html = html.replace(/<script\s+[^>]*src=["']([^"']+)["'][^>]*><\/script>/g, (m, s) => files[s] ? `<script>/* ${s} */\n${files[s].content}</script>` : m);
    return html;
}

function runPython() {
    const fileData = {};
    for(let f in files) fileData[f] = files[f].content;
    pyWorker.postMessage({ cmd: 'run', code: files[currentPath].content, files: fileData });
}

// --- UI Logic ---
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
function resetAll() { if(confirm("全データを削除しますか？")) { localStorage.removeItem('pypanel_files'); location.reload(); } }
function switchPanel(p) {
    document.getElementById('tab-term').classList.remove('active');
    document.getElementById('tab-prev').classList.remove('active');
    document.getElementById('terminal-area').className = p === 'terminal' ? 'show' : '';
    document.getElementById('preview-area').className = p === 'preview' ? 'show' : '';
    if(p === 'terminal') document.getElementById('tab-term').classList.add('active');
    else document.getElementById('tab-prev').classList.add('active');
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
// Resizer
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
