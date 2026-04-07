import { useState } from "react";

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
    <section className="panel">
      <h3>Create Report</h3>
      <form onSubmit={handleSubmit} className="stack">
        <input
          placeholder="Report title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
        />

        <input
          placeholder="Description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />

        <div className="source-switch">
          <button
            className={source === "manual" ? "active" : ""}
            type="button"
            onClick={() => setSource("manual")}
          >
            Manual
          </button>
          <button
            className={source === "excel" ? "active" : ""}
            type="button"
            onClick={() => setSource("excel")}
          >
            Excel
          </button>
          <button
            className={source === "soar" ? "active" : ""}
            type="button"
            onClick={() => setSource("soar")}
          >
            SOAR (Mock)
          </button>
        </div>

        {source === "manual" && (
          <textarea
            rows={4}
            placeholder="Manual input"
            value={manualText}
            onChange={(e) => setManualText(e.target.value)}
          />
        )}

        {source === "excel" && (
          <input
            type="file"
            accept=".xlsx,.xls"
            onChange={(e) => setExcelFile(e.target.files?.[0] || null)}
            required
          />
        )}

        <button className="primary" type="submit" disabled={loading}>
          {loading ? "Creating..." : "Create & Preview"}
        </button>
      </form>
    </section>
  );
}

export default ReportForm;
