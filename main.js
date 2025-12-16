// --- 初期化 ---
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(console.error);
}

// Ace Editor
ace.require("ace/ext/language_tools");
const editor = ace.edit("editor");
editor.setTheme("ace/theme/vibrant_ink"); // VSCodeっぽいダークテーマ
editor.session.setMode("ace/mode/python");
editor.setOptions({
    enableBasicAutocompletion: true,
    enableLiveAutocompletion: true,
    fontSize: "14px",
    fontFamily: "'Menlo', 'Monaco', 'Courier New', monospace",
    showPrintMargin: false,
});

// --- データ構造 & 状態 ---

// ファイルシステム（キーはフルパス）
// 初期データとしてフォルダ階層を持たせる
let files = {
    'main.py': `import src.utils as utils\nimport src.config as config\n\nprint(f"App: {config.APP_NAME}")\nprint(f"Result: {utils.add(10, 5)}")`,
    'README.md': '# My Project\nThis is a documentation.',
    'src/config.py': 'APP_NAME = "PyPanel v2"',
    'src/utils.py': 'def add(a, b):\n    return a + b',
    'assets/css/style.css': 'body { background: #000; }',
    'assets/data.json': '{ "version": 1.0 }'
};

let currentFile = 'main.py';
let expandedFolders = new Set(['src', 'assets']); // 開いているフォルダ
let worker = null;

const treeContainer = document.getElementById('fileTree');
const outputDiv = document.getElementById('terminal-output');
const tabFilename = document.getElementById('tab-filename');

// --- ファイルシステム・ツリー表示ロジック ---

function loadFiles() {
    const saved = localStorage.getItem('pypanel_files_v2');
    if (saved) {
        files = JSON.parse(saved);
    }
    renderExplorer();
    openFile(currentFile);
}

function saveFiles() {
    files[currentFile] = editor.getValue();
    localStorage.setItem('pypanel_files_v2', JSON.stringify(files));
}

// パスからツリー構造オブジェクトを作る
function buildTree(filePaths) {
    const tree = {};
    filePaths.sort().forEach(path => {
        const parts = path.split('/');
        let currentLevel = tree;
        parts.forEach((part, index) => {
            if (!currentLevel[part]) {
                currentLevel[part] = { 
                    __name: part, 
                    __path: parts.slice(0, index + 1).join('/'),
                    __children: {} 
                };
            }
            // 最後の要素ならファイル、それ以外はフォルダ
            if (index === parts.length - 1) {
                currentLevel[part].__isFile = true;
            }
            currentLevel = currentLevel[part].__children;
        });
    });
    return tree;
}

// ツリーをHTMLにレンダリング（再帰）
function renderTreeHTML(treeNode, depth = 0) {
    let html = '';
    const entries = Object.values(treeNode).sort((a, b) => {
        // フォルダ優先、そのあと名前順
        if (a.__isFile === b.__isFile) return a.__name.localeCompare(b.__name);
        return a.__isFile ? 1 : -1;
    });

    entries.forEach(node => {
        const padding = depth * 15 + 10;
        const isFile = node.__isFile;
        const isExpanded = expandedFolders.has(node.__path);
        const isActive = node.__path === currentFile;
        
        // アイコン決定
        let iconClass = 'fas fa-file';
        let arrowClass = 'tree-arrow hidden';
        
        if (!isFile) {
            iconClass = isExpanded ? 'fas fa-folder-open' : 'fas fa-folder';
            arrowClass = `tree-arrow ${isExpanded ? 'open' : ''}`;
        } else {
            // 拡張子アイコン
            if (node.__name.endsWith('.py')) iconClass = 'fab fa-python';
            else if (node.__name.endsWith('.js')) iconClass = 'fab fa-js';
            else if (node.__name.endsWith('.html')) iconClass = 'fab fa-html5';
            else if (node.__name.endsWith('.css')) iconClass = 'fab fa-css3';
            else if (node.__name.endsWith('.md')) iconClass = 'fab fa-markdown';
        }

        html += `
        <div class="tree-item ${isActive ? 'selected' : ''}" 
             onclick="${isFile ? `openFile('${node.__path}')` : `toggleFolder('${node.__path}')`}">
            <span style="width:${padding}px" class="tree-indent"></span>
            <span class="${arrowClass}"><i class="fas fa-chevron-right"></i></span>
            <span class="tree-icon"><i class="${iconClass}"></i></span>
            <span>${node.__name}</span>
        </div>
        `;

        // フォルダが開いていれば中身をレンダリング
        if (!isFile && isExpanded) {
            html += renderTreeHTML(node.__children, depth + 1);
        }
    });
    return html;
}

