// --- Service Worker ---
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});

// --- Monaco Editor Setup ---
require.config({ paths: { 'vs': 'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.45.0/min/vs' }});
window.MonacoEnvironment = {
    getWorkerUrl: () => `data:text/javascript;charset=utf-8,${encodeURIComponent(`
        self.MonacoEnvironment = { baseUrl: 'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.45.0/min/' };
        importScripts('https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.45.0/min/vs/base/worker/workerMain.js');`
    )}`
};

let editor;
let currentPath = ""; // 現在開いているファイルパス
let cwd = "~"; // 現在のディレクトリ (Terminal用)

// --- File System (Path based) ---
// Key: "folder/filename.ext", Value: { content: "...", mode: "python" }
const DEFAULT_FILES = {
    'main.py': {
        content: `import sys\nimport numpy as np\n\nprint(f"🐍 Python {sys.version.split()[0]}")\nprint("Hello from Root!")`, 
        mode: 'python'
    },
    'src/utils.py': {
        content: `def greet(name):\n    return f"Hello, {name}!"`, 
        mode: 'python'
    },
    'assets/style.css': {
        content: `body { background: #222; color: #fff; }`,
        mode: 'css'
    },
    'index.html': {
        content: `<!DOCTYPE html>\n<html>\n<head>\n<!-- assets/style.css will be injected -->\n</head>\n<body>\n<h1>Hello Web</h1>\n</body>\n</html>`,
        mode: 'html'
    }
};

let files = JSON.parse(localStorage.getItem('pypanel_files')) || DEFAULT_FILES;

// --- Initialize Monaco ---
require(['vs/editor/editor.main'], function() {
    // 最初のファイルを探して開く
    currentPath = Object.keys(files)[0] || "";
    
    editor = monaco.editor.create(document.getElementById('editor-container'), {
        value: currentPath ? files[currentPath].content : "",
        language: currentPath ? getLangFromExt(currentPath) : 'text',
        theme: 'vs-dark',
        fontSize: 14,
        automaticLayout: true,
        minimap: { enabled: true, scale: 0.75 },
        fontFamily: "'JetBrains Mono', monospace",
    });

    // 保存イベント
    editor.onDidChangeModelContent(() => {
        if(files[currentPath]) {
            files[currentPath].content = editor.getValue();
            saveFS();
        }
    });

    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, runActiveFile);
    renderFileTree();
});

function saveFS() {
    localStorage.setItem('pypanel_files', JSON.stringify(files));
}

function getLangFromExt(path) {
    if(path.endsWith('.py')) return 'python';
    if(path.endsWith('.js')) return 'javascript';
    if(path.endsWith('.html')) return 'html';
    if(path.endsWith('.css')) return 'css';
    if(path.endsWith('.java')) return 'java';
    if(path.endsWith('.go')) return 'go';
    if(path.endsWith('.rb')) return 'ruby';
    if(path.endsWith('.json')) return 'json';
    if(path.endsWith('.yaml')) return 'yaml';
    return 'plaintext';
}

// --- Explorer (Tree View) ---
function renderFileTree() {
    const tree = document.getElementById('file-tree');
    tree.innerHTML = "";
    
    // パスを構造化データに変換
    const structure = {};
    Object.keys(files).sort().forEach(path => {
        const parts = path.split('/');
        let current = structure;
        parts.forEach((part, i) => {
            if(!current[part]) {
                current[part] = (i === parts.length - 1) ? { __file: true, path: path } : {};
            }
            current = current[part];
        });
    });

    // 再帰的に描画
    function buildDom(obj, container, indent = 0) {
        Object.keys(obj).sort((a,b) => {
            // フォルダ優先
            const aIsFile = obj[a].__file;
            const bIsFile = obj[b].__file;
            if(aIsFile === bIsFile) return a.localeCompare(b);
            return aIsFile ? 1 : -1;
        }).forEach(key => {
            if(key === '__file' || key === 'path') return;
            
            const item = obj[key];
            const div = document.createElement('div');
            div.className = 'tree-node';
            if(item.__file && item.path === currentPath) div.classList.add('active');
            
            const padding = indent * 15 + 10;
            const icon = item.__file ? getIcon(key) : '📁';
            
            div.innerHTML = `<div class="tree-content" style="padding-left:${padding}px">
                <span class="folder-icon">${icon}</span> ${key}
            </div>`;

            // 右クリックメニュー
            div.oncontextmenu = (e) => showContextMenu(e, item.__file ? item.path : null);

            if(item.__file) {
                div.onclick = () => openFile(item.path);
            } else {
                // フォルダクリック (今回は展開固定だが、トグル可能に拡張可)
            }
            container.appendChild(div);
            
            if(!item.__file) {
                buildDom(item, container, indent + 1);
            }
        });
    }

    buildDom(structure, tree);
}

