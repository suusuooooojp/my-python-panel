// --- Python Worker with Error Handling ---
try {
    importScripts("https://cdn.jsdelivr.net/pyodide/v0.24.1/full/pyodide.js");
} catch (e) {
    self.postMessage({ type: 'error', error: "Failed to load Pyodide Script. Check internet." });
}

let pyodide = null;

async function loadEngine() {
    try {
        pyodide = await loadPyodide({
            stdout: (text) => self.postMessage({ type: 'stdout', text }),
            stderr: (text) => self.postMessage({ type: 'stdout', text: "⚠ " + text })
        });
        self.postMessage({ type: 'ready' });
    } catch (e) {
        self.postMessage({ type: 'error', error: "Pyodide Init Failed: " + e.toString() });
    }
}

// Start loading immediately
if (typeof loadPyodide !== 'undefined') {
    loadEngine();
}

self.onmessage = async (e) => {
    const { cmd, code, files } = e.data;
    
    if (cmd === 'run') {
        if (!pyodide) {
            self.postMessage({ type: 'error', error: "Engine not ready yet." });
            return;
        }
        
        try {
            // File System Sync
            if (files) {
                for (const [filename, content] of Object.entries(files)) {
                    const parts = filename.split('/');
                    if(parts.length > 1) {
                        let path = "";
                        for(let i=0; i<parts.length-1; i++) {
                            path += (path ? "/" : "") + parts[i];
                            try { pyodide.FS.mkdir(path); } catch(e){}
                        }
                    }
                    pyodide.FS.writeFile(filename, content);
                }
            }
            
            // Run
            await pyodide.loadPackagesFromImports(code);
            let results = await pyodide.runPythonAsync(code);
            self.postMessage({ type: 'results', results: String(results) });
            
        } catch (error) {
            self.postMessage({ type: 'error', error: error.toString() });
        }
    }
};
