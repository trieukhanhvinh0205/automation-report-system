import { useEffect, useMemo, useState } from "react";
import {
  Badge,
  Button,
  Card,
  Drawer,
  DrawerBody,
  DrawerHeader,
  DrawerHeaderTitle,
  Field,
  Input,
  MessageBar,
  MessageBarBody,
  Select,
  Spinner
} from "@fluentui/react-components";
import { formatDate } from "../utils/format";
import { EmptyState } from "./ui/Feedback";

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

function parseVietnameseDateTime(value) {
  const text = String(value || "").trim();
  if (!text) return "";

  const match = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[\s,]+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?$/);
  if (match) {
    const [, day, month, year, hour = "0", minute = "0", second = "0"] = match;
    const parts = {
      day: Number(day),
      month: Number(month),
      year: Number(year),
      hour: Number(hour),
      minute: Number(minute),
      second: Number(second)
    };
    if (
      parts.month < 1 ||
      parts.month > 12 ||
      parts.day < 1 ||
      parts.day > daysInMonth(parts.year, parts.month) ||
      parts.hour > 23 ||
      parts.minute > 59 ||
      parts.second > 59
    ) {
      return null;
    }
    const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour - 7, parts.minute, parts.second));
    if (
      Number.isFinite(date.getTime())
    ) {
      return date.toISOString();
    }
    return null;
  }

  const fallback = new Date(text);
  return Number.isNaN(fallback.getTime()) ? null : fallback.toISOString();
}

function daysInMonth(year, month) {
  return new Date(Number(year), Number(month), 0).getDate();
}

function splitVietnameseDateTime(value) {
  const match = String(value || "")
    .trim()
    .match(/^(\d{1,2}\/\d{1,2}\/\d{4})(?:[\s,]+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?$/);
  return {
    date: match?.[1] || String(value || "").split(/\s+/)[0] || "",
    hour: padTimePart(match?.[2] || "00"),
    minute: padTimePart(match?.[3] || "00"),
    second: padTimePart(match?.[4] || "00")
  };
}

function parseVietnameseDateOnly(value) {
  const match = String(value || "").match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!match) return null;
  const [, day, month, year] = match;
  const date = new Date(Number(year), Number(month) - 1, Number(day));
  if (
    date.getFullYear() !== Number(year) ||
    date.getMonth() !== Number(month) - 1 ||
    date.getDate() !== Number(day)
  ) {
    return null;
  }
  return date;
}

function formatVietnameseDate(date) {
  return [
    String(date.getDate()).padStart(2, "0"),
    String(date.getMonth() + 1).padStart(2, "0"),
    date.getFullYear()
  ].join("/");
}

function buildCalendarDays(viewDate) {
  const firstDay = new Date(viewDate.getFullYear(), viewDate.getMonth(), 1);
  const startOffset = firstDay.getDay();
  const start = new Date(firstDay);
  start.setDate(firstDay.getDate() - startOffset);

  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    return date;
  });
}

function joinVietnameseDateTime(parts) {
  if (!parts.date) return "";
  return `${parts.date} ${parts.hour}:${parts.minute}:${parts.second}`;
}

function padTimePart(value) {
  return String(Number(value || 0)).padStart(2, "0");
}

const HOURS = Array.from({ length: 24 }, (_, index) => String(index).padStart(2, "0"));
const MINUTES_SECONDS = Array.from({ length: 60 }, (_, index) => String(index).padStart(2, "0"));