function getIcon(name) {
    if(name.endsWith('.py')) return '🐍';
    if(name.endsWith('.html')) return '🌐';
    if(name.endsWith('.js')) return '📜';
    if(name.endsWith('.css')) return '🎨';
    if(name.endsWith('.rb')) return '💎';
    if(name.endsWith('.java')) return '☕';
    if(name.endsWith('.go')) return '🐹';
    return '📄';
}

function openFile(path) {
    currentPath = path;
    const file = files[path];
    monaco.editor.setModelLanguage(editor.getModel(), getLangFromExt(path));
    editor.setValue(file.content);
    renderFileTree();
    
    // Tabs
    document.getElementById('tabs').innerHTML = `<div class="tab active">${path}</div>`;
}

function createNew(type) {
    const defaultName = type === 'folder' ? 'new_folder/' : 'new_file.py';
    let path = prompt(`Enter path (use / for folders):`, cwd === '~' ? defaultName : `${cwd}/${defaultName}`);
    if(!path) return;
    
    // cwd補正
    if(cwd !== '~' && !path.startsWith(cwd)) path = cwd + "/" + path;
    path = path.replace('~/', ''); // normalize

    if(type === 'folder') {
        // フォルダ自体は仮想FSでは「その下のファイル」がないと存在しない概念だが、
        // UXとしてダミーファイルを作る
        files[`${path}/.keep`] = { content: "", mode: "text" };
    } else {
        if(files[path]) { alert("Exists!"); return; }
        files[path] = { content: "", mode: getLangFromExt(path) };
    }
    saveFS();
    renderFileTree();
    if(type === 'file') openFile(path);
}

// --- Context Menu ---
let ctxTarget = null;
const ctxMenu = document.getElementById('context-menu');
function showContextMenu(e, path) {
    e.preventDefault();
    if(!path) return; // フォルダ削除は今回は簡易化のためスキップ
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
        saveFS();
        renderFileTree();
    }
}
function ctxRun() {
    if(ctxTarget) { openFile(ctxTarget); runActiveFile(); }
}

// --- Terminal / Shell ---
const termLog = document.getElementById('term-log');
const shellInput = document.getElementById('shell-input');
const shellCwd = document.getElementById('shell-cwd');

shellInput.addEventListener('keydown', (e) => {
    if(e.key === 'Enter') {
        const cmd = shellInput.value.trim();
        shellInput.value = "";
        execShell(cmd);
    }
});

function termPrint(msg, color) {
    const div = document.createElement('div');
    div.textContent = msg;
    if(color) div.style.color = color;
    termLog.appendChild(div);
    document.getElementById('output').scrollTop = document.getElementById('output').scrollHeight;
}

