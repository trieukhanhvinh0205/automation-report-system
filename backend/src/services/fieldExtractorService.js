function extractFields(rawText = "") {
  const text = rawText || "";
  const fields = baseFields();

  const customerCode = text.match(/\b(PVOIL|NCS|BD)\b/i)?.[1];
  const alertTotal = text.match(/số lượng cảnh báo.*?xử lý:\s*([\d,.]+)/i)?.[1];
  const securityStatus = text.match(/tình trạng.*?:\s*([^\n.]+)/i)?.[1];
  const range = text.match(/từ\s+(.+?)\s+đến\s+(.+?)(\.|\n)/i);

  setDefault(fields, "customer_code", customerCode?.toUpperCase());
  setDefault(fields, "customer_tenant", customerCode?.toLowerCase());
  setDefault(fields, "total_processed_alerts", parseNumber(alertTotal));
  setDefault(fields, "security_status", securityStatus?.trim());

  if (range) {
    setDefault(fields, "monitoring_start_text", range[1].trim());
    setDefault(fields, "monitoring_end_text", range[2].trim());
  }

  return fields;
}

function baseFields() {
  return [
    field("customer_code", "Mã khách hàng", "text", "postgres", null, true),
    field("customer_name", "Tên khách hàng", "text", "postgres", null, true),
    field("customer_full_name", "Tên đầy đủ khách hàng", "text", "postgres", null, true),
    field("customer_tenant", "ELK tenant", "text", "postgres", null, true),
    field("report_month", "Tháng báo cáo", "text", "manual", null, false),
    field("report_year", "Năm báo cáo", "text", "manual", null, false),
    field("monitoring_start", "Thời gian bắt đầu", "datetime", "manual", null, true),
    field("monitoring_end", "Thời gian kết thúc", "datetime", "manual", null, true),
    field("monitoring_start_text", "Thời gian bắt đầu dạng text", "text", "computed", null, false),
    field("monitoring_end_text", "Thời gian kết thúc dạng text", "text", "computed", null, false),
    field("monitoring_period", "Kỳ giám sát", "text", "computed", null, false),
    field("report_start_date", "Ngày bắt đầu báo cáo", "text", "computed", null, false),
    field("report_end_date", "Ngày kết thúc báo cáo", "text", "computed", null, false),
    field("security_status", "Tình trạng an toàn thông tin", "text", "manual", "An toàn", false),
    field("total_processed_alerts", "Tổng số cảnh báo đã xử lý", "number", "elk", 0, true),
    field("sla_total", "Tổng SLA", "number", "computed", 0, false),
    field("sla_on_time", "SLA đúng hạn", "number", "computed", 0, false),
    field("sla_late", "SLA trễ hạn", "number", "computed", 0, false),
    field("case_summary", "Bảng thống kê case", "object", "computed", {}, false),
    field("operation_alerts", "Cảnh báo vận hành", "table", "elk", [], false),
    field("security_alerts", "Cảnh báo an ninh", "table", "elk", [], false),
    field("incident_alerts", "Cảnh báo sự cố", "table", "elk", [], false),
    field("rule_optimization", "Tối ưu rule", "table", "manual", [], false),
    field("new_rules", "Rule mới", "table", "manual", [], false),
    field("work_plan", "Kế hoạch công việc", "table", "manual", [], false),
    field("mitre_summary", "MITRE ATT&CK summary", "table", "elk", [], false)
  ];
}

function field(fieldKey, fieldLabel, fieldType, sourceType, defaultValue, required) {
  return {
    field_key: fieldKey,
    field_label: fieldLabel,
    field_type: fieldType,
    source_type: sourceType,
    source_config: defaultSourceConfig(fieldKey, sourceType),
    default_value: defaultValue,
    required: Boolean(required)
  };
}

function defaultSourceConfig(fieldKey, sourceType) {
  if (sourceType === "postgres") {
    const columnMap = {
      customer_code: "code",
      customer_name: "name",
      customer_full_name: "full_name",
      customer_tenant: "tenant"
    };
    return { table: "customers", column: columnMap[fieldKey], where: { id: "{{customer_id}}" } };
  }

  if (sourceType === "elk") {
    return {
      mode: fieldKey === "total_processed_alerts" ? "count" : "list",
      filters: {
        startTime: "{{monitoring_start}}",
        endTime: "{{monitoring_end}}",
        tenant: "{{customer_tenant}}",
        size: 200
      }
    };
  }

  if (sourceType === "computed") {
    return { function: fieldKey };
  }

  return {};
}

function setDefault(fields, key, value) {
  if (value === undefined || value === null || value === "") return;
  const fieldItem = fields.find((item) => item.field_key === key);
  if (fieldItem) fieldItem.default_value = value;
}

function parseNumber(value) {
  if (!value) return undefined;
  const parsed = Number(String(value).replace(/[,.]/g, ""));
  return Number.isFinite(parsed) ? parsed : undefined;
}

module.exports = {
  extractFields
};
