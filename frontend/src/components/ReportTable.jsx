import { Badge, Card } from "@fluentui/react-components";
import { formatDate } from "../utils/format";
import { EmptyState } from "./ui/Feedback";

function ReportTable({ reports, selectedId, onSelect }) {
  return (
    <Card className="panel">
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
                  <EmptyState title="No reports yet" description="Create a report to preview and export." />
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
                  <Badge appearance="filled" color={report.status === "completed" ? "success" : "warning"}>
                    {report.status}
                  </Badge>
                </td>
                <td>{formatDate(report.created_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

export default ReportTable;