function execShell(cmdStr) {
    termPrint(`user@pypanel:${cwd}$ ${cmdStr}`, '#aaa');
    if(!cmdStr) return;

    const args = cmdStr.split(' ');
    const cmd = args[0];

    switch(cmd) {
        case 'ls':
            const prefix = cwd === '~' ? '' : cwd + '/';
            const hits = new Set();
            Object.keys(files).forEach(f => {
                if(cwd === '~' || f.startsWith(prefix)) {
                    // 直下のファイル/フォルダのみ表示
                    const sub = f.replace(prefix, '');
                    const root = sub.split('/')[0];
                    hits.add(root);
                }
            });
            termPrint(Array.from(hits).join('  '), '#fff');
            break;
            
        case 'cd':
            const target = args[1];
            if(!target || target === '~') { cwd = '~'; }
            else if(target === '..') {
                if(cwd !== '~') cwd = cwd.split('/').slice(0, -1).join('/') || '~';
            } else {
                // 簡易チェック: そのフォルダを含むファイルがあるか
                const newPath = cwd === '~' ? target : `${cwd}/${target}`;
                const exists = Object.keys(files).some(f => f.startsWith(newPath + '/'));
                if(exists) cwd = newPath;
                else termPrint(`cd: ${target}: No such directory`, 'red');
            }
            shellCwd.textContent = cwd + '/';
            break;

        case 'cat':
            const fPath = resolvePath(args[1]);
            if(files[fPath]) termPrint(files[fPath].content);
            else termPrint(`cat: ${args[1]}: No such file`, 'red');
            break;
            
        case 'rm':
            const rmPath = resolvePath(args[1]);
            if(files[rmPath]) {
                delete files[rmPath];
                saveFS(); renderFileTree();
                termPrint(`Removed ${args[1]}`);
            } else termPrint(`rm: ${args[1]}: Not found`, 'red');
            break;

        case 'touch':
            const tPath = resolvePath(args[1]);
            if(!files[tPath]) {
                files[tPath] = { content: "", mode: getLangFromExt(tPath) };
                saveFS(); renderFileTree();
            }
            break;
            
        case 'mkdir':
            const dPath = resolvePath(args[1]);
            files[`${dPath}/.keep`] = { content: "", mode: "text" };
            saveFS(); renderFileTree();
            break;

        case 'python':
        case 'python3':
            runFile(args[1], 'python');
            break;

        case 'node':
            runFile(args[1], 'node');
            break;

        case 'npm':
            if(args[1] === 'install' || args[1] === 'i') {
                const pkg = args[2];
                if(pkg) {
                    termPrint(`npm: Installing ${pkg}...`, 'cyan');
                    setTimeout(() => {
                        termPrint(`✅ ${pkg} installed (simulated).`, 'green');
                        termPrint(`Use: import ... from 'https://esm.sh/${pkg}'`, 'yellow');
                    }, 800);
                } else termPrint('Usage: npm install <package>', 'orange');
            } else {
                termPrint('npm: Only install command is simulated.', 'orange');
            }
            break;

        case 'clear':
            termLog.innerHTML = "";
            break;
            
        case 'help':
            termPrint("Commands: ls, cd, cat, rm, touch, mkdir, python, node, npm, clear");
            break;
            
        default:
            termPrint(`bash: ${cmd}: command not found`, 'red');
    }
}

function resolvePath(p) {
    if(!p) return "";
    if(cwd === '~') return p;
    return `${cwd}/${p}`;
}

// --- Running Code ---
function runActiveFile() {
    if(!files[currentPath]) return;
    const mode = files[currentPath].mode;
    
    // Extension based execution
    if(mode === 'python') runFile(currentPath, 'python');
    else if(mode === 'javascript') runFile(currentPath, 'node'); // JSはNode扱い
    else if(mode === 'ruby') runFile(currentPath, 'ruby');
    else if(mode === 'html') runFile(currentPath, 'web');
    else if(mode === 'java') runFile(currentPath, 'java');
    else if(mode === 'go') runFile(currentPath, 'go');
    else {
        termPrint(`Cannot execute ${currentPath} (Type: ${mode})`, 'orange');
    }
}

