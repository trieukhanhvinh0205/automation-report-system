const DEFAULT_SECTIONS = [
  { section_key: "cover", title: "Trang bìa", section_type: "cover" },
  { section_key: "confidentiality", title: "Bảo mật tài liệu", section_type: "text" },
  { section_key: "abbreviations", title: "Thuật ngữ viết tắt", section_type: "table" },
  { section_key: "toc", title: "Mục lục", section_type: "toc" },
  { section_key: "security_overview", title: "Tổng quan tình hình an toàn thông tin", section_type: "text" },
  { section_key: "monitoring_summary", title: "Tổng hợp giám sát", section_type: "text" },
  { section_key: "case_summary", title: "Bảng thống kê số case đã xử lý", section_type: "table" },
  { section_key: "operation_alerts", title: "Cảnh báo vận hành", section_type: "table" },
  { section_key: "security_alerts", title: "Cảnh báo an ninh", section_type: "table" },
  { section_key: "incident_alerts", title: "Cảnh báo sự cố", section_type: "table" },
  { section_key: "sla_summary", title: "Tổng hợp SLA", section_type: "table" },
  { section_key: "mitre_summary", title: "MITRE ATT&CK summary", section_type: "table" },
  { section_key: "work_plan", title: "Kế hoạch công việc", section_type: "table" },
  { section_key: "appendices", title: "Danh sách phụ lục", section_type: "appendix_list" },
  { section_key: "rule_optimization", title: "Tối ưu rule giám sát", section_type: "table" }
];

function extractSections(rawText = "", sourceFiles = []) {
  const text = rawText || "";
  const detected = [];
  const push = (section, contentTemplate = null) => {
    if (!detected.some((item) => item.section_key === section.section_key)) {
      detected.push({
        section_key: section.section_key,
        title: section.title,
        section_type: section.section_type,
        order_index: detected.length + 1,
        is_enabled: true,
        content_template: contentTemplate,
        data_binding: buildDataBinding(section.section_key),
        config: { show_title: section.section_key !== "cover" }
      });
    }
  };

  push(DEFAULT_SECTIONS[0], "BÁO CÁO ĐỊNH KỲ\n{{customer_full_name}} ({{customer_code}})\nKỳ báo cáo: {{report_month}}/{{report_year}}");

  if (/bảo mật|confidential/i.test(text)) push(DEFAULT_SECTIONS[1]);
  if (/viết tắt|abbreviation/i.test(text)) push(DEFAULT_SECTIONS[2]);
  if (/mục lục/i.test(text)) push(DEFAULT_SECTIONS[3]);

  push(
    DEFAULT_SECTIONS[4],
    "Thời gian giám sát: từ {{monitoring_start_text}} đến {{monitoring_end_text}}. Tình trạng an toàn thông tin: {{security_status}}. Số lượng cảnh báo NCS đã xử lý: {{total_processed_alerts}}."
  );
  push(DEFAULT_SECTIONS[5], "Trong kỳ báo cáo, hệ thống ghi nhận {{total_processed_alerts}} cảnh báo, {{sla_on_time}} cảnh báo đáp ứng SLA và {{sla_late}} cảnh báo trễ SLA.");
  push(DEFAULT_SECTIONS[6]);

  const roles = sourceFiles.map((file) => file.role);
  if (/vận hành|operation/i.test(text) || roles.includes("appendix_operation_alerts")) push(DEFAULT_SECTIONS[7]);
  if (/an ninh|security/i.test(text) || roles.includes("appendix_security_alerts")) push(DEFAULT_SECTIONS[8]);
  if (/sự cố|incident/i.test(text)) push(DEFAULT_SECTIONS[9]);
  if (/sla/i.test(text)) push(DEFAULT_SECTIONS[10]);
  if (/mitre|attack|att&ck/i.test(text)) push(DEFAULT_SECTIONS[11]);
  push(DEFAULT_SECTIONS[12]);
  push(DEFAULT_SECTIONS[13]);
  if (/rule|tunning|tuning/i.test(text) || roles.includes("appendix_rule_optimization")) push(DEFAULT_SECTIONS[14]);

  return detected.map((section, index) => ({
    ...section,
    order_index: index + 1
  }));
}

function buildDataBinding(sectionKey) {
  const tableFields = {
    case_summary: "case_summary",
    operation_alerts: "operation_alerts",
    security_alerts: "security_alerts",
    incident_alerts: "incident_alerts",
    sla_summary: "sla_summary",
    mitre_summary: "mitre_summary",
    work_plan: "work_plan",
    rule_optimization: "rule_optimization"
  };

  if (!tableFields[sectionKey]) return null;

  return {
    field_key: tableFields[sectionKey],
    row_template: { columns: [] }
  };
}

module.exports = {
  DEFAULT_SECTIONS,
  extractSections
};
