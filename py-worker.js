importScripts("https://cdn.jsdelivr.net/pyodide/v0.24.1/full/pyodide.js");

let pyodide = null;

async function loadEngine() {
    try {
        pyodide = await loadPyodide({
            stdout: (text) => self.postMessage({ type: 'stdout', text }),
            stderr: (text) => self.postMessage({ type: 'stdout', text: "ERR: " + text })
        });
        self.postMessage({ type: 'ready' });
    } catch (e) {
        self.postMessage({ type: 'error', error: e.toString() });
    }
}

loadEngine();

self.onmessage = async (e) => {
    const { cmd, code, files, entryPoint } = e.data;

    if (!pyodide) return;

    if (cmd === 'run_project') {
        try {
            // 仮想ファイルシステムのリセット（簡易的）
            // 実際は既存ファイルを削除するのが理想だが、上書きで対応
            
            for (const [path, content] of Object.entries(files)) {
                // ディレクトリ作成
                // path: "src/utils/math.py" -> dir: "src/utils"
                const parts = path.split('/');
                if (parts.length > 1) {
                    let currentDir = "";
                    for (let i = 0; i < parts.length - 1; i++) {
                        currentDir += (i === 0 ? "" : "/") + parts[i];
                        if (!pyodide.FS.analyzePath(currentDir).exists) {
                            pyodide.FS.mkdir(currentDir);
                        }
                    }
                }
                // ファイル書き込み
                pyodide.FS.writeFile(path, content);
            }

            // 必要パッケージのロード（簡易解析）
            await pyodide.loadPackagesFromImports(files[entryPoint]);

            // 実行
            let results = await pyodide.runPythonAsync(files[entryPoint]);
            self.postMessage({ type: 'results', results: String(results) });
            
        } catch (error) {
            self.postMessage({ type: 'error', error: error.toString() });
        }
    }
};