function ElkDashboard({ alerts, meta, filterOptions, loading, error, onRefresh, onExportWord, lastUpdated }) {
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
  const [selectedCase, setSelectedCase] = useState(null);

  const [sortField, setSortField] = useState("timestamp");
  const [sortDirection, setSortDirection] = useState("desc");
  const [page, setPage] = useState(meta?.page || 1);
  const [pageSize, setPageSize] = useState(meta?.size || 10);

  const tenantOptions = useMemo(() => {
    const values = new Set((filterOptions?.tenants?.length ? filterOptions.tenants : alerts.map((item) => toLabel(item.tenant))));
    return ["all", ...Array.from(values).sort((a, b) => a.localeCompare(b))];
  }, [alerts, filterOptions?.tenants]);

  const analystOptions = useMemo(() => {
    const values = new Set((filterOptions?.analysts?.length ? filterOptions.analysts : alerts.map((item) => toLabel(item.analyst))));
    return ["all", ...Array.from(values).sort((a, b) => a.localeCompare(b))];
  }, [alerts, filterOptions?.analysts]);

  const selectedTenants = tenantFilter === "all" ? [] : tenantFilter.split(",").filter(Boolean);
  const selectedAnalysts = analystFilter === "all" ? [] : analystFilter.split(",").filter(Boolean);
  const selectedSeverities = severityFilter === "all" ? [] : severityFilter.split(",").filter(Boolean);
  const selectedPriorities = priorityFilter === "all" ? [] : priorityFilter.split(",").filter(Boolean);

  useEffect(() => {
    setPage(1);
  }, [tenantFilter, analystFilter, severityFilter, priorityFilter, search, sortField, sortDirection]);

  const sortedAlerts = useMemo(() => {
    return sortByField(alerts, sortField, sortDirection);
  }, [alerts, sortDirection, sortField]);

  const totalPages = useMemo(() => {
    return Math.max(1, Number(meta?.totalPages || Math.ceil(Number(meta?.total || 0) / pageSize) || 1));
  }, [meta?.total, meta?.totalPages, pageSize]);

  useEffect(() => {
    setPage(Number(meta?.page || 1));
    setPageSize(Number(meta?.size || pageSize));
  }, [meta?.page, meta?.size]);

  const severityStats = useMemo(() => {
    return alerts.reduce((acc, item) => {
      const key = toLabel(item.severity);
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});
  }, [alerts]);

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
    onRefresh({ page: 1, size: pageSize });
  }

  function toggleMultiValue(currentValue, value) {
    const items = currentValue === "all" ? [] : currentValue.split(",").filter(Boolean);
    const next = items.includes(value) ? items.filter((item) => item !== value) : [...items, value];
    return next.length === 0 ? "all" : next.join(",");
  }

  function buildQueryForBackend(nextPage = page, nextSize = pageSize) {
    const query = {
      page: nextPage,
      size: nextSize
    };
    const parsedStartTime = parseVietnameseDateTime(startTime);
    const parsedEndTime = parseVietnameseDateTime(endTime);
    if (startTime && parsedStartTime) query.startTime = parsedStartTime;
    if (endTime && parsedEndTime) query.endTime = parsedEndTime;
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
    const nextPage = 1;
    setPage(nextPage);
    onRefresh(buildQueryForBackend(nextPage, pageSize));
  }

  function handleExportWord() {
    onExportWord(buildQueryForBackend());
  }

  function goToPage(nextPage) {
    const normalizedPage = Math.min(Math.max(nextPage, 1), totalPages);
    setPage(normalizedPage);
    onRefresh(buildQueryForBackend(normalizedPage, pageSize));
  }

  function handlePageSizeChange(value) {
    const nextSize = Number(value);
    setPageSize(nextSize);
    setPage(1);
    onRefresh(buildQueryForBackend(1, nextSize));
  }

  const total = Number(meta?.total || 0);
  const pageStart = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const pageEnd = Math.min(page * pageSize, total);
  const paginationControls = (
    <div className="pagination">
      <span className="muted">Showing {pageStart}-{pageEnd} of {total}</span>
      <div className="page-actions">
        <Field label="Rows" className="page-size-control">
          <Select value={String(pageSize)} onChange={(event) => handlePageSizeChange(event.target.value)} disabled={loading}>
            <option value={10}>1-10</option>
            <option value={50}>1-50</option>
            <option value={100}>1-100</option>
            <option value={500}>1-500</option>
          </Select>
        </Field>
        <Button type="button" onClick={() => goToPage(1)} disabled={page <= 1 || loading}>First</Button>
        <Button type="button" onClick={() => goToPage(page - 1)} disabled={page <= 1 || loading}>Prev</Button>
        <span className="muted">Page {page}/{totalPages}</span>
        <Button type="button" onClick={() => goToPage(page + 1)} disabled={page >= totalPages || loading}>Next</Button>
        <Button type="button" onClick={() => goToPage(totalPages)} disabled={page >= totalPages || loading}>Last</Button>
      </div>
    </div>
  );

  return (
    <Card className="panel elk-panel">
      <div className="row-between elk-header">
        <div>
          <h3>ELK Alert Monitoring</h3>
          <p className="muted">Realtime alerts from Elasticsearch via backend integration</p>
          <p className="muted tiny">Last updated: {lastUpdated ? formatDate(lastUpdated) : "-"}</p>
        </div>
        <div className="elk-actions">
          <Button type="button" onClick={handleApplyQuery} disabled={loading}>
            {loading ? <Spinner size="tiny" /> : "Apply Query"}
          </Button>
          <Button appearance="primary" type="button" onClick={handleExportWord} disabled={loading}>
            Export Word
          </Button>
          <Button type="button" onClick={resetFilters}>
            Reset Filters
          </Button>
        </div>
      </div>

      <div className="elk-filters">
        <VietnameseDateTimeInput label="Từ thời gian (giờ Việt Nam)" value={startTime} onChange={setStartTime} />
        <VietnameseDateTimeInput label="Đến thời gian (giờ Việt Nam)" value={endTime} onChange={setEndTime} />
        <Input value={search} onChange={(_, data) => setSearch(data.value)} placeholder="Search alert name" />
        <MultiSelectFilter
          label="Tenant"
          options={tenantOptions.filter((item) => item !== "all")}
          selected={selectedTenants}
          onToggle={(value) => setTenantFilter(toggleMultiValue(tenantFilter, value))}
          onClear={() => setTenantFilter("all")}
        />
        <MultiSelectFilter
          label="Analyst"
          options={analystOptions.filter((item) => item !== "all")}
          selected={selectedAnalysts}
          onToggle={(value) => setAnalystFilter(toggleMultiValue(analystFilter, value))}
          onClear={() => setAnalystFilter("all")}
        />
        <MultiSelectFilter
          label="Severity"
          options={(filterOptions?.severities?.length ? filterOptions.severities : ["Critical", "High", "Medium", "Low", "Unknown"])}
          selected={selectedSeverities}
          onToggle={(value) => setSeverityFilter(toggleMultiValue(severityFilter, value))}
          onClear={() => setSeverityFilter("all")}
        />
        <MultiSelectFilter
          label="Priority"
          options={(filterOptions?.priorities?.length ? filterOptions.priorities : ["Critical", "High", "Medium", "Low", "Unknown"])}
          selected={selectedPriorities}
          onToggle={(value) => setPriorityFilter(toggleMultiValue(priorityFilter, value))}
          onClear={() => setPriorityFilter("all")}
        />
      </div>

      <div className="advanced-toggle-row">
        <Button type="button" onClick={() => setShowAdvanced((prev) => !prev)}>
          {showAdvanced ? "Hide Advanced Filters" : "Show Advanced Filters"}
        </Button>
      </div>

      {showAdvanced && (
        <div className="elk-filters advanced-filters">
          <Select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
            <option value="all">All Status</option>
            <option value="true">true</option>
            <option value="false">false</option>
          </Select>
          <Select value={slaFilter} onChange={(event) => setSlaFilter(event.target.value)}>
            <option value="all">All SLA</option>
            <option value="true">true</option>
            <option value="false">false</option>
          </Select>
          <Input value={platformFilter} onChange={(_, data) => setPlatformFilter(data.value)} placeholder="platform" />
          <Input value={resolutionFilter} onChange={(_, data) => setResolutionFilter(data.value)} placeholder="resolution" />
          <Input value={reasonCloseCase} onChange={(_, data) => setReasonCloseCase(data.value)} placeholder="reasonCloseCase" />
          <Input value={messageConfirmCase} onChange={(_, data) => setMessageConfirmCase(data.value)} placeholder="messageConfirmCase" />
          <Input value={soarId} onChange={(_, data) => setSoarId(data.value)} placeholder="soarId" />
          <Input value={siemAlertId} onChange={(_, data) => setSiemAlertId(data.value)} placeholder="siemAlertId" />
          <Input value={soarCaseName} onChange={(_, data) => setSoarCaseName(data.value)} placeholder="soarCaseName" />
          <Input value={tacticsFilter} onChange={(_, data) => setTacticsFilter(data.value)} placeholder="tactics (comma-separated)" />
          <Input value={techniquesFilter} onChange={(_, data) => setTechniquesFilter(data.value)} placeholder="techniques (comma-separated)" />
          <Input value={q} onChange={(_, data) => setQ(data.value)} placeholder="global search q" />
        </div>
      )}

      <div className="elk-stats">
        {statEntries.length === 0 && <EmptyState title="No alert data" />}
        {statEntries.map(([severity, count]) => (
          <article key={severity} className="elk-stat-card">
            <span className="muted">{severity}</span>
            <strong>{count}</strong>
          </article>
        ))}
      </div>

      {error && (
        <MessageBar intent="error">
          <MessageBarBody>{error}</MessageBarBody>
        </MessageBar>
      )}

      {paginationControls}

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
            {!loading && alerts.length === 0 && (
              <tr>
                <td colSpan={12} className="muted">No alerts matched current filters</td>
              </tr>
            )}
            {sortedAlerts.map((item) => (
              <tr key={item.id || `${item.alertName}-${item.timestamp}`} onClick={() => setSelectedCase(item)}>
                <td>{formatDate(item.timestamp)}</td>
                <td>{item.alertName || "-"}</td>
                <td><Badge className={`badge ${toSeverityClass(item.severity)}`}>{toLabel(item.severity)}</Badge></td>
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

      {paginationControls}

      {selectedCase && <CaseDetailDrawer item={selectedCase} onClose={() => setSelectedCase(null)} />}
    </Card>
  );
}

function MultiSelectFilter({ label, options, selected, onToggle, onClear }) {
  return (
    <div className="multi-filter">
      <div className="multi-filter-head">
        <span>{label}</span>
        {selected.length > 0 && (
          <Button appearance="subtle" size="small" type="button" onClick={onClear}>
            Clear
          </Button>
        )}
      </div>
      <div className="multi-filter-options">
        {options.length === 0 && <span className="muted tiny">No options</span>}
        {options.map((option) => (
          <Button
            className={`filter-chip ${selected.includes(option) ? "active" : ""}`}
            type="button"
            key={option}
            onClick={() => onToggle(option)}
          >
            {option}
          </Button>
        ))}
      </div>
    </div>
  );
}

function VietnameseDateTimeInput({ label, value, onChange }) {
  const parts = splitVietnameseDateTime(value);
  const selectedDate = parseVietnameseDateOnly(parts.date);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [viewDate, setViewDate] = useState(selectedDate || new Date());

  function update(patch) {
    onChange(joinVietnameseDateTime({ ...parts, ...patch }));
  }

  function openCalendar() {
    setViewDate(selectedDate || new Date());
    setCalendarOpen((prev) => !prev);
  }

  function moveMonth(offset) {
    setViewDate((current) => new Date(current.getFullYear(), current.getMonth() + offset, 1));
  }

  return (
    <Field label={label}>
      <div className="vn-datetime-control">
        <div className="vn-date-picker">
          <Input
            value={parts.date}
            onChange={(_, data) => update({ date: data.value })}
            placeholder="dd/mm/yyyy"
          />
          <Button type="button" onClick={openCalendar}>
            Lịch
          </Button>
          {calendarOpen && (
            <div className="vn-calendar-popover">
              <div className="vn-calendar-head">
                <Button size="small" type="button" onClick={() => moveMonth(-1)}>
                  ‹
                </Button>
                <strong>
                  Tháng {viewDate.getMonth() + 1}/{viewDate.getFullYear()}
                </strong>
                <Button size="small" type="button" onClick={() => moveMonth(1)}>
                  ›
                </Button>
              </div>
              <div className="vn-calendar-grid weekdays">
                {["CN", "T2", "T3", "T4", "T5", "T6", "T7"].map((day) => (
                  <span key={day}>{day}</span>
                ))}
              </div>
              <div className="vn-calendar-grid">
                {buildCalendarDays(viewDate).map((date) => {
                  const dateText = formatVietnameseDate(date);
                  const inMonth = date.getMonth() === viewDate.getMonth();
                  const active = parts.date === dateText;
                  return (
                    <button
                      className={`vn-calendar-day ${inMonth ? "" : "muted-day"} ${active ? "active" : ""}`}
                      key={date.toISOString()}
                      type="button"
                      onClick={() => {
                        update({ date: dateText });
                        setCalendarOpen(false);
                      }}
                    >
                      {date.getDate()}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
        <Select aria-label={`${label} giờ`} value={parts.hour} onChange={(event) => update({ hour: event.target.value })}>
          {HOURS.map((hour) => (
            <option key={hour} value={hour}>
              {hour}
            </option>
          ))}
        </Select>
        <Select aria-label={`${label} phút`} value={parts.minute} onChange={(event) => update({ minute: event.target.value })}>
          {MINUTES_SECONDS.map((minute) => (
            <option key={minute} value={minute}>
              {minute}
            </option>
          ))}
        </Select>
        <Select aria-label={`${label} giây`} value={parts.second} onChange={(event) => update({ second: event.target.value })}>
          {MINUTES_SECONDS.map((second) => (
            <option key={second} value={second}>
              {second}
            </option>
          ))}
        </Select>
      </div>
    </Field>
  );
}

function CaseDetailDrawer({ item, onClose }) {
  const fields = [
    ["Timestamp", formatDate(item.timestamp)],
    ["Alert", item.alertName],
    ["Severity", item.severity],
    ["Priority", item.priority],
    ["Tenant", item.tenant],
    ["Analyst", item.analyst],
    ["Status", item.status],
    ["SLA", item.sla],
    ["Resolution", item.resolution],
    ["Reason Close", item.reasonCloseCase],
    ["Message Confirm", item.messageConfirmCase],
    ["SOAR ID", item.soarId],
    ["SIEM Alert ID", item.siemAlertId],
    ["SOAR Case Name", item.soarCaseName],
    ["Platform", item.platform],
    ["Open Case Time", formatDate(item.openCaseTime)],
    ["Detected Time", formatDate(item.caseDetectedTime)],
    ["Analyzed Time", formatDate(item.caseAnalyzedTime)],
    ["MITRE Tactics", normalizeList(item.tactics).join(", ")],
    ["MITRE Techniques", normalizeList(item.techniques).join(", ")],
    ["Time Diff Minutes", item.timeDiffMinutes],
    ["Detected To Analyzed Minutes", item.timeDetectedToAnalyzedMinutes],
    ["Open To Detected Minutes", item.timeOpenToDetectedMinutes]
  ];

  return (
    <Drawer open position="end" size="large" onOpenChange={(_, data) => !data.open && onClose()}>
      <DrawerHeader>
        <DrawerHeaderTitle
          action={
          <Button type="button" onClick={onClose}>
            Close
          </Button>
          }
        >
          Case Detail
        </DrawerHeaderTitle>
        <p className="muted">{item.alertName || item.soarCaseName || item.id}</p>
      </DrawerHeader>
      <DrawerBody>
        <dl className="case-detail-list">
          {fields.map(([label, value]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{toLabel(value)}</dd>
            </div>
          ))}
        </dl>
        <details className="raw-json">
          <summary>Raw JSON</summary>
          <pre>{JSON.stringify(item, null, 2)}</pre>
        </details>
      </DrawerBody>
    </Drawer>
  );
}

export default ElkDashboard;
