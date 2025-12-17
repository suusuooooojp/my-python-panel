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

// デフォルトファイル: 相互リンクしているサンプル
const DEFAULT_FILES = {
    'main.py': { 
        content: `import sys\nprint(f"Python {sys.version.split()[0]} is ready.")`, 
        mode: 'python' 
    },
    'index.html': { 
        content: `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <!-- ここでCSSファイルを指定すると自動結合されます -->
  <link rel="stylesheet" href="style.css">
</head>
<body>
  <div class="box">
    <h1>Web Project Integration</h1>
    <p>HTML, CSS, JS are bundled automatically!</p>
    <button onclick="showAlert()">Test JS</button>
  </div>
  
  <!-- ここでJSファイルを指定 -->
  <script src="script.js"></script>
</body>
</html>`, 
        mode: 'html' 
    },
    'style.css': { 
        content: `body { background: #f0f0f0; font-family: sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; }
.box { background: white; padding: 40px; border-radius: 12px; box-shadow: 0 4px 15px rgba(0,0,0,0.1); text-align: center; }
h1 { color: #007acc; }
button { padding: 10px 20px; cursor: pointer; background: #007acc; color: white; border: none; border-radius: 4px; }
button:hover { background: #005a9e; }`, 
        mode: 'css' 
    },
    'script.js': { 
        content: `function showAlert() {
  alert("JavaScript file is correctly linked and executed!");
  console.log("Script loaded.");
}`, 
        mode: 'javascript' 
    }
};

// --- Init ---
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
        minimap: { enabled: true, scale: 0.75 },
        fontFamily: "'JetBrains Mono', monospace",
        scrollBeyondLastLine: false,
        padding: { top: 10 }
    });

    editor.onDidChangeModelContent(() => {
        if(files[currentPath]) {
            files[currentPath].content = editor.getValue();
            localStorage.setItem('pypanel_files', JSON.stringify(files));
        }
    });

    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, runProject);
    renderTree();
    updateTabs();
});

// --- File System & Tree View ---
function renderTree() {
    const tree = document.getElementById('file-tree');
    tree.innerHTML = "";
    
    // パスをソートして表示
    Object.keys(files).sort().forEach(path => {
        const parts = path.split('/');
        // 簡易インデント (本来は再帰構造にするが、今回は見やすさ優先で簡易実装)
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
}

function createNew() {
    let path = prompt("Enter Filename (e.g. css/style.css):", "new.py");
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

// --- PROJECT BUNDLER & RUNNER ---
async function runProject() {
    // 1. Pythonモード
    if (currentPath.endsWith('.py')) {
        switchPanel('terminal');
        runPython();
        return;
    }

    // 2. Webモード (HTML/CSS/JS統合)
    // 編集中のファイルが何であれ、index.html を探してそれをベースにする
    // index.html がなければ、編集中のファイルがHTMLならそれを、そうでなければエラー
    
    let entryPoint = 'index.html';
    if (!files['index.html'] && currentPath.endsWith('.html')) {
        entryPoint = currentPath;
    }

    if (files[entryPoint]) {
        switchPanel('preview');
        log(`Building Web Project from ${entryPoint}...`, '#4ec9b0');
        const finalHtml = bundleFiles(entryPoint);
        const frame = document.getElementById('preview-frame');
        frame.srcdoc = finalHtml;
    } else {
        switchPanel('terminal');
        log(`Error: 'index.html' not found. Cannot bundle project.`, 'red');
        if(currentPath.match(/\.(css|js)$/)) {
            log(`(Create an index.html and link this file to run it)`, 'gray');
        }
    }
}

// 仮想ファイルシステムの内容を解析して結合する（超重要機能）
function bundleFiles(htmlPath) {
    let html = files[htmlPath].content;

    // 1. CSS Injection (<link rel="stylesheet" href="...">)
    html = html.replace(/<link\s+rel=["']stylesheet["']\s+href=["']([^"']+)["']\s*\/?>/g, (match, href) => {
        if (files[href]) {
            console.log(`Bundling CSS: ${href}`);
            return `<style>/* ${href} */\n${files[href].content}</style>`;
        }
        return match; // 見つからなければそのまま
    });

    // 2. JS Injection (<script src="..."></script>)
    html = html.replace(/<script\s+src=["']([^"']+)["']><\/script>/g, (match, src) => {
        if (files[src]) {
            console.log(`Bundling JS: ${src}`);
            return `<script>/* ${src} */\n${files[src].content}</script>`;
        }
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
    const fileData = {};
    for(let f in files) fileData[f] = files[f].content;
    pyWorker.postMessage({ cmd: 'run', code: files[currentPath].content, files: fileData });
}

// --- UI / Utils ---
const termLog = document.getElementById('term-log');
const shellIn = document.getElementById('shell-input');

shellIn.addEventListener('keydown', e => {
    if(e.key === 'Enter') {
        const val = shellIn.value;
        log(`$ ${val}`, '#888');
        shellIn.value = "";
        // 簡易コマンド
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
    if(confirm("Reset all files?")) {
        localStorage.removeItem('pypanel_files');
        location.reload();
    }
}

// Panel Switching
function switchPanel(panelName) {
    document.getElementById('tab-term').classList.remove('active');
    document.getElementById('tab-prev').classList.remove('active');
    document.getElementById('terminal-area').classList.remove('show');
    document.getElementById('preview-area').classList.remove('show');

    if(panelName === 'terminal') {
        document.getElementById('tab-term').classList.add('active');
        document.getElementById('terminal-area').classList.add('show');
    } else {
        document.getElementById('tab-prev').classList.add('active');
        document.getElementById('preview-area').classList.add('show');
    }
}

// Popup
function openPopup() {
    document.getElementById('popup-overlay').style.display = 'flex';
    // index.htmlがあればそれをバンドルして表示
    if(files['index.html']) {
        document.getElementById('popup-content').srcdoc = bundleFiles('index.html');
    } else {
        document.getElementById('popup-content').srcdoc = "<h1>index.html not found</h1>";
    }
}
function closePopup() { document.getElementById('popup-overlay').style.display = 'none'; }

// Sidebar Toggle
function toggleSidebar() {
    const sb = document.getElementById('sidebar');
    const isClosed = sb.style.transform === 'translateX(-100%)';
    sb.style.transform = isClosed ? 'translateX(0)' : 'translateX(-100%)';
    if(window.innerWidth > 768) {
         // PCの場合はwidthで制御したほうが綺麗だが今回は簡易実装
         sb.style.width = isClosed ? '220px' : '0px'; 
    }
    setTimeout(() => editor.layout(), 250);
}

// --- Resizer Logic (Touch & Mouse) ---
const resizer = document.getElementById('resizer');
const bottomPanel = document.getElementById('bottom-panel');

function startResize(e) {
    e.preventDefault();
    document.addEventListener('mousemove', resizing);
    document.addEventListener('mouseup', stopResize);
    document.addEventListener('touchmove', resizing, {passive:false});
    document.addEventListener('touchend', stopResize);
}
function resizing(e) {
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    const newHeight = window.innerHeight - clientY;
    if(newHeight > 50 && newHeight < window.innerHeight - 100) {
        bottomPanel.style.height = newHeight + 'px';
        editor.layout();
    }
}
function stopResize() {
    document.removeEventListener('mousemove', resizing);
    document.removeEventListener('mouseup', stopResize);
    document.removeEventListener('touchmove', resizing);
    document.removeEventListener('touchend', stopResize);
}

resizer.addEventListener('mousedown', startResize);
resizer.addEventListener('touchstart', startResize, {passive: false});
