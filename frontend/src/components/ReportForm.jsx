import { useState } from "react";
import { Button, Card, Field, Input, Select, Textarea } from "@fluentui/react-components";

function ReportForm({ onCreate, loading }) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [source, setSource] = useState("manual");
  const [manualText, setManualText] = useState("");
  const [excelFile, setExcelFile] = useState(null);

  async function handleSubmit(event) {
    event.preventDefault();

    const formData = new FormData();
    formData.append("title", title);
    formData.append("description", description);
    formData.append("status", "draft");

    if (source === "excel" && excelFile) {
      formData.append("file", excelFile);
      formData.append("source", "excel");
    }

    if (source === "manual") {
      formData.append("source", "manual");
      formData.append(
        "content",
        JSON.stringify({
          source: "manual",
          text: manualText,
          createdAt: new Date().toISOString()
        })
      );
    }

    if (source === "soar") {
      formData.append("source", "soar");
    }

    await onCreate(formData);
    setTitle("");
    setDescription("");
    setManualText("");
    setExcelFile(null);
  }

  return (
    <Card className="panel">
      <h3>Create Report</h3>
      <form onSubmit={handleSubmit} className="stack">
        <Field label="Report title" required>
          <Input value={title} onChange={(_, data) => setTitle(data.value)} required />
        </Field>

        <Field label="Description">
          <Input value={description} onChange={(_, data) => setDescription(data.value)} />
        </Field>

        <Field label="Datasource">
          <Select value={source} onChange={(event) => setSource(event.target.value)}>
            <option value="manual">Manual</option>
            <option value="excel">Excel</option>
            <option value="soar">SOAR (Mock)</option>
          </Select>
        </Field>

        {source === "manual" && (
          <Field label="Manual input">
            <Textarea rows={4} value={manualText} onChange={(_, data) => setManualText(data.value)} />
          </Field>
        )}

        {source === "excel" && (
          <Field label="Excel file" required>
            <input
              className="fluent-file-input"
              type="file"
              accept=".xlsx,.xls"
              onChange={(e) => setExcelFile(e.target.files?.[0] || null)}
              required
            />
          </Field>
        )}

        <Button appearance="primary" type="submit" disabled={loading}>
          {loading ? "Creating..." : "Create & Preview"}
        </Button>
      </form>
    </Card>
  );
}

export default ReportForm;
