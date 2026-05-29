import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import Sidebar from "../components/Sidebar";
import Topbar from "../components/Topbar";
import ReportForm from "../components/ReportForm";
import ReportTable from "../components/ReportTable";
import ReportEditor from "../components/ReportEditor";
import ElkDashboard from "../components/ElkDashboard";
import TemplateBuilderPage from "./TemplateBuilderPage";
import {
  createReport,
  downloadFile,
  exportElkWord,
  exportReport,
  getElkAlerts,
  getElkFilterOptions,
  getReport,
  listReports,
  updateReport
} from "../services/reportService";

function DashboardPage() {
  const { logout } = useAuth();
  const [activeView, setActiveView] = useState("reports");
  const [reports, setReports] = useState([]);
  const [selectedReport, setSelectedReport] = useState(null);
  const [elkAlerts, setElkAlerts] = useState([]);
  const [elkMeta, setElkMeta] = useState({ total: 0, page: 1, size: 10, totalPages: 1 });
  const [elkQuery, setElkQuery] = useState({});
  const [loadingElk, setLoadingElk] = useState(false);
  const [elkError, setElkError] = useState("");
  const [elkLastUpdated, setElkLastUpdated] = useState(null);
  const [elkFilterOptions, setElkFilterOptions] = useState({
    tenants: [],
    analysts: [],
    severities: [],
    priorities: []
  });
  const [message, setMessage] = useState("");
  const [loadingCreate, setLoadingCreate] = useState(false);
  const [loadingAction, setLoadingAction] = useState(false);

  async function loadReports() {
    const data = await listReports();
    setReports(data);
  }

  useEffect(() => {
    loadReports().catch(() => {
      setMessage("Failed to load reports");
    });
  }, []);

  async function loadElkAlerts(query = elkQuery) {
    setElkQuery(query);
    setLoadingElk(true);
    try {
      const data = await getElkAlerts(query);
      const options = await getElkFilterOptions(query);
      setElkAlerts(data.rows);
      setElkFilterOptions(options);
      setElkMeta({
        total: data.total,
        page: data.page,
        size: data.size,
        totalPages: data.totalPages
      });
      setElkError("");
      setElkLastUpdated(new Date().toISOString());
    } catch (err) {
      setElkError(err.response?.data?.message || "Failed to load ELK alerts");
    } finally {
      setLoadingElk(false);
    }
  }

  useEffect(() => {
    if (activeView !== "elk") return undefined;
    loadElkAlerts(elkQuery);
    const timer = setInterval(() => loadElkAlerts(elkQuery), 30000);
    return () => clearInterval(timer);
  }, [activeView, elkQuery]);

  async function handleElkExportWord(query) {
    try {
      await exportElkWord(query);
      setElkError("");
    } catch (err) {
      setElkError(err.response?.data?.message || "Failed to export Word");
    }
  }

  async function handleSelect(reportId) {
    try {
      const report = await getReport(reportId);
      setSelectedReport(report);
      setMessage("");
    } catch (_) {
      setMessage("Cannot load report details");
    }
  }

  async function handleCreate(formData) {
    try {
      setLoadingCreate(true);
      const report = await createReport(formData);
      await loadReports();
      await handleSelect(report.id);
      setMessage("Report created and preview loaded");
    } catch (err) {
      setMessage(err.response?.data?.message || "Create report failed");
    } finally {
      setLoadingCreate(false);
    }
  }

  async function handleSave(reportId, content) {
    try {
      setLoadingAction(true);
      const updated = await updateReport(reportId, { content });
      await loadReports();
      const reloaded = await getReport(updated.id);
      setSelectedReport(reloaded);
      setMessage("Report updated successfully");
    } catch (err) {
      setMessage(err.response?.data?.message || "Update failed");
    } finally {
      setLoadingAction(false);
    }
  }

  async function handleExport(reportId, format) {
    setLoadingAction(true);
    try {
      const file = await exportReport(reportId, format);
      setMessage(`Export successful: ${file.file_name}`);
      return file;
    } catch (err) {
      setMessage(err.response?.data?.message || "Export failed");
      throw err;
    } finally {
      setLoadingAction(false);
    }
  }

  async function handleDownload(fileId, fileName) {
    try {
      await downloadFile(fileId, fileName);
    } catch (err) {
      setMessage(err.response?.data?.message || "Download failed");
    }
  }

  return (
    <main className="dashboard-layout">
      <Sidebar onLogout={logout} activeView={activeView} onViewChange={setActiveView} />

      <section className="dashboard-main">
        <Topbar
          title={
            activeView === "reports"
              ? "Automation Report Dashboard"
              : activeView === "elk"
                ? "ELK Monitoring Dashboard"
                : "Template Builder"
          }
          subtitle={
            activeView === "reports"
              ? "Create, preview, edit, export and download reports"
              : activeView === "elk"
                ? "Track alert activity with filters by severity, tenant, analyst and MITRE fields"
                : "Build reusable SOC report templates with DOCX extraction, mapping and export"
          }
        />

        {activeView === "reports" && message && <div className="notice">{message}</div>}

        {activeView === "reports" ? (
          <div className="dashboard-grid">
            <div className="left-col">
              <ReportForm onCreate={handleCreate} loading={loadingCreate} />
              <ReportTable
                reports={reports}
                selectedId={selectedReport?.id}
                onSelect={handleSelect}
              />
            </div>

            <ReportEditor
              report={selectedReport}
              onSave={handleSave}
              onExport={handleExport}
              onDownload={handleDownload}
              actionLoading={loadingAction}
            />
          </div>
        ) : activeView === "elk" ? (
          <ElkDashboard
            alerts={elkAlerts}
            meta={elkMeta}
            filterOptions={elkFilterOptions}
            loading={loadingElk}
            error={elkError}
            onRefresh={loadElkAlerts}
            onExportWord={handleElkExportWord}
            lastUpdated={elkLastUpdated}
          />
        ) : (
          <TemplateBuilderPage />
        )}
      </section>
    </main>
  );
}

export default DashboardPage;