function renderExplorer() {
    const treeRoot = buildTree(Object.keys(files));
    treeContainer.innerHTML = renderTreeHTML(treeRoot);
}

// --- アクション ---

function toggleFolder(path) {
    if (expandedFolders.has(path)) {
        expandedFolders.delete(path);
    } else {
        expandedFolders.add(path);
    }
    renderExplorer();
}

function openFile(path) {
    // 保存
    files[currentFile] = editor.getValue();
    
    currentFile = path;
    editor.setValue(files[path] || "", -1);
    tabFilename.textContent = path.split('/').pop();
    
    // モード切替
    const ext = path.split('.').pop();
    const modeMap = { 'py': 'python', 'js': 'javascript', 'html': 'html', 'css': 'css', 'md': 'markdown', 'json': 'json' };
    editor.session.setMode(`ace/mode/${modeMap[ext] || 'text'}`);

    saveFiles(); // localStorage更新
    renderExplorer(); // 選択ハイライト更新
}

function createNewFile() {
    const path = prompt("ファイルパスを入力 (例: folder/script.py)", "new_file.py");
    if (path) {
        if (!files[path]) {
            files[path] = "# New file";
            // 親フォルダを自動で開く
            const parts = path.split('/');
            if(parts.length > 1) {
                let currentPath = "";
                for(let i=0; i<parts.length-1; i++){
                    currentPath += (i===0?"":"/") + parts[i];
                    expandedFolders.add(currentPath);
                }
            }
            openFile(path);
        } else {
            alert("既に存在します");
        }
    }
}

function createNewFolder() {
    // このシステムでは空フォルダは保持できないため、ダミーファイルを作ることでフォルダを表現する
    const path = prompt("フォルダ名/ダミーファイル名 (例: tests/.keep)", "new_folder/.keep");
    if (path) {
        files[path] = "";
        const parts = path.split('/');
        expandedFolders.add(parts[0]);
        renderExplorer();
    }
}

function downloadCurrentFile() {
    const blob = new Blob([editor.getValue()], {type: 'text/plain'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = currentFile.split('/').pop();
    a.click();
}

// エディタ変更監視
editor.session.on('change', () => {
    // リアルタイム保存は負荷対策で少し間引いてもいいが、今回はシンプルに
    // saveFiles() は切り替え時に呼ぶ
});
// Ctrl+Sで保存
document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        saveFiles();
        // 小さく通知などを出しても良い
    }
});


// --- 実行環境 (Worker) ---
function initWorker() {
    if (worker) worker.terminate();
    worker = new Worker('py-worker.js');
    worker.onmessage = (e) => {
        const { type, text, results, error } = e.data;
        if (type === 'stdout') {
            outputDiv.innerText += text + "\n";
            outputDiv.scrollTop = outputDiv.scrollHeight;
        } else if (type === 'results') {
            if(results !== 'None') outputDiv.innerText += `\n[Result] ${results}\n`;
            outputDiv.innerText += `\n[Done]\n`;
            outputDiv.scrollTop = outputDiv.scrollHeight;
        } else if (type === 'error') {
            outputDiv.innerText += `\n[Error] ${error}\n`;
        } else if (type === 'ready') {
            outputDiv.innerText = "Python Engine Ready.\n";
        }
    };
}

function runProject() {
    saveFiles();
    outputDiv.innerText = "Running...\n";
    if (!worker) initWorker();
    
    worker.postMessage({
        cmd: 'run_project',
        entryPoint: currentFile,
        files: files
    });
}

function clearTerminal() {
    outputDiv.innerText = "";
}

function toggleSidebar() {
    const sb = document.getElementById('sidebar');
    if (sb.style.width === '0px') {
        sb.style.width = '250px';
        sb.classList.add('open'); // モバイル用
    } else {
        sb.style.width = '0px';
        sb.classList.remove('open');
    }
}

// 開始
window.onload = () => {
    loadFiles();
    initWorker();
};
