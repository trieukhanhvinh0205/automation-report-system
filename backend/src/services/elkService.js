const axios = require("axios");
const https = require("https");
require("dotenv").config();

function buildElkQuery({
  startTime,
  endTime,
  openCaseStartTime,
  openCaseEndTime,
  analyzedStartTime,
  analyzedEndTime,
  detectedStartTime,
  detectedEndTime,
  severity,
  tenant,
  analyst,
  alertName,
  priority,
  resolution,
  status,
  sla,
  tenantId,
  platform,
  soarId,
  siemAlertId,
  soarCaseName,
  reasonCloseCase,
  messageConfirmCase,
  tactics,
  techniques,
  minTimeDiffMinutes,
  maxTimeDiffMinutes,
  minDetectedToAnalyzedMinutes,
  maxDetectedToAnalyzedMinutes,
  minOpenToDetectedMinutes,
  maxOpenToDetectedMinutes,
  q,
  size = 200
}) {
  const must = [];
  const filter = [];

  if (startTime || endTime) {
    const range = {};
    if (startTime) range.gte = startTime;
    if (endTime) range.lte = endTime;
    filter.push({ range: { "@timestamp": range } });
  }

  if (severity) {
    filter.push({ term: { "severity.keyword": severity } });
  }

  if (tenant) {
    filter.push({ term: { "tenant.keyword": tenant } });
  }

  if (analyst) {
    filter.push({ term: { "user_closed_case.keyword": analyst } });
  }

  if (priority) {
    filter.push({ term: { "priority.keyword": priority } });
  }

  if (resolution) {
    filter.push({ term: { "resolution.keyword": resolution } });
  }

  if (status !== undefined && status !== "") {
    const parsed =
      String(status).toLowerCase() === "true"
        ? true
        : String(status).toLowerCase() === "false"
          ? false
          : status;
    filter.push({ term: { status: parsed } });
  }

  if (sla !== undefined && sla !== "") {
    const parsed =
      String(sla).toLowerCase() === "true"
        ? true
        : String(sla).toLowerCase() === "false"
          ? false
          : sla;
    filter.push({ term: { sla: parsed } });
  }

  if (platform) {
    filter.push({ term: { "platform.keyword": platform } });
  }

  if (soarId) {
    filter.push({ term: { "soar_id.keyword": soarId } });
  }

  if (siemAlertId) {
    filter.push({ term: { "siem_alert_id.keyword": siemAlertId } });
  }

  if (tenantId) {
    filter.push({ term: { "tenant.keyword": tenantId } });
  }

  if (reasonCloseCase) {
    filter.push({ term: { "reason_close_case.keyword": reasonCloseCase } });
  }

  if (messageConfirmCase) {
    filter.push({ term: { "message_confirm_case.keyword": messageConfirmCase } });
  }

  if (soarCaseName) {
    must.push({
      match_phrase: {
        soar_case_name: soarCaseName
      }
    });
  }

  if (alertName) {
    must.push({
      multi_match: {
        query: alertName,
        fields: ["siem_alert_name", "soar_case_name"],
        type: "best_fields"
      }
    });
  }

  if (tactics) {
    const tacticList = String(tactics)
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
    if (tacticList.length > 0) {
      filter.push({
        terms: { "mitre_tactic.keyword": tacticList }
      });
    }
  }

  if (techniques) {
    const techniqueList = String(techniques)
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
    if (techniqueList.length > 0) {
      filter.push({
        terms: { "mitre_technique.keyword": techniqueList }
      });
    }
  }

  if (openCaseStartTime || openCaseEndTime) {
    const range = {};
    if (openCaseStartTime) range.gte = openCaseStartTime;
    if (openCaseEndTime) range.lte = openCaseEndTime;
    filter.push({ range: { open_case_time: range } });
  }

  if (analyzedStartTime || analyzedEndTime) {
    const range = {};
    if (analyzedStartTime) range.gte = analyzedStartTime;
    if (analyzedEndTime) range.lte = analyzedEndTime;
    filter.push({ range: { case_analyzed_time: range } });
  }

  if (detectedStartTime || detectedEndTime) {
    const range = {};
    if (detectedStartTime) range.gte = detectedStartTime;
    if (detectedEndTime) range.lte = detectedEndTime;
    filter.push({ range: { case_detected_time: range } });
  }

  if (minTimeDiffMinutes || maxTimeDiffMinutes) {
    const range = {};
    if (minTimeDiffMinutes) range.gte = Number(minTimeDiffMinutes);
    if (maxTimeDiffMinutes) range.lte = Number(maxTimeDiffMinutes);
    filter.push({ range: { timeDiffMinutes: range } });
  }

  if (minDetectedToAnalyzedMinutes || maxDetectedToAnalyzedMinutes) {
    const range = {};
    if (minDetectedToAnalyzedMinutes) range.gte = Number(minDetectedToAnalyzedMinutes);
    if (maxDetectedToAnalyzedMinutes) range.lte = Number(maxDetectedToAnalyzedMinutes);
    filter.push({ range: { timeDetectedtoAnalyzedMinutes: range } });
  }

  if (minOpenToDetectedMinutes || maxOpenToDetectedMinutes) {
    const range = {};
    if (minOpenToDetectedMinutes) range.gte = Number(minOpenToDetectedMinutes);
    if (maxOpenToDetectedMinutes) range.lte = Number(maxOpenToDetectedMinutes);
    filter.push({ range: { timeOpentoDetectedMinutes: range } });
  }

  if (q) {
    must.push({
      multi_match: {
        query: q,
        fields: [
          "siem_alert_name",
          "soar_case_name",
          "tenant",
          "resolution",
          "reason_close_case",
          "message_confirm_case",
          "user_closed_case"
        ],
        type: "best_fields"
      }
    });
  }

  return {
    size,
    sort: [{ "@timestamp": { order: "desc" } }],
    query: {
      bool: {
        must,
        filter
      }
    }
  };
}

