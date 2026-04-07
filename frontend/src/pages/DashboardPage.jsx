import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import Sidebar from "../components/Sidebar";
import Topbar from "../components/Topbar";
import ReportForm from "../components/ReportForm";
import ReportTable from "../components/ReportTable";
import ReportEditor from "../components/ReportEditor";
import {
  createReport,
  downloadFile,
  exportReport,
  getReport,
  listReports,
  updateReport
} from "../services/reportService";

function DashboardPage() {
  const { logout } = useAuth();
  const [reports, setReports] = useState([]);
  const [selectedReport, setSelectedReport] = useState(null);
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
      <Sidebar onLogout={logout} />

      <section className="dashboard-main">
        <Topbar
          title="Automation Report Dashboard"
          subtitle="Create, preview, edit, export and download reports"
        />

        {message && <div className="notice">{message}</div>}

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
      </section>
    </main>
  );
}

export default DashboardPage;
