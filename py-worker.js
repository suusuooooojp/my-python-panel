importScripts("https://cdn.jsdelivr.net/pyodide/v0.24.1/full/pyodide.js");

let pyodide = null;

async function loadEngine() {
    try {
        pyodide = await loadPyodide({
            stdout: (text) => self.postMessage({ type: 'stdout', text }),
            stderr: (text) => self.postMessage({ type: 'stdout', text: "⚠ " + text })
        });
        
        await pyodide.runPythonAsync(`
            import js, sys, types
            class Bridge:
                def dom_write(self, id, c):
                    js.postMessage(js.Object.fromEntries({'type':'dom_op','op':'write','id':id,'content':c}))
            sys.modules["pypanel"] = Bridge()
        `);

        self.postMessage({ type: 'ready' });
    } catch (e) {
        self.postMessage({ type: 'error', error: e.toString() });
    }
}
loadEngine();

self.onmessage = async (e) => {
    const { cmd, code, files } = e.data;
    if (cmd === 'run' && pyodide) {
        try {
            if (files) {
                for (const [filename, content] of Object.entries(files)) {
                    // Create directories
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
            await pyodide.runPythonAsync(code);
            self.postMessage({ type: 'results', results: 'Done' });
        } catch (error) {
            self.postMessage({ type: 'error', error: error.toString() });
        }
    }
};
