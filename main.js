// --- Service Worker ---
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});

// --- Monaco Setup ---
require.config({ paths: { 'vs': 'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.45.0/min/vs' }});
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
let zenkakuDecorations = [];

// Sample Project
const DEFAULT_FILES = {
    'main.py': { 
        content: `import sys\nimport utils\n\nprint(f"🐍 Python {sys.version.split()[0]}")\nprint(utils.greet("Developer"))`, 
        mode: 'python' 
    },
    'utils.py': { 
        content: `def greet(name):\n    return f"Hello, {name}! (from utils.py)"`, 
        mode: 'python' 
    },
    'index.html': { 
        content: `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <link rel="stylesheet" href="css/style.css">
</head>
<body>
  <div class="card">
    <h1>Project Running!</h1>
    <p>HTML + CSS + JS are bundled.</p>
    <button onclick="changeColor()">Click Me</button>
  </div>
  <script src="js/app.js"></script>
</body>
</html>`, mode: 'html' 
    },
    'css/style.css': { 
        content: `body { background: #f4f4f4; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; font-family: sans-serif; }
.card { background: white; padding: 40px; border-radius: 8px; box-shadow: 0 4px 10px rgba(0,0,0,0.1); text-align: center; }
button { background: #007acc; color: white; border: none; padding: 10px 20px; border-radius: 4px; font-size: 16px; cursor: pointer; }`, mode: 'css' 
    },
    'js/app.js': { 
        content: `function changeColor() {
  document.body.style.backgroundColor = document.body.style.backgroundColor === 'black' ? '#f4f4f4' : 'black';
  alert("JS is working across files!");
}`, mode: 'javascript' 
    }
};

// --- Initialization ---
try {
    files = JSON.parse(localStorage.getItem('pypanel_files')) || DEFAULT_FILES;
} catch(e) { files = DEFAULT_FILES; }

require(['vs/editor/editor.main'], function() {
    currentPath = Object.keys(files)[0] || "main.py";
    
    editor = monaco.editor.create(document.getElementById('editor-container'), {
        value: files[currentPath] ? files[currentPath].content : "",
        language: getLang(currentPath),
        theme: 'vs-dark',
        fontSize: 14,
        automaticLayout: true,
        minimap: { enabled: true, scale: 0.75, renderCharacters: false },
        fontFamily: "'JetBrains Mono', monospace",
        scrollBeyondLastLine: false,
        padding: { top: 10 }
    });

    // Event Listeners
    editor.onDidChangeModelContent(() => {
        if(files[currentPath]) {
            files[currentPath].content = editor.getValue();
            localStorage.setItem('pypanel_files', JSON.stringify(files));
        }
        updateZenkaku();
    });

    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, runProject);
    renderTree();
    updateTabs();
    updateZenkaku();
});

// --- Zenkaku (Full-width space) Detection ---
function updateZenkaku() {
    if(!editor) return;
    const model = editor.getModel();
    const matches = model.findMatches('　', false, false, false, null, true);
    const newDecorations = matches.map(match => ({
        range: match.range,
        options: {
            isWholeLine: false,
            className: 'zenkaku-bg',
            inlineClassName: 'zenkaku-bg'
        }
    }));
    zenkakuDecorations = model.deltaDecorations(zenkakuDecorations, newDecorations);
}
// Add CSS for Zenkaku
const style = document.createElement('style');
style.innerHTML = `.zenkaku-bg { background: rgba(255, 165, 0, 0.3); border: 1px solid orange; }`;
document.head.appendChild(style);

// --- File System & Tree ---
function renderTree() {
    const tree = document.getElementById('file-tree');
    tree.innerHTML = "";
    Object.keys(files).sort().forEach(path => {
        const parts = path.split('/');
        const depth = parts.length - 1;
        const name = parts[parts.length - 1];
        
        const div = document.createElement('div');
        div.className = `tree-item ${path === currentPath ? 'active' : ''}`;
        div.style.paddingLeft = `${10 + (depth * 15)}px`;
        div.innerHTML = `<span style="margin-right:5px;">${getIcon(path)}</span>${name}`;
        
        div.onclick = () => openFile(path);
        div.oncontextmenu = (e) => showCtx(e, path);
        tree.appendChild(div);
    });
}

function openFile(path) {
    if(!files[path]) return;
    currentPath = path;
    const model = editor.getModel();
    monaco.editor.setModelLanguage(model, getLang(path));
    editor.setValue(files[path].content);
    renderTree();
    updateTabs();
    updateZenkaku();
}