function runFile(path, runtime) {
    if(!path) path = currentPath;
    const file = files[path];
    if(!file) { termPrint(`File not found: ${path}`, 'red'); return; }
    
    document.getElementById('terminal-pane').style.display = 'flex';
    document.getElementById('output').style.display = 'block';
    document.getElementById('preview-frame').style.display = 'none';

    termPrint(`> Running ${path} with ${runtime}...`, '#4ec9b0');

    if(runtime === 'web') {
        document.getElementById('output').style.display = 'none';
        const pf = document.getElementById('preview-frame');
        pf.style.display = 'block';
        pf.srcdoc = file.content; // 単体プレビュー
    }
    else if(runtime === 'python') {
        if(!pyWorker) initPyWorker();
        // 全ファイル同期
        const fileData = {}; 
        for(let f in files) fileData[f] = files[f].content;
        
        // 簡易パッケージ検知
        const packages = [];
        if(file.content.includes('numpy')) packages.push('numpy');
        if(file.content.includes('pandas')) packages.push('pandas');

        pyWorker.postMessage({ cmd: 'run', code: file.content, files: fileData, packages: packages });
    }
    else if(runtime === 'node') {
        // ES Modules Dynamic Import
        const blob = new Blob([file.content], { type: 'text/javascript' });
        const url = URL.createObjectURL(blob);
        const originalLog = console.log;
        console.log = (...args) => termPrint(args.join(' '));
        import(url).then(() => {
            console.log = originalLog;
            termPrint('[Done]', '#666');
        }).catch(e => {
            console.log = originalLog;
            termPrint(`Error: ${e.message}`, 'red');
        });
    }
    else if(runtime === 'ruby') {
        // Ruby WASM (簡易実装: scriptタグでロードしてeval)
        termPrint("Ruby runtime loading...", 'gray');
        // 本来はWorkerでやるべきだが簡易化
        // 実際の実装はPyPanel Ultra Pro参照。ここではデモとしてLog出力
        setTimeout(() => termPrint(`(Ruby Output Simulation)\nHello from ${path}`, 'white'), 500);
    }
    else {
        termPrint(`Runtime ${runtime} requires explicit download (see Pro version).`, 'orange');
    }
}

// --- Workers ---
let pyWorker = null;
function initPyWorker() {
    pyWorker = new Worker('py-worker.js');
    pyWorker.onmessage = (e) => {
        const d = e.data;
        if(d.type === 'stdout') termPrint(d.text);
        if(d.type === 'results' && d.results !== 'None') termPrint('<= ' + d.results, 'cyan');
        if(d.type === 'error') termPrint(d.error, 'red');
    };
}

// --- Popup (Combined) ---
function openPopup() {
    let html = files['index.html']?.content || "<h1>No index.html</h1>";
    // 単純な結合ロジック
    Object.keys(files).forEach(p => {
        if(p.endsWith('.css')) html = html.replace('</head>', `<style>/* ${p} */\n${files[p].content}</style></head>`);
        if(p.endsWith('.js')) html = html.replace('</body>', `<script>/* ${p} */\n${files[p].content}</script></body>`);
    });
    popupOverlay.style.display = 'flex';
    popupFrame.srcdoc = html;
}
function closePopup() { popupOverlay.style.display = 'none'; }

// Resizer
const resizer = document.getElementById('resizer');
resizer.addEventListener('mousedown', (e) => {
    document.onmousemove = (ev) => {
        const h = window.innerHeight - ev.clientY;
        if(h > 30) document.getElementById('terminal-pane').style.height = h + 'px';
        editor.layout();
    };
    document.onmouseup = () => { document.onmousemove = null; };
});

function toggleSidebar() {
    const sb = document.getElementById('sidebar');
    sb.classList.toggle('collapsed');
    setTimeout(() => editor.layout(), 200);
}
function toggleTerminal() {
    const tp = document.getElementById('terminal-pane');
    tp.style.display = tp.style.display === 'none' ? 'flex' : 'none';
    editor.layout();
}
