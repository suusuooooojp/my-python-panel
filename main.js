// --- Service Worker (オフライン対応) ---
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(console.error);
}

// --- Ace Editor 設定 ---
ace.require("ace/ext/language_tools");
const editor = ace.edit("editor");
editor.setTheme("ace/theme/monokai");
editor.session.setMode("ace/mode/python");
editor.setOptions({
    enableBasicAutocompletion: true,
    enableLiveAutocompletion: true, // スマホでも補完が出るようにする重要設定
    enableSnippets: true,           // スニペット有効化
    showPrintMargin: false,
    fontSize: "14px",
    tabSize: 4,
    useSoftTabs: true
});

// スマホでの入力体験向上
editor.renderer.setScrollMargin(10, 10);

// --- UI要素 ---
const statusSpan = document.getElementById('status');
const outputDiv = document.getElementById('output');
const runBtn = document.getElementById('runBtn');
const stopBtn = document.getElementById('stopBtn');
const langSelect = document.getElementById('langSelect');

let worker = null;
let isWorkerReady = false;

// --- Worker制御 (Python実行) ---
function initWorker() {
    if (worker) worker.terminate(); // 既存があれば破棄
    
    worker = new Worker('py-worker.js');
    isWorkerReady = false;
    statusSpan.textContent = "Loading Engine...";
    
    worker.onmessage = (e) => {
        const { type, text, results, error } = e.data;

        if (type === 'ready') {
            isWorkerReady = true;
            statusSpan.textContent = "Ready (Offline OK)";
        } else if (type === 'stdout') {
            outputDiv.innerText += text + "\n";
            scrollToBottom();
        } else if (type === 'results') {
            if (results && results !== 'None') {
                outputDiv.innerText += `=> ${results}\n`;
            }
            executionFinished();
        } else if (type === 'error') {
            outputDiv.innerText += `Error: ${error}\n`;
            executionFinished();
        }
    };
}

// 初回起動
initWorker();

// --- 実行処理 ---
function runCode() {
    const code = editor.getValue();
    const mode = langSelect.value;

    outputDiv.innerText = ""; // クリア
    setRunningState(true);

    if (mode === 'python') {
        if (!isWorkerReady) {
            outputDiv.innerText = "Error: Python engine is not ready yet.\n";
            setRunningState(false);
            return;
        }
        worker.postMessage({ cmd: 'run', code: code });
    } else if (mode === 'javascript') {
        // JSは簡易的にブラウザ標準機能で実行
        try {
            // console.logをフックする
            const originalLog = console.log;
            console.log = (...args) => {
                outputDiv.innerText += args.join(' ') + "\n";
            };
            
            eval(code); // 簡易実行
            
            console.log = originalLog; // 戻す
            outputDiv.innerText += "\n[JS Executed]\n";
        } catch (e) {
            outputDiv.innerText += `JS Error: ${e.message}\n`;
        }
        setRunningState(false);
    } else {
        outputDiv.innerText += `[Info] ${mode} execution is not supported. Editor only.\n`;
        setRunningState(false);
    }
}

// --- ストップ処理 ---
function stopCode() {
    if (worker) {
        worker.terminate(); // 強制終了
        outputDiv.innerText += "\n[Stopped by User]\n";
        // ワーカーを作り直して次の実行に備える
        initWorker(); 
    }
    setRunningState(false);
}

// --- UI状態管理 ---
function setRunningState(isRunning) {
    if (isRunning) {
        runBtn.style.display = 'none';
        stopBtn.style.display = 'inline-block';
        statusSpan.textContent = "Running...";
    } else {
        runBtn.style.display = 'inline-block';
        stopBtn.style.display = 'none';
        // statusの文言はWorkerからのReady通知で戻るためここでは"Done"などに仮置き
        if(langSelect.value !== 'python') statusSpan.textContent = "Done";
    }
}

function executionFinished() {
    setRunningState(false);
    statusSpan.textContent = "Ready";
    scrollToBottom();
}

function scrollToBottom() {
    outputDiv.scrollTop = outputDiv.scrollHeight;
}

// --- 言語切り替え ---
function changeLanguage() {
    const mode = langSelect.value;
    editor.session.setMode(`ace/mode/${mode}`);
    statusSpan.textContent = `${mode} Mode`;
}

// Ctrl+Enterで実行
document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        runCode();
    }
});
