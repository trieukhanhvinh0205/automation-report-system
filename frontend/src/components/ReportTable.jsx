import { formatDate } from "../utils/format";

function ReportTable({ reports, selectedId, onSelect }) {
  return (
    <section className="panel">
      <h3>Reports</h3>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Title</th>
              <th>Status</th>
              <th>Created</th>
            </tr>
          </thead>
          <tbody>
            {reports.length === 0 && (
              <tr>
                <td colSpan={3} className="muted">
                  No reports yet
                </td>
              </tr>
            )}
            {reports.map((report) => (
              <tr
                key={report.id}
                className={selectedId === report.id ? "selected" : ""}
                onClick={() => onSelect(report.id)}
              >
                <td>{report.title}</td>
                <td>
                  <span className={`badge ${report.status}`}>{report.status}</span>
                </td>
                <td>{formatDate(report.created_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default ReportTable;
