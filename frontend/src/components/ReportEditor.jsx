import { useEffect, useState } from "react";

function ReportEditor({ report, onSave, onExport, onDownload, actionLoading }) {
  const [text, setText] = useState("{}");
  const [format, setFormat] = useState("docx");
  const [error, setError] = useState("");

  useEffect(() => {
    setText(JSON.stringify(report?.content || {}, null, 2));
  }, [report]);

  if (!report) {
    return (
      <section className="panel">
        <h3>Preview</h3>
        <p className="muted">Select a report to preview and edit.</p>
      </section>
    );
  }

  async function handleSave() {
    try {
      setError("");
      const content = JSON.parse(text || "{}");
      await onSave(report.id, content);
    } catch (_) {
      setError("Content must be valid JSON");
    }
  }

  async function handleExport() {
    try {
      setError("");
      const file = await onExport(report.id, format);
      await onDownload(file.id, file.file_name);
    } catch (_) {
      setError("Export failed. Please try again.");
    }
  }

  return (
    <section className="panel">
      <div className="row-between">
        <h3>Preview & Edit</h3>
        <span className="muted">#{report.id}</span>
      </div>

      <textarea rows={14} value={text} onChange={(e) => setText(e.target.value)} />
      {error && <div className="error">{error}</div>}

      <div className="actions">
        <button className="primary" type="button" onClick={handleSave} disabled={actionLoading}>
          Save
        </button>
        <select value={format} onChange={(e) => setFormat(e.target.value)}>
          <option value="docx">Word (.docx)</option>
          <option value="xlsx">Excel (.xlsx)</option>
        </select>
        <button className="ghost" type="button" onClick={handleExport} disabled={actionLoading}>
          Export & Download
        </button>
      </div>
    </section>
  );
}

export default ReportEditor;