function createNew() {
    let path = prompt("Enter Filename (e.g. src/test.py):", "new.py");
    if(!path) return;
    if(files[path]) { alert("File exists"); return; }
    files[path] = { content: "", mode: getLang(path) };
    localStorage.setItem('pypanel_files', JSON.stringify(files));
    openFile(path);
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

function updateTabs() {
    document.getElementById('tabs').innerHTML = `<div class="tab active">${currentPath}</div>`;
}

// --- Context Menu ---
const ctxMenu = document.getElementById('context-menu');
let ctxTarget = null;
function showCtx(e, path) {
    e.preventDefault();
    ctxTarget = path;
    ctxMenu.style.display = 'block';
    ctxMenu.style.left = e.pageX + 'px';
    ctxMenu.style.top = e.pageY + 'px';
}
document.addEventListener('click', () => ctxMenu.style.display = 'none');

function ctxDelete() {
    if(ctxTarget && confirm(`Delete ${ctxTarget}?`)) {
        delete files[ctxTarget];
        if(currentPath === ctxTarget) openFile(Object.keys(files)[0] || "");
        localStorage.setItem('pypanel_files', JSON.stringify(files));
        renderTree();
    }
}
function ctxRun() {
    if(ctxTarget) {
        openFile(ctxTarget);
        runProject();
    }
}

// --- PROJECT RUNNER (The Core Fix) ---
async function runProject() {
    // Determine Project Type
    const isPython = currentPath.endsWith('.py') || Object.keys(files).some(k => k.endsWith('.py'));
    const isWeb = currentPath.match(/\.(html|css|js)$/) || files['index.html'];

    // 1. Python Project
    if (currentPath.endsWith('.py')) {
        switchPanel('terminal');
        runPython();
        return;
    }

    // 2. Web Project (Combine everything)
    if (files['index.html'] || currentPath.endsWith('.html')) {
        switchPanel('preview');
        const entry = files['index.html'] ? 'index.html' : currentPath;
        log(`Bundling Web Project from ${entry}...`, '#4ec9b0');
        const html = bundleFiles(entry);
        document.getElementById('preview-frame').srcdoc = html;
        return;
    }

    // Fallback
    log("Unknown project type. Create index.html or main.py.", 'orange');
}

// Bundler Logic: Replaces <link> and <script> with actual file content
function bundleFiles(htmlPath) {
    let html = files[htmlPath].content;
    
    // Inject CSS
    html = html.replace(/<link\s+rel=["']stylesheet["']\s+href=["']([^"']+)["']\s*\/?>/g, (match, href) => {
        if(files[href]) return `<style>/* ${href} */\n${files[href].content}</style>`;
        return match;
    });
    
    // Inject JS
    html = html.replace(/<script\s+src=["']([^"']+)["']><\/script>/g, (match, src) => {
        if(files[src]) return `<script>/* ${src} */\n${files[src].content}</script>`;
        return match;
    });

    return html;
}

// --- Python Engine ---
let pyWorker = null;
function runPython() {
    if(!pyWorker) {
        log("Starting Python Engine...", 'gray');
        pyWorker = new Worker('py-worker.js');
        pyWorker.onmessage = e => {
            const d = e.data;
            if(d.type==='stdout') log(d.text);
            if(d.type==='results') log("<= " + d.results, '#4ec9b0');
            if(d.type==='error') log("Error: "+d.error, 'red');
        };
    }
    // Send ALL files to worker
    const fileData = {};
    for(let f in files) fileData[f] = files[f].content;
    pyWorker.postMessage({ cmd: 'run', code: files[currentPath].content, files: fileData });
}

// --- UI / Terminal ---
const termLog = document.getElementById('term-log');
const shellIn = document.getElementById('shell-input');

shellIn.addEventListener('keydown', e => {
    if(e.key === 'Enter') {
        const val = shellIn.value;
        log(`$ ${val}`, '#888');
        shellIn.value = "";
        if(val === 'ls') log(Object.keys(files).join('  '));
        else if(val === 'clear') termLog.innerHTML = "";
        else log("Command not found");
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
function resetAll() {
    if(confirm("Factory Reset?")) { localStorage.removeItem('pypanel_files'); location.reload(); }
}

function switchPanel(panel) {
    document.querySelectorAll('.panel-tab').forEach(t => t.classList.remove('active'));
    document.getElementById(panel === 'terminal' ? 'tab-term' : 'tab-prev').classList.add('active');
    document.getElementById('terminal-area').className = panel === 'terminal' ? 'show' : '';
    document.getElementById('preview-area').className = panel === 'preview' ? 'show' : '';
}

function openPopup() {
    document.getElementById('popup-overlay').style.display = 'flex';
    if(files['index.html']) document.getElementById('popup-content').srcdoc = bundleFiles('index.html');
}
function closePopup() { document.getElementById('popup-overlay').style.display = 'none'; }
function toggleSidebar() {
    const sb = document.getElementById('sidebar');
    const isClosed = sb.style.transform === 'translateX(-100%)';
    sb.style.transform = isClosed ? 'translateX(0)' : 'translateX(-100%)';
    if(window.innerWidth > 768) sb.style.width = isClosed ? '220px' : '0px';
    setTimeout(() => editor.layout(), 250);
}

// --- Touch Friendly Resizer ---
const resizer = document.getElementById('resizer');
const bottomPanel = document.getElementById('bottom-panel');

function handleDrag(e) {
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    const h = window.innerHeight - clientY;
    if(h > 50 && h < window.innerHeight - 100) {
        bottomPanel.style.height = h + 'px';
        editor.layout();
    }
}
resizer.addEventListener('mousedown', () => document.addEventListener('mousemove', handleDrag));
document.addEventListener('mouseup', () => document.removeEventListener('mousemove', handleDrag));
resizer.addEventListener('touchstart', () => document.addEventListener('touchmove', handleDrag, {passive:false}), {passive:false});
document.addEventListener('touchend', () => document.removeEventListener('touchmove', handleDrag));
