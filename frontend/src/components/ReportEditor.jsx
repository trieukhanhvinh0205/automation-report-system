import { useEffect, useState } from "react";
import { Button, Card, Select, Textarea } from "@fluentui/react-components";
import { AppMessage, EmptyState } from "./ui/Feedback";

function ReportEditor({ report, onSave, onExport, onDownload, actionLoading }) {
  const [text, setText] = useState("{}");
  const [format, setFormat] = useState("docx");
  const [error, setError] = useState("");

  useEffect(() => {
    setText(JSON.stringify(report?.content || {}, null, 2));
  }, [report]);

  if (!report) {
    return (
      <Card className="panel">
        <h3>Preview</h3>
        <EmptyState title="Select a report" description="Preview, edit and export report content here." />
      </Card>
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
    <Card className="panel">
      <div className="row-between">
        <h3>Preview & Edit</h3>
        <span className="muted">#{report.id}</span>
      </div>

      <Textarea rows={14} value={text} onChange={(_, data) => setText(data.value)} />
      <AppMessage intent="error">{error}</AppMessage>

      <div className="actions">
        <Button appearance="primary" type="button" onClick={handleSave} disabled={actionLoading}>
          Save
        </Button>
        <Select value={format} onChange={(e) => setFormat(e.target.value)}>
          <option value="docx">Word (.docx)</option>
          <option value="xlsx">Excel (.xlsx)</option>
        </Select>
        <Button type="button" onClick={handleExport} disabled={actionLoading}>
          Export & Download
        </Button>
      </div>
    </Card>
  );
}

export default ReportEditor;
