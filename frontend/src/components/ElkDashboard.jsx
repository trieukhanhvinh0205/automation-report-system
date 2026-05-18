import { useEffect, useMemo, useState } from "react";
import { formatDate } from "../utils/format";

function toLabel(value) {
  if (value === null || value === undefined || value === "") return "Unknown";
  return String(value);
}

function normalizeList(value) {
  if (Array.isArray(value)) return value.filter(Boolean).map(String);
  if (value === null || value === undefined || value === "") return [];
  return [String(value)];
}

function includesText(value, search) {
  return String(value || "").toLowerCase().includes(search.toLowerCase());
}

function toSeverityClass(value) {
  return `severity-${toLabel(value).toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
}

function sortByField(items, sortField, sortDirection) {
  const direction = sortDirection === "asc" ? 1 : -1;
  return [...items].sort((a, b) => {
    if (sortField === "timestamp") {
      const aTime = new Date(a.timestamp || 0).getTime();
      const bTime = new Date(b.timestamp || 0).getTime();
      return (aTime - bTime) * direction;
    }
    const aValue = String(a[sortField] || "").toLowerCase();
    const bValue = String(b[sortField] || "").toLowerCase();
    return aValue.localeCompare(bValue) * direction;
  });
}

function ElkDashboard({ alerts, loading, error, onRefresh, onExportWord, lastUpdated }) {
  const [tenantFilter, setTenantFilter] = useState("all");
  const [analystFilter, setAnalystFilter] = useState("all");
  const [severityFilter, setSeverityFilter] = useState("all");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [search, setSearch] = useState("");

  const [showAdvanced, setShowAdvanced] = useState(false);
  const [statusFilter, setStatusFilter] = useState("all");
  const [slaFilter, setSlaFilter] = useState("all");
  const [platformFilter, setPlatformFilter] = useState("");
  const [resolutionFilter, setResolutionFilter] = useState("");
  const [reasonCloseCase, setReasonCloseCase] = useState("");
  const [messageConfirmCase, setMessageConfirmCase] = useState("");
  const [soarId, setSoarId] = useState("");
  const [siemAlertId, setSiemAlertId] = useState("");
  const [soarCaseName, setSoarCaseName] = useState("");
  const [tacticsFilter, setTacticsFilter] = useState("");
  const [techniquesFilter, setTechniquesFilter] = useState("");
  const [q, setQ] = useState("");

  const [sortField, setSortField] = useState("timestamp");
  const [sortDirection, setSortDirection] = useState("desc");
  const [page, setPage] = useState(1);
  const pageSize = 10;

  const tenantOptions = useMemo(() => {
    const values = new Set(alerts.map((item) => toLabel(item.tenant)));
    return ["all", ...Array.from(values).sort((a, b) => a.localeCompare(b))];
  }, [alerts]);

  const analystOptions = useMemo(() => {
    const values = new Set(alerts.map((item) => toLabel(item.analyst)));
    return ["all", ...Array.from(values).sort((a, b) => a.localeCompare(b))];
  }, [alerts]);

  const filteredAlerts = useMemo(() => {
    return alerts.filter((item) => {
      const passTenant = tenantFilter === "all" || toLabel(item.tenant) === tenantFilter;
      const passAnalyst = analystFilter === "all" || toLabel(item.analyst) === analystFilter;
      const passSeverity = severityFilter === "all" || toLabel(item.severity) === severityFilter;
      const passPriority = priorityFilter === "all" || toLabel(item.priority) === priorityFilter;
      const passSearch =
        !search ||
        includesText(item.alertName, search) ||
        includesText(item.tenant, search) ||
        normalizeList(item.tactics).some((value) => includesText(value, search)) ||
        normalizeList(item.techniques).some((value) => includesText(value, search));

      return passTenant && passAnalyst && passSeverity && passPriority && passSearch;
    });
  }, [alerts, analystFilter, priorityFilter, search, severityFilter, tenantFilter]);

  useEffect(() => {
    setPage(1);
  }, [tenantFilter, analystFilter, severityFilter, priorityFilter, search, sortField, sortDirection]);

  const sortedAlerts = useMemo(() => {
    return sortByField(filteredAlerts, sortField, sortDirection);
  }, [filteredAlerts, sortDirection, sortField]);

  const totalPages = useMemo(() => {
    return Math.max(1, Math.ceil(sortedAlerts.length / pageSize));
  }, [sortedAlerts.length]);

  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages);
    }
  }, [page, totalPages]);

  const pageAlerts = useMemo(() => {
    const startIndex = (page - 1) * pageSize;
    return sortedAlerts.slice(startIndex, startIndex + pageSize);
  }, [page, sortedAlerts]);

  const severityStats = useMemo(() => {
    return filteredAlerts.reduce((acc, item) => {
      const key = toLabel(item.severity);
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});
  }, [filteredAlerts]);

  const statEntries = Object.entries(severityStats).sort((a, b) => b[1] - a[1]);

  function handleSort(field) {
    if (sortField === field) {
      setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
      return;
    }
    setSortField(field);
    setSortDirection(field === "timestamp" ? "desc" : "asc");
  }

  function resetFilters() {
    setTenantFilter("all");
    setAnalystFilter("all");
    setSeverityFilter("all");
    setPriorityFilter("all");
    setStartTime("");
    setEndTime("");
    setSearch("");
    setStatusFilter("all");
    setSlaFilter("all");
    setPlatformFilter("");
    setResolutionFilter("");
    setReasonCloseCase("");
    setMessageConfirmCase("");
    setSoarId("");
    setSiemAlertId("");
    setSoarCaseName("");
    setTacticsFilter("");
    setTechniquesFilter("");
    setQ("");
    setPage(1);
  }

  function buildQueryForBackend() {
    const query = {};
    if (startTime) query.startTime = new Date(startTime).toISOString();
    if (endTime) query.endTime = new Date(endTime).toISOString();
    if (severityFilter !== "all") query.severity = severityFilter;
    if (tenantFilter !== "all") query.tenant = tenantFilter;
    if (analystFilter !== "all") query.analyst = analystFilter;
    if (priorityFilter !== "all") query.priority = priorityFilter;
    if (search) query.alertName = search;

    if (statusFilter !== "all") query.status = statusFilter;
    if (slaFilter !== "all") query.sla = slaFilter;
    if (platformFilter) query.platform = platformFilter;
    if (resolutionFilter) query.resolution = resolutionFilter;
    if (reasonCloseCase) query.reasonCloseCase = reasonCloseCase;
    if (messageConfirmCase) query.messageConfirmCase = messageConfirmCase;
    if (soarId) query.soarId = soarId;
    if (siemAlertId) query.siemAlertId = siemAlertId;
    if (soarCaseName) query.soarCaseName = soarCaseName;
    if (tacticsFilter) query.tactics = tacticsFilter;
    if (techniquesFilter) query.techniques = techniquesFilter;
    if (q) query.q = q;

    return query;
  }

  function handleApplyQuery() {
    onRefresh(buildQueryForBackend());
  }

  function handleExportWord() {
    onExportWord(buildQueryForBackend());
  }

  const pageStart = sortedAlerts.length === 0 ? 0 : (page - 1) * pageSize + 1;
  const pageEnd = Math.min(page * pageSize, sortedAlerts.length);

  return (
    <section className="panel elk-panel">
      <div className="row-between elk-header">
        <div>
          <h3>ELK Alert Monitoring</h3>
          <p className="muted">Realtime alerts from Elasticsearch via backend integration</p>
          <p className="muted tiny">Last updated: {lastUpdated ? formatDate(lastUpdated) : "-"}</p>
        </div>
        <div className="elk-actions">
          <button className="ghost" type="button" onClick={handleApplyQuery} disabled={loading}>
            {loading ? "Refreshing..." : "Apply Query"}
          </button>
          <button className="primary" type="button" onClick={handleExportWord} disabled={loading}>
            Export Word
          </button>
          <button className="ghost" type="button" onClick={resetFilters}>
            Reset Filters
          </button>
        </div>
      </div>

      <div className="elk-filters">
        <input type="datetime-local" value={startTime} onChange={(event) => setStartTime(event.target.value)} />
        <input type="datetime-local" value={endTime} onChange={(event) => setEndTime(event.target.value)} />
        <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search alert name" />
        <select value={tenantFilter} onChange={(event) => setTenantFilter(event.target.value)}>
          {tenantOptions.map((item) => (
            <option key={item} value={item}>{item === "all" ? "All Tenants" : item}</option>
          ))}
        </select>
        <select value={analystFilter} onChange={(event) => setAnalystFilter(event.target.value)}>
          {analystOptions.map((item) => (
            <option key={item} value={item}>{item === "all" ? "All Analysts" : item}</option>
          ))}
        </select>
        <select value={severityFilter} onChange={(event) => setSeverityFilter(event.target.value)}>
          <option value="all">All Severity</option>
          <option value="Critical">Critical</option>
          <option value="High">High</option>
          <option value="Medium">Medium</option>
          <option value="Low">Low</option>
          <option value="Unknown">Unknown</option>
        </select>
        <select value={priorityFilter} onChange={(event) => setPriorityFilter(event.target.value)}>
          <option value="all">All Priority</option>
          <option value="Critical">Critical</option>
          <option value="High">High</option>
          <option value="Medium">Medium</option>
          <option value="Low">Low</option>
          <option value="Unknown">Unknown</option>
        </select>
      </div>

      <div className="advanced-toggle-row">
        <button className="ghost" type="button" onClick={() => setShowAdvanced((prev) => !prev)}>
          {showAdvanced ? "Hide Advanced Filters" : "Show Advanced Filters"}
        </button>
      </div>

      {showAdvanced && (
        <div className="elk-filters advanced-filters">
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
            <option value="all">All Status</option>
            <option value="true">true</option>
            <option value="false">false</option>
          </select>
          <select value={slaFilter} onChange={(event) => setSlaFilter(event.target.value)}>
            <option value="all">All SLA</option>
            <option value="true">true</option>
            <option value="false">false</option>
          </select>
          <input value={platformFilter} onChange={(event) => setPlatformFilter(event.target.value)} placeholder="platform" />
          <input value={resolutionFilter} onChange={(event) => setResolutionFilter(event.target.value)} placeholder="resolution" />
          <input value={reasonCloseCase} onChange={(event) => setReasonCloseCase(event.target.value)} placeholder="reasonCloseCase" />
          <input value={messageConfirmCase} onChange={(event) => setMessageConfirmCase(event.target.value)} placeholder="messageConfirmCase" />
          <input value={soarId} onChange={(event) => setSoarId(event.target.value)} placeholder="soarId" />
          <input value={siemAlertId} onChange={(event) => setSiemAlertId(event.target.value)} placeholder="siemAlertId" />
          <input value={soarCaseName} onChange={(event) => setSoarCaseName(event.target.value)} placeholder="soarCaseName" />
          <input value={tacticsFilter} onChange={(event) => setTacticsFilter(event.target.value)} placeholder="tactics (comma-separated)" />
          <input value={techniquesFilter} onChange={(event) => setTechniquesFilter(event.target.value)} placeholder="techniques (comma-separated)" />
          <input value={q} onChange={(event) => setQ(event.target.value)} placeholder="global search q" />
        </div>
      )}

      <div className="elk-stats">
        {statEntries.length === 0 && <span className="muted">No alert data</span>}
        {statEntries.map(([severity, count]) => (
          <article key={severity} className="elk-stat-card">
            <span className="muted">{severity}</span>
            <strong>{count}</strong>
          </article>
        ))}
      </div>

      {error && <div className="error">{error}</div>}

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th><button className="sort-btn" type="button" onClick={() => handleSort("timestamp")}>Timestamp</button></th>
              <th><button className="sort-btn" type="button" onClick={() => handleSort("alertName")}>Alert</button></th>
              <th><button className="sort-btn" type="button" onClick={() => handleSort("severity")}>Severity</button></th>
              <th><button className="sort-btn" type="button" onClick={() => handleSort("priority")}>Priority</button></th>
              <th><button className="sort-btn" type="button" onClick={() => handleSort("tenant")}>Tenant</button></th>
              <th><button className="sort-btn" type="button" onClick={() => handleSort("analyst")}>Analyst</button></th>
              <th>Status</th>
              <th>SLA</th>
              <th>Resolution</th>
              <th>Reason Close</th>
              <th>SOAR ID</th>
              <th>SIEM Alert ID</th>
            </tr>
          </thead>
          <tbody>
            {!loading && filteredAlerts.length === 0 && (
              <tr>
                <td colSpan={12} className="muted">No alerts matched current filters</td>
              </tr>
            )}
            {pageAlerts.map((item) => (
              <tr key={item.id || `${item.alertName}-${item.timestamp}`}>
                <td>{formatDate(item.timestamp)}</td>
                <td>{item.alertName || "-"}</td>
                <td><span className={`badge ${toSeverityClass(item.severity)}`}>{toLabel(item.severity)}</span></td>
                <td>{toLabel(item.priority)}</td>
                <td>{toLabel(item.tenant)}</td>
                <td>{toLabel(item.analyst)}</td>
                <td>{toLabel(item.status)}</td>
                <td>{toLabel(item.sla)}</td>
                <td>{toLabel(item.resolution)}</td>
                <td>{toLabel(item.reasonCloseCase)}</td>
                <td>{toLabel(item.soarId)}</td>
                <td>{toLabel(item.siemAlertId)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="pagination">
        <span className="muted">Showing {pageStart}-{pageEnd} of {sortedAlerts.length}</span>
        <div className="page-actions">
          <button className="ghost" type="button" onClick={() => setPage(1)} disabled={page <= 1}>First</button>
          <button className="ghost" type="button" onClick={() => setPage((prev) => Math.max(1, prev - 1))} disabled={page <= 1}>Prev</button>
          <span className="muted">Page {page}/{totalPages}</span>
          <button className="ghost" type="button" onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))} disabled={page >= totalPages}>Next</button>
          <button className="ghost" type="button" onClick={() => setPage(totalPages)} disabled={page >= totalPages}>Last</button>
        </div>
      </div>
    </section>
  );
}

export default ElkDashboard;