function mapElkItem(item) {
  return {
    id: item._id,
    timestamp: item._source["@timestamp"],
    alertName: item._source.siem_alert_name,
    severity: item._source.severity,
    priority: item._source.priority,
    tactics: item._source.mitre_tactic,
    techniques: item._source.mitre_technique,
    resolution: item._source.resolution,
    analyst: item._source.user_closed_case,
    tenant: item._source.tenant,
    status: item._source.status,
    reasonCloseCase: item._source.reason_close_case,
    openCaseTime: item._source.open_case_time,
    caseAnalyzedTime: item._source.case_analyzed_time,
    caseDetectedTime: item._source.case_detected_time,
    soarId: item._source.soar_id,
    siemAlertId: item._source.siem_alert_id,
    soarCaseName: item._source.soar_case_name,
    platform: item._source.platform,
    sla: item._source.sla,
    messageConfirmCase: item._source.message_confirm_case,
    timeDiffMinutes: item._source.timeDiffMinutes,
    timeDetectedToAnalyzedMinutes: item._source.timeDetectedtoAnalyzedMinutes,
    timeOpenToDetectedMinutes: item._source.timeOpentoDetectedMinutes
  };
}

async function getElkReports(filters = {}) {
  const result = await searchElkReports(filters);
  return result.rows;
}

async function searchElkReports(filters = {}) {
  try {
    const query = buildElkQuery(filters);
    const response = await axios.post(
      `${process.env.ELK_URL}/${process.env.ELK_INDEX}/_search`,
      query,
      {
        auth: {
          username: process.env.ELK_USERNAME,
          password: process.env.ELK_PASSWORD
        },
        headers: {
          "Content-Type": "application/json"
        },
        httpsAgent: new https.Agent({
          rejectUnauthorized: false
        })
      }
    );

    const total = response.data.hits.total;
    return {
      rows: response.data.hits.hits.map(mapElkItem),
      total: typeof total === "number" ? total : Number(total?.value || 0)
    };
  } catch (error) {
    console.error("ELK ERROR:", error.response?.data || error.message);
    throw error;
  }
}

module.exports = {
  buildElkQuery,
  getElkReports,
  searchElkReports
};
