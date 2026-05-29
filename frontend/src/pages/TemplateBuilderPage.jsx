import { useEffect, useRef, useState } from "react";
import { renderAsync } from "docx-preview";
import {
  createTemplate,
  deleteTemplate,
  downloadGeneratedTemplateReport,
  exportTemplate,
  getTemplate,
  listCustomers,
  listTemplates,
  previewTemplate,
  templateizeTemplate,
  updateTemplateFieldMapping,
  updateTemplateLayout,
  updateTemplateSection,
  uploadTemplate
} from "../services/templateService";

const STEP_LABELS = ["Upload", "Review", "Builder", "Mapping", "Preview"];

function TemplateBuilderPage() {
  const [step, setStep] = useState(0);
  const [templates, setTemplates] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [draft, setDraft] = useState(null);
  const [templateDetail, setTemplateDetail] = useState(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function refreshTemplates() {
    const data = await listTemplates();
    setTemplates(data);
  }

  async function loadTemplate(templateId) {
    if (!templateId) return;
    const data = await getTemplate(templateId);
    setTemplateDetail(data);
    setDraft(data.template_json);
    setSelectedTemplateId(String(templateId));
  }

  useEffect(() => {
    refreshTemplates().catch(() => setMessage("Không tải được danh sách template"));
    listCustomers()
      .then((data) => setCustomers(data))
      .catch(() => setMessage("Không tải được danh sách khách hàng"));
  }, []);

  async function handleUpload(payload) {
    setBusy(true);
    try {
      const data = await uploadTemplate(payload);
      setDraft(data.draft);
      setTemplateDetail(null);
      setStep(1);
      setMessage(data.warnings?.length ? data.warnings[0].message : "Đã extract DOCX thành draft template");
    } catch (err) {
      setMessage(err.response?.data?.message || "Upload template thất bại");
    } finally {
      setBusy(false);
    }
  }

  async function handleCreateTemplate(nextDraft = draft) {
    if (!nextDraft) return;
    setBusy(true);
    try {
      const saved = await createTemplate(nextDraft);
      await refreshTemplates();
      setTemplateDetail(saved);
      setDraft(saved.template_json);
      setSelectedTemplateId(String(saved.id));
      setStep(2);
      setMessage("Đã lưu template");
    } catch (err) {
      setMessage(err.response?.data?.message || "Lưu template thất bại");
    } finally {
      setBusy(false);
    }
  }

  async function handleSelectTemplate(value) {
    setSelectedTemplateId(value);
    if (!value) return;
    setBusy(true);
    try {
      await loadTemplate(value);
      setStep(2);
      setMessage("Đã tải template");
    } catch (err) {
      setMessage(err.response?.data?.message || "Không tải được template");
    } finally {
      setBusy(false);
    }
  }

  async function handleDeleteTemplate(templateId) {
    if (!templateId) return;
    const selected = templates.find((template) => String(template.id) === String(templateId));
    if (!window.confirm(`Xóa template "${selected?.name || templateId}"?`)) return;

    setBusy(true);
    try {
      await deleteTemplate(templateId);
      await refreshTemplates();
      if (String(selectedTemplateId) === String(templateId)) {
        setSelectedTemplateId("");
        setTemplateDetail(null);
        setDraft(null);
        setStep(0);
      }
      setMessage("Đã xóa template");
    } catch (err) {
      setMessage(err.response?.data?.message || "Xóa template thất bại");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="template-shell">
      <div className="template-manager panel">
        <div className="template-manager-head">
          <div>
            <h3>Template Builder</h3>
            <p className="muted">Quản lý mẫu Word, mapping dữ liệu ELK/PostgreSQL và xuất báo cáo SOC theo kỳ.</p>
          </div>
          <button className="ghost" type="button" onClick={() => setStep(0)}>
            New Template
          </button>
        </div>
        <div className="template-list">
          {templates.length === 0 && <span className="muted tiny">Chưa có template.</span>}
          {templates.map((template) => (
            <button
              className={`template-list-item ${String(selectedTemplateId) === String(template.id) ? "active" : ""}`}
              type="button"
              key={template.id}
              onClick={() => handleSelectTemplate(String(template.id))}
            >
              <span>
                <strong>{template.name}</strong>
                <small>#{template.id} · {template.template_type}</small>
              </span>
              <span
                className="delete-template"
                role="button"
                tabIndex={0}
                onClick={(event) => {
                  event.stopPropagation();
                  handleDeleteTemplate(template.id);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.stopPropagation();
                    handleDeleteTemplate(template.id);
                  }
                }}
              >
                Delete
              </span>
            </button>
          ))}
        </div>
      </div>

      {message && <div className="notice">{message}</div>}

      <div className="stepper">
        {STEP_LABELS.map((label, index) => (
          <button
            key={label}
            className={`step-pill ${step === index ? "active" : ""}`}
            type="button"
            onClick={() => setStep(index)}
            disabled={index > 0 && !draft}
          >
            {index + 1}. {label}
          </button>
        ))}
      </div>

      {step === 0 && <TemplateUploadPage onUpload={handleUpload} busy={busy} customers={customers} />}
      {step === 1 && (
        <TemplateExtractReviewPage
          draft={draft}
          onChange={setDraft}
          onSave={handleCreateTemplate}
          busy={busy}
        />
      )}
      {step === 2 && (
        <ReportBuilderPage
          templateDetail={templateDetail}
          draft={draft}
          onDraftChange={setDraft}
          onReload={() => loadTemplate(selectedTemplateId)}
          onSaved={(text) => setMessage(text)}
        />
      )}
      {step === 3 && (
        <FieldMappingPage
          templateDetail={templateDetail}
          draft={draft}
          onReload={() => loadTemplate(selectedTemplateId)}
          onSaved={(text) => setMessage(text)}
        />
      )}
      {step === 4 && (
        <ReportPreviewPage
          templateDetail={templateDetail}
          draft={draft}
          onReload={() => loadTemplate(selectedTemplateId)}
        />
      )}
    </div>
  );
}

function TemplateUploadPage({ onUpload, busy, customers = [] }) {
  const [name, setName] = useState("PVOIL Monthly SOC Report");
  const [customerId, setCustomerId] = useState("");
  const [files, setFiles] = useState([]);

  useEffect(() => {
    if (!customerId && customers.length > 0) {
      setCustomerId(String(customers[0].id));
    }
  }, [customers, customerId]);

  function submit(event) {
    event.preventDefault();
    const form = new FormData();
    form.append("name", name);
    form.append("customer_id", customerId);
    Array.from(files).forEach((file) => form.append("files", file));
    onUpload(form);
  }

  return (
    <form className="panel template-grid" onSubmit={submit}>
      <label>
        Template Name
        <input value={name} onChange={(event) => setName(event.target.value)} required />
      </label>
      <label>
        Customer
        <select value={customerId} onChange={(event) => setCustomerId(event.target.value)} required>
          {customers.length === 0 && <option value="">Chưa có customer</option>}
          {customers.map((customer) => (
            <option key={customer.id} value={customer.id}>
              {customer.code} - {customer.full_name || customer.name}
            </option>
          ))}
        </select>
      </label>
      <label className="template-file-input">
        Upload DOCX
        <input type="file" accept=".docx" multiple onChange={(event) => setFiles(event.target.files)} required />
      </label>
      <button className="primary" type="submit" disabled={busy}>
        {busy ? "Extracting..." : "Extract Template"}
      </button>
    </form>
  );
}

function TemplateExtractReviewPage({ draft, onChange, onSave, busy }) {
  if (!draft) return <EmptyPanel text="Chưa có draft template. Hãy upload DOCX trước." />;

  function updateSection(index, patch) {
    const sections = [...(draft.sections || [])];
    sections[index] = { ...sections[index], ...patch };
    onChange({ ...draft, sections });
  }

  function updateField(index, patch) {
    const fields = [...(draft.fields || [])];
    fields[index] = { ...fields[index], ...patch };
    onChange({ ...draft, fields });
  }

  return (
    <div className="template-review">
      <section className="panel">
        <div className="row-between">
          <h3>Detected Sections</h3>
          <button className="primary" type="button" onClick={() => onSave(draft)} disabled={busy}>
            Save Template
          </button>
        </div>
        <div className="review-list">
          {(draft.sections || []).map((section, index) => (
            <div className="review-item" key={section.section_key}>
              <label className="check-row">
                <input
                  type="checkbox"
                  checked={section.is_enabled !== false}
                  onChange={(event) => updateSection(index, { is_enabled: event.target.checked })}
                />
                Enabled
              </label>
              <input value={section.section_key} onChange={(event) => updateSection(index, { section_key: event.target.value })} />
              <input value={section.title || ""} onChange={(event) => updateSection(index, { title: event.target.value })} />
              <select value={section.section_type} onChange={(event) => updateSection(index, { section_type: event.target.value })}>
                <option value="text">text</option>
                <option value="table">table</option>
                <option value="cover">cover</option>
                <option value="toc">toc</option>
                <option value="appendix_list">appendix_list</option>
              </select>
            </div>
          ))}
        </div>
      </section>

      <section className="panel">
        <h3>Detected Fields</h3>
        <div className="review-list">
          {(draft.fields || []).map((field, index) => (
            <div className="review-item field-review" key={field.field_key}>
              <input value={field.field_key} onChange={(event) => updateField(index, { field_key: event.target.value })} />
              <input value={field.field_label || ""} onChange={(event) => updateField(index, { field_label: event.target.value })} />
              <select value={field.source_type} onChange={(event) => updateField(index, { source_type: event.target.value })}>
                <option value="manual">manual</option>
                <option value="postgres">postgres</option>
                <option value="elk">elk</option>
                <option value="computed">computed</option>
                <option value="ai_generated">ai_generated</option>
              </select>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function ReportBuilderPage({ templateDetail, draft, onDraftChange, onReload, onSaved }) {
  const templateId = templateDetail?.id;
  const [dragIndex, setDragIndex] = useState(null);

  if (!draft) return <EmptyPanel text="Chưa có template để build." />;

  function moveSection(from, to) {
    const sections = [...(draft.sections || [])];
    const [item] = sections.splice(from, 1);
    sections.splice(to, 0, item);
    onDraftChange({
      ...draft,
      sections: sections.map((section, index) => ({ ...section, order_index: index + 1 })),
      layout: { ...(draft.layout || {}), sections_order: sections.map((section) => section.section_key) }
    });
  }

  function updateSectionLocal(index, patch) {
    const sections = [...(draft.sections || [])];
    sections[index] = { ...sections[index], ...patch };
    onDraftChange({ ...draft, sections });
  }

  function addSection() {
    const sectionKey = `custom_section_${Date.now()}`;
    const sections = [
      ...(draft.sections || []),
      {
        section_key: sectionKey,
        title: "Section mới",
        section_type: "text",
        order_index: (draft.sections || []).length + 1,
        is_enabled: true,
        content_template: "Nhập nội dung section tại đây.",
        config: { show_title: true }
      }
    ];
    onDraftChange({
      ...draft,
      sections,
      layout: { ...(draft.layout || {}), sections_order: sections.map((section) => section.section_key) }
    });
  }

  async function saveSection(section) {
    if (!templateId) return;
    await updateTemplateSection(templateId, section.section_key, section);
    onSaved("Đã lưu section");
    onReload();
  }

  async function saveLayout() {
    if (!templateId) return;
    await updateTemplateLayout(templateId, {
      ...(draft.layout || {}),
      sections_order: (draft.sections || []).map((section) => section.section_key)
    });
    onSaved("Đã lưu layout");
    onReload();
  }

  return (
    <div className="resume-builder-layout">
      <section className="panel section-editor-panel">
        <div className="row-between">
          <h3>Sections</h3>
          <div className="button-row">
            <button className="ghost" type="button" onClick={addSection}>
              Add Section
            </button>
            <button className="primary" type="button" onClick={saveLayout} disabled={!templateId}>
              Save Layout
            </button>
          </div>
        </div>
        <div className="section-sort-list">
          {(draft.sections || []).map((section, index) => (
            <article
              className={`section-editor-card ${section.is_enabled === false ? "disabled" : ""}`}
              draggable
              key={section.section_key}
              onDragStart={() => setDragIndex(index)}
              onDragOver={(event) => event.preventDefault()}
              onDrop={() => {
                if (dragIndex !== null && dragIndex !== index) moveSection(dragIndex, index);
                setDragIndex(null);
              }}
            >
              <div className="section-card-head">
                <span className="drag-handle">::</span>
                <label className="check-row compact">
                  <input
                    type="checkbox"
                    checked={section.is_enabled !== false}
                    onChange={(event) => updateSectionLocal(index, { is_enabled: event.target.checked })}
                  />
                </label>
                <input value={section.title || ""} onChange={(event) => updateSectionLocal(index, { title: event.target.value })} />
                <select
                  value={section.section_type}
                  onChange={(event) => updateSectionLocal(index, { section_type: event.target.value })}
                >
                  <option value="text">text</option>
                  <option value="table">table</option>
                  <option value="cover">cover</option>
                  <option value="toc">toc</option>
                  <option value="appendix_list">appendix_list</option>
                </select>
                <button className="ghost" type="button" onClick={() => saveSection(section)} disabled={!templateId}>
                  Save
                </button>
              </div>
              <textarea
                rows={5}
                value={section.content_template || ""}
                onChange={(event) => updateSectionLocal(index, { content_template: event.target.value })}
                placeholder="Dùng placeholder như {{customer_full_name}}, {{monitoring_period}}..."
              />
            </article>
          ))}
        </div>
      </section>

      <section className="builder-preview-stage">
        <div className="word-preview-toolbar">
          <strong>Live Word Layout</strong>
          <span className="muted tiny">A4 preview từ section đang edit</span>
        </div>
        <WordLikeHtmlPreview draft={draft} />
      </section>
    </div>
  );
}

function WordLikeHtmlPreview({ draft, html }) {
  const content = html || renderDraftHtml(draft);
  return (
    <div className="word-stage">
      <div className="word-page" dangerouslySetInnerHTML={{ __html: content }} />
    </div>
  );
}

function FieldMappingPage({ templateDetail, draft, onReload, onSaved }) {
  const templateId = templateDetail?.id;
  const [editing, setEditing] = useState({});

  if (!draft) return <EmptyPanel text="Chưa có template để mapping." />;

  async function saveField(field) {
    if (!templateId) return;
    const merged = { ...field, ...(editing[field.field_key] || {}) };
    await updateTemplateFieldMapping(templateId, field.field_key, {
      source_type: merged.source_type,
      source_config: normalizeJsonInput(merged.source_config),
      default_value: merged.default_value,
      required: merged.required
    });
    onSaved(`Đã lưu mapping ${field.field_key}`);
    onReload();
  }

  return (
    <section className="panel">
      <h3>Field Mapping</h3>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Placeholder</th>
              <th>Source</th>
              <th>Default</th>
              <th>Source Config JSON</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {(draft.fields || []).map((field) => {
              const current = { ...field, ...(editing[field.field_key] || {}) };
              return (
                <tr key={field.field_key}>
                  <td>
                    <strong>{`{{${field.field_key}}}`}</strong>
                    <div className="muted tiny">{field.field_label}</div>
                  </td>
                  <td>
                    <select
                      value={current.source_type}
                      onChange={(event) =>
                        setEditing((prev) => ({ ...prev, [field.field_key]: { ...current, source_type: event.target.value } }))
                      }
                    >
                      <option value="manual">manual</option>
                      <option value="postgres">postgres</option>
                      <option value="elk">elk</option>
                      <option value="computed">computed</option>
                      <option value="ai_generated">ai_generated</option>
                    </select>
                  </td>
                  <td>
                    <input
                      value={formatInputValue(current.default_value)}
                      onChange={(event) =>
                        setEditing((prev) => ({ ...prev, [field.field_key]: { ...current, default_value: event.target.value } }))
                      }
                    />
                  </td>
                  <td>
                    <textarea
                      rows={3}
                      value={formatSourceConfig(current.source_config)}
                      onChange={(event) =>
                        setEditing((prev) => ({ ...prev, [field.field_key]: { ...current, source_config: event.target.value } }))
                      }
                    />
                  </td>
                  <td>
                    <button className="ghost" type="button" onClick={() => saveField(field)} disabled={!templateId}>
                      Save
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function ReportPreviewPage({ templateDetail, draft, onReload }) {
  const templateId = templateDetail?.id;
  const wordPreviewRef = useRef(null);
  const defaultStart = "2026-04-30T00:00:00.000Z";
  const defaultEnd = "2026-05-31T23:59:59.999Z";
  const [context, setContext] = useState({
    customer_id: templateDetail?.customer_id || 1,
    monitoring_start: defaultStart,
    monitoring_end: defaultEnd,
    report_month: inferReportMonth(defaultEnd),
    report_year: inferReportYear(defaultEnd),
    overrides: { security_status: "An toàn" }
  });
  const [preview, setPreview] = useState(null);
  const [activePreviewTab, setActivePreviewTab] = useState("fields");
  const [fieldViewMode, setFieldViewMode] = useState("markdown");
  const [wordPreviewReady, setWordPreviewReady] = useState(false);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function runPreview() {
    if (!templateId) return;
    setBusy(true);
    try {
      const data = await previewTemplate(templateId, context);
      setPreview(data);
      setActivePreviewTab("fields");
      setMessage(data.errors?.length ? "Preview có lỗi field bắt buộc" : "Preview đã render");
    } catch (err) {
      setMessage(err.response?.data?.message || "Preview thất bại");
    } finally {
      setBusy(false);
    }
  }

  async function runExport(format, renderWordPreview = false) {
    if (!templateId) return;
    setBusy(true);
    try {
      const data = await exportTemplate(templateId, { ...context, format });
      if (renderWordPreview && data.download_url && wordPreviewRef.current) {
        const blob = await downloadGeneratedTemplateReport(data.download_url);
        wordPreviewRef.current.innerHTML = "";
        await renderAsync(blob, wordPreviewRef.current, null, {
          className: "docx-rendered",
          inWrapper: false,
          ignoreWidth: false,
          ignoreHeight: false,
          renderHeaders: true,
          renderFooters: true
        });
        setWordPreviewReady(true);
        setActivePreviewTab("format");
      }
      setMessage(`Export thành công: ${data.file_name || data.file_path}`);
    } catch (err) {
      setMessage(err.response?.data?.message || "Export thất bại");
    } finally {
      setBusy(false);
    }
  }

  async function runTemplateize() {
    if (!templateId) return;
    setBusy(true);
    try {
      const data = await templateizeTemplate(templateId, {
        ...context,
        set_as_source: true
      });
      const quality =
        data.can_use_as_source
          ? "Đã cấy placeholder vào DOCX."
          : "Chưa cấy được placeholder; file này KHÔNG được dùng làm source export để tránh xuất sai báo cáo cũ.";
      setMessage(`Đã tạo DOCX template: ${data.file_name}. ${quality}`);
      if (data.can_use_as_source && onReload) await onReload();
    } catch (err) {
      setMessage(err.response?.data?.message || "Tạo DOCX template thất bại");
    } finally {
      setBusy(false);
    }
  }

  if (!draft) return <EmptyPanel text="Chưa có template để preview." />;

  return (
    <div className="preview-layout">
      <section className="panel preview-controls">
        <h3>Preview Context</h3>
        <div className="workflow-note">
          <strong>Quy trình đúng</strong>
          <span>
            1. Preview để kiểm tra fields:value. 2. Create DOCX Template nếu file gốc là báo cáo tay cũ.
            3. Generate Word Preview để xem file Word sau merge. 4. Export DOCX khi đã ổn.
          </span>
        </div>
        <label>
          Customer ID
          <input value={context.customer_id} onChange={(event) => setContext({ ...context, customer_id: event.target.value })} />
        </label>
        <label>
          Monitoring Start
          <input
            value={context.monitoring_start}
            onChange={(event) => setContext(syncReportPeriod({ ...context, monitoring_start: event.target.value }))}
          />
        </label>
        <label>
          Monitoring End
          <input
            value={context.monitoring_end}
            onChange={(event) => setContext(syncReportPeriod({ ...context, monitoring_end: event.target.value }))}
          />
        </label>
        <label>
          Report Month
          <input
            value={context.report_month}
            onChange={(event) => setContext({ ...context, report_month: event.target.value })}
          />
        </label>
        <label>
          Report Year
          <input
            value={context.report_year}
            onChange={(event) => setContext({ ...context, report_year: event.target.value })}
          />
        </label>
        <div className="button-row">
          <button className="primary" type="button" onClick={runPreview} disabled={!templateId || busy}>
            Preview
          </button>
          <button className="ghost" type="button" onClick={runTemplateize} disabled={!templateId || busy}>
            Create DOCX Template
          </button>
          <button className="ghost" type="button" onClick={() => runExport("docx", true)} disabled={!templateId || busy}>
            Generate Word Preview
          </button>
          <button className="ghost" type="button" onClick={() => runExport("docx", false)} disabled={!templateId || busy}>
            Export DOCX
          </button>
          <button className="ghost" type="button" onClick={() => runExport("xlsx", false)} disabled={!templateId || busy}>
            Export XLSX
          </button>
        </div>
        {message && <div className="notice">{message}</div>}
        {preview?.warnings?.length > 0 && <pre className="json-box">{JSON.stringify(preview.warnings, null, 2)}</pre>}
        {preview?.errors?.length > 0 && <pre className="json-box error-box">{JSON.stringify(preview.errors, null, 2)}</pre>}
      </section>
      <section className="panel report-canvas">
        <div className="preview-tabs">
          <button
            className={`step-pill ${activePreviewTab === "fields" ? "active" : ""}`}
            type="button"
            onClick={() => setActivePreviewTab("fields")}
          >
            Fields Value
          </button>
          <button
            className={`step-pill ${activePreviewTab === "format" ? "active" : ""}`}
            type="button"
            onClick={() => setActivePreviewTab("format")}
          >
            Word Preview
          </button>
        </div>

        {activePreviewTab === "fields" ? (
          <div className="fields-preview">
            <div className="button-row">
              <button
                className={`ghost ${fieldViewMode === "markdown" ? "active-soft" : ""}`}
                type="button"
                onClick={() => setFieldViewMode("markdown")}
              >
                Markdown
              </button>
              <button
                className={`ghost ${fieldViewMode === "json" ? "active-soft" : ""}`}
                type="button"
                onClick={() => setFieldViewMode("json")}
              >
                JSON
              </button>
            </div>
            <pre className="json-box values-box">
              {preview
                ? fieldViewMode === "json"
                  ? JSON.stringify(preview.values_json || preview.values || {}, null, 2)
                  : preview.values_markdown || "# Resolved Fields\n\nChưa có dữ liệu."
                : "Bấm Preview để xem fields:value trước khi merge vào template."}
            </pre>
          </div>
        ) : (
          <div className="format-preview">
            <div className="word-preview-hint">
              <strong>DOCX render preview</strong>
              <span className="muted tiny">
                Bấm Generate Word Preview để merge dữ liệu vào DOCX gốc và render ngay tại đây.
              </span>
            </div>
            <div ref={wordPreviewRef} className={`docx-preview-host ${wordPreviewReady ? "ready" : ""}`} />
            {!wordPreviewReady && <WordLikeHtmlPreview draft={draft} html={preview?.html} />}
          </div>
        )}
      </section>
    </div>
  );
}

function EmptyPanel({ text }) {
  return <div className="panel muted">{text}</div>;
}

function normalizeJsonInput(value) {
  if (!value) return {};
  if (typeof value === "object") return value;
  try {
    return JSON.parse(value);
  } catch (_) {
    return {};
  }
}

function formatSourceConfig(value) {
  if (typeof value === "string") return value;
  return JSON.stringify(value || {}, null, 2);
}

function formatInputValue(value) {
  if (value === null || value === undefined) return "";
  return typeof value === "object" ? JSON.stringify(value) : String(value);
}

function renderDraftHtml(draft) {
  const sections = [...(draft?.sections || [])]
    .filter((section) => section.is_enabled !== false)
    .sort((a, b) => Number(a.order_index || 0) - Number(b.order_index || 0));

  if (sections.length === 0) {
    return "<p class=\"muted\">Chưa có section nào.</p>";
  }

  return sections
    .map((section) => {
      const title = section.config?.show_title === false ? "" : `<h2>${escapeHtml(section.title || section.section_key)}</h2>`;
      if (["table", "appendix_list"].includes(section.section_type)) {
        return `<section class="report-section">${title}<table><thead><tr><th>Field</th><th>Value</th></tr></thead><tbody><tr><td>${escapeHtml(section.data_binding?.field_key || section.section_key)}</td><td>{{${escapeHtml(section.data_binding?.field_key || section.section_key)}}}</td></tr></tbody></table></section>`;
      }
      const content = escapeHtml(section.content_template || "").replace(/\n/g, "<br />");
      return `<section class="report-section ${section.section_type === "cover" ? "report-cover" : ""}">${title}<p>${content}</p></section>`;
    })
    .join("");
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function syncReportPeriod(nextContext) {
  return {
    ...nextContext,
    report_month: inferReportMonth(nextContext.monitoring_end),
    report_year: inferReportYear(nextContext.monitoring_end)
  };
}

function inferReportMonth(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return String(date.getUTCMonth() + 1).padStart(2, "0");
}

function inferReportYear(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return String(date.getUTCFullYear());
}

export default TemplateBuilderPage;
