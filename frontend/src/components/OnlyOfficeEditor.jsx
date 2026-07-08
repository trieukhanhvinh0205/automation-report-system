import { useEffect, useRef, useState } from "react";
import { MessageBar, MessageBarBody, Spinner } from "@fluentui/react-components";

const loadedScripts = new Map();

function OnlyOfficeEditor({ documentServerUrl, config }) {
  const holderIdRef = useRef(`onlyoffice-editor-${Math.random().toString(36).slice(2)}`);
  const editorRef = useRef(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function mountEditor() {
      setError("");
      setLoading(true);

      try {
        if (!documentServerUrl || !config) {
          setLoading(false);
          return;
        }

        await loadOnlyOfficeApi(documentServerUrl);
        if (cancelled) return;

        if (!window.DocsAPI?.DocEditor) {
          throw new Error("OnlyOffice DocsAPI is not available");
        }

        editorRef.current?.destroyEditor?.();
        editorRef.current = new window.DocsAPI.DocEditor(holderIdRef.current, config);
      } catch (err) {
        setError(err.message || "Cannot load OnlyOffice editor");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    mountEditor();

    return () => {
      cancelled = true;
      editorRef.current?.destroyEditor?.();
      editorRef.current = null;
    };
  }, [documentServerUrl, config]);

  return (
    <div className="onlyoffice-shell">
      {loading && (
        <div className="fluent-loading">
          <Spinner label="Loading OnlyOffice..." />
        </div>
      )}
      {error && (
        <MessageBar intent="error">
          <MessageBarBody>{error}</MessageBarBody>
        </MessageBar>
      )}
      <div id={holderIdRef.current} className="onlyoffice-editor" />
    </div>
  );
}

function loadOnlyOfficeApi(documentServerUrl) {
  const baseUrl = String(documentServerUrl || "").replace(/\/+$/, "");
  const scriptUrl = `${baseUrl}/web-apps/apps/api/documents/api.js`;

  if (window.DocsAPI?.DocEditor) return Promise.resolve();
  if (loadedScripts.has(scriptUrl)) return loadedScripts.get(scriptUrl);

  const promise = loadScriptWithRetry(scriptUrl, 3).catch((error) => {
    loadedScripts.delete(scriptUrl);
    throw error;
  });

  loadedScripts.set(scriptUrl, promise);
  return promise;
}

async function loadScriptWithRetry(scriptUrl, attempts) {
  let lastError;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      await loadScriptOnce(scriptUrl);
      return;
    } catch (error) {
      lastError = error;
      await wait(700 * attempt);
    }
  }

  throw lastError || new Error(`Cannot load OnlyOffice API from ${scriptUrl}`);
}

function loadScriptOnce(scriptUrl) {
  return new Promise((resolve, reject) => {
    document.querySelectorAll(`script[data-onlyoffice-api="true"]`).forEach((script) => script.remove());

    const script = document.createElement("script");
    script.src = `${scriptUrl}${scriptUrl.includes("?") ? "&" : "?"}t=${Date.now()}`;
    script.async = true;
    script.dataset.onlyofficeApi = "true";
    script.onload = resolve;
    script.onerror = () => {
      script.remove();
      reject(new Error(`Cannot load OnlyOffice API from ${scriptUrl}`));
    };
    document.body.appendChild(script);
  });
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export default OnlyOfficeEditor;
