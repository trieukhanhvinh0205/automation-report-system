import { useEffect, useRef, useState } from "react";
import { renderAsync } from "docx-preview";
import {
  Button,
  Card,
  Checkbox,
  Dialog,
  DialogActions,
  DialogBody,
  DialogContent,
  DialogSurface,
  DialogTitle,
  DialogTrigger,
  Field,
  Input,
  MessageBar,
  MessageBarBody,
  Select,
  Tab,
  TabList,
  Text,
  Textarea
} from "@fluentui/react-components";
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
import { EmptyState } from "../components/ui/Feedback";

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
      <Card className="template-manager panel">
        <div className="template-manager-head">
          <div>
            <h3>Template Builder</h3>
            <Text color="secondary">Quản lý mẫu Word, mapping dữ liệu ELK/PostgreSQL và xuất báo cáo SOC theo kỳ.</Text>
          </div>
          <Button type="button" onClick={() => setStep(0)}>
            New Template
          </Button>
        </div>
        <div className="template-list">
          {templates.length === 0 && <EmptyState title="Chưa có template" description="Upload DOCX để tạo mẫu báo cáo đầu tiên." />}
          {templates.map((template) => (
            <Card
              className={`template-list-item ${String(selectedTemplateId) === String(template.id) ? "active" : ""}`}
              key={template.id}
              onClick={() => handleSelectTemplate(String(template.id))}
            >
              <span>
                <strong>{template.name}</strong>
                <small>#{template.id} · {template.template_type}</small>
              </span>
              <Dialog>
                <DialogTrigger disableButtonEnhancement>
                  <Button
                    appearance="subtle"
                    size="small"
                    onClick={(event) => event.stopPropagation()}
                  >
                    Delete
                  </Button>
                </DialogTrigger>
                <DialogSurface onClick={(event) => event.stopPropagation()}>
                  <DialogBody>
                    <DialogTitle>Xóa template?</DialogTitle>
                    <DialogContent>Template "{template.name}" và các mapping/layout liên quan sẽ bị xóa.</DialogContent>
                    <DialogActions>
                      <DialogTrigger disableButtonEnhancement>
                        <Button appearance="secondary">Cancel</Button>
                      </DialogTrigger>
                      <Button
                        appearance="primary"
                        onClick={(event) => {
                          event.stopPropagation();
                          handleDeleteTemplate(template.id);
                        }}
                      >
                        Delete
                      </Button>
                    </DialogActions>
                  </DialogBody>
                </DialogSurface>
              </Dialog>
            </Card>
          ))}
        </div>
      </Card>

      {message && (
        <MessageBar intent="info">
          <MessageBarBody>{message}</MessageBarBody>
        </MessageBar>
      )}

      <TabList selectedValue={String(step)} onTabSelect={(_, data) => setStep(Number(data.value))}>
        {STEP_LABELS.map((label, index) => (
          <Tab key={label} value={String(index)} disabled={index > 0 && !draft}>
            {index + 1}. {label}
          </Tab>
        ))}
      </TabList>

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
    <Card as="form" className="panel template-grid" onSubmit={submit}>
      <Field label="Template Name" required>
        <Input value={name} onChange={(_, data) => setName(data.value)} required />
      </Field>
      <Field label="Customer" required>
        <Select value={customerId} onChange={(event) => setCustomerId(event.target.value)} required>
          {customers.length === 0 && <option value="">Chưa có customer</option>}
          {customers.map((customer) => (
            <option key={customer.id} value={customer.id}>
              {customer.code} - {customer.full_name || customer.name}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Upload DOCX" required className="template-file-input">
        <input className="fluent-file-input" type="file" accept=".docx" multiple onChange={(event) => setFiles(event.target.files)} required />
      </Field>
      <Button appearance="primary" type="submit" disabled={busy}>
        {busy ? "Extracting..." : "Extract Template"}
      </Button>
    </Card>
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
      <Card className="panel">
        <div className="row-between">
          <h3>Detected Sections</h3>
          <Button appearance="primary" type="button" onClick={() => onSave(draft)} disabled={busy}>
            Save Template
          </Button>
        </div>
        <div className="review-list">
          {(draft.sections || []).map((section, index) => (
            <div className="review-item" key={section.section_key}>
              <Checkbox
                label="Enabled"
                checked={section.is_enabled !== false}
                onChange={(_, data) => updateSection(index, { is_enabled: Boolean(data.checked) })}
              />
              <Input value={section.section_key} onChange={(_, data) => updateSection(index, { section_key: data.value })} />
              <Input value={section.title || ""} onChange={(_, data) => updateSection(index, { title: data.value })} />
              <Select value={section.section_type} onChange={(event) => updateSection(index, { section_type: event.target.value })}>
                <option value="text">text</option>
                <option value="table">table</option>
                <option value="cover">cover</option>
                <option value="toc">toc</option>
                <option value="appendix_list">appendix_list</option>
              </Select>
            </div>
          ))}
        </div>
      </Card>

      <Card className="panel">
        <h3>Detected Fields</h3>
        <div className="review-list">
          {(draft.fields || []).map((field, index) => (
            <div className="review-item field-review" key={field.field_key}>
              <Input value={field.field_key} onChange={(_, data) => updateField(index, { field_key: data.value })} />
              <Input value={field.field_label || ""} onChange={(_, data) => updateField(index, { field_label: data.value })} />
              <Select value={field.source_type} onChange={(event) => updateField(index, { source_type: event.target.value })}>
                <option value="manual">manual</option>
                <option value="postgres">postgres</option>
                <option value="elk">elk</option>
                <option value="computed">computed</option>
                <option value="ai_generated">ai_generated</option>
              </Select>
            </div>
          ))}
        </div>
      </Card>
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
      <Card className="panel section-editor-panel">
        <div className="row-between">
          <h3>Sections</h3>
          <div className="button-row">
            <Button type="button" onClick={addSection}>
              Add Section
            </Button>
            <Button appearance="primary" type="button" onClick={saveLayout} disabled={!templateId}>
              Save Layout
            </Button>
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
                <Checkbox
                  checked={section.is_enabled !== false}
                  onChange={(_, data) => updateSectionLocal(index, { is_enabled: Boolean(data.checked) })}
                />
                <Input value={section.title || ""} onChange={(_, data) => updateSectionLocal(index, { title: data.value })} />
                <Select
                  value={section.section_type}
                  onChange={(event) => updateSectionLocal(index, { section_type: event.target.value })}
                >
                  <option value="text">text</option>
                  <option value="table">table</option>
                  <option value="cover">cover</option>
                  <option value="toc">toc</option>
                  <option value="appendix_list">appendix_list</option>
                </Select>
                <Button type="button" onClick={() => saveSection(section)} disabled={!templateId}>
                  Save
                </Button>
              </div>
              <Textarea
                rows={5}
                value={section.content_template || ""}
                onChange={(_, data) => updateSectionLocal(index, { content_template: data.value })}
                placeholder="Dùng placeholder như {{customer_full_name}}, {{monitoring_period}}..."
              />
            </article>
          ))}
        </div>
      </Card>

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
    <Card className="panel">
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
                    <Select
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
                    </Select>
                  </td>
                  <td>
                    <Input
                      value={formatInputValue(current.default_value)}
                      onChange={(_, data) =>
                        setEditing((prev) => ({ ...prev, [field.field_key]: { ...current, default_value: data.value } }))
                      }
                    />
                  </td>
                  <td>
                    <Textarea
                      rows={3}
                      value={formatSourceConfig(current.source_config)}
                      onChange={(_, data) =>
                        setEditing((prev) => ({ ...prev, [field.field_key]: { ...current, source_config: data.value } }))
                      }
                    />
                  </td>
                  <td>
                    <Button type="button" onClick={() => saveField(field)} disabled={!templateId}>
                      Save
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
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
      } else if (data.download_url) {
        const blob = await downloadGeneratedTemplateReport(data.download_url);
        downloadBlob(blob, data.file_name || `report.${format}`);
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
      const data = await  templateizeTemplate(templateId, {
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
      <Card className="panel preview-controls">
        <h3>Preview Context</h3>
        <div className="workflow-note">
          <strong>Quy trình đúng</strong>
          <span>
            1. Preview để kiểm tra fields:value. 2. Create DOCX Template nếu file gốc là báo cáo tay cũ.
            3. Generate Word Preview để xem file Word sau merge. 4. Export DOCX khi đã ổn.
          </span>
        </div>
        <Field label="Customer ID">
          <Input value={String(context.customer_id)} onChange={(_, data) => setContext({ ...context, customer_id: data.value })} />
        </Field>
        <Field label="Monitoring Start">
          <Input
            value={context.monitoring_start}
            onChange={(_, data) => setContext(syncReportPeriod({ ...context, monitoring_start: data.value }))}
          />
        </Field>
        <Field label="Monitoring End">
          <Input
            value={context.monitoring_end}
            onChange={(_, data) => setContext(syncReportPeriod({ ...context, monitoring_end: data.value }))}
          />
        </Field>
        <Field label="Report Month">
          <Input
            value={context.report_month}
            onChange={(_, data) => setContext({ ...context, report_month: data.value })}
          />
        </Field>
        <Field label="Report Year">
          <Input
            value={context.report_year}
            onChange={(_, data) => setContext({ ...context, report_year: data.value })}
          />
        </Field>
        <div className="button-row">
          <Button appearance="primary" type="button" onClick={runPreview} disabled={!templateId || busy}>
            Preview
          </Button>
          <Button type="button" onClick={runTemplateize} disabled={!templateId || busy}>
            Create DOCX Template
          </Button>
          <Button type="button" onClick={() => runExport("docx", true)} disabled={!templateId || busy}>
            Generate Word Preview
          </Button>
          <Button type="button" onClick={() => runExport("docx", false)} disabled={!templateId || busy}>
            Export DOCX
          </Button>
          <Button type="button" onClick={() => runExport("xlsx", false)} disabled={!templateId || busy}>
            Export XLSX
          </Button>
        </div>
        {message && (
          <MessageBar intent="info">
            <MessageBarBody>{message}</MessageBarBody>
          </MessageBar>
        )}
        {preview?.warnings?.length > 0 && <pre className="json-box">{JSON.stringify(preview.warnings, null, 2)}</pre>}
        {preview?.errors?.length > 0 && <pre className="json-box error-box">{JSON.stringify(preview.errors, null, 2)}</pre>}
      </Card>
      <Card className="panel report-canvas">
        <TabList selectedValue={activePreviewTab} onTabSelect={(_, data) => setActivePreviewTab(data.value)}>
          <Tab value="fields">Fields Value</Tab>
          <Tab value="format">Word Preview</Tab>
        </TabList>

        {activePreviewTab === "fields" ? (
          <div className="fields-preview">
            <div className="button-row">
              <Button
                appearance={fieldViewMode === "markdown" ? "primary" : "secondary"}
                type="button"
                onClick={() => setFieldViewMode("markdown")}
              >
                Markdown
              </Button>
              <Button
                appearance={fieldViewMode === "json" ? "primary" : "secondary"}
                type="button"
                onClick={() => setFieldViewMode("json")}
              >
                JSON
              </Button>
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
      </Card>
    </div>
  );
}

function EmptyPanel({ text }) {
  return (
    <Card className="panel">
      <EmptyState title={text} />
    </Card>
  );
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

function downloadBlob(blob, fileName) {
  const blobUrl = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = blobUrl;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(blobUrl);
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
