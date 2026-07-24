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
  confirmKeywordOnly,
  q,
  from = 0,
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

  const severityList = parseList(severity);
  if (severityList.length > 0) {
    filter.push({ terms: { "severity.keyword": severityList } });
  }

  const tenantList = parseList(tenant);
  if (tenantList.length > 0) {
    filter.push({ terms: { "tenant.keyword": tenantList } });
  }

  const analystList = parseList(analyst);
  if (analystList.length > 0) {
    filter.push({ terms: { "user_closed_case.keyword": analystList } });
  }

  const priorityList = parseList(priority);
  if (priorityList.length > 0) {
    filter.push({ terms: { "priority.keyword": priorityList } });
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

  const tenantIdList = parseList(tenantId);
  if (tenantIdList.length > 0) {
    filter.push({ terms: { "tenant.keyword": tenantIdList } });
  }

  if (reasonCloseCase) {
    must.push(buildTextShouldQuery("reason_close_case", reasonCloseCase));
  }

  if (messageConfirmCase) {
    must.push(buildTextShouldQuery("message_confirm_case", messageConfirmCase));
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
    const tacticList = parseList(tactics);
    if (tacticList.length > 0) {
      filter.push({
        terms: { "mitre_tactic.keyword": tacticList }
      });
    }
  }

  if (techniques) {
    const techniqueList = parseList(techniques);
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
    must.push(buildGlobalSearchQuery(q));
  }

  if (confirmKeywordOnly === true || String(confirmKeywordOnly).toLowerCase() === "true") {
    must.push(buildConfirmKeywordQuery());
  }

  return {
    track_total_hits: true,
    from: Number(from || 0),
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

function parseList(value) {
  if (Array.isArray(value)) return value.map((item) => String(item).trim()).filter(Boolean);
  if (value === null || value === undefined || value === "") return [];
  return String(value)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function buildTextShouldQuery(field, value) {
  return {
    bool: {
      minimum_should_match: 1,
      should: [
        { term: { [`${field}.keyword`]: value } },
        { match_phrase: { [field]: value } },
        { match: { [field]: value } }
      ]
    }
  };
}

const GLOBAL_SEARCH_FIELDS = [
  "siem_alert_name",
  "soar_case_name",
  "tenant",
  "resolution",
  "reason_close_case",
  "message_confirm_case",
  "user_closed_case"
];

const GLOBAL_SEARCH_FIELD_MAP = new Map([
  ["@timestamp", { field: "@timestamp", type: "date" }],
  ["timestamp", { field: "@timestamp", type: "date" }],
  ["siem_alert_name", { field: "siem_alert_name", type: "text" }],
  ["alertname", { field: "siem_alert_name", type: "text" }],
  ["tenant", { field: "tenant", type: "keyword" }],
  ["reason_close_case", { field: "reason_close_case", type: "text" }],
  ["resolution", { field: "resolution", type: "keyword" }],
  ["user_closed_case", { field: "user_closed_case", type: "keyword" }],
  ["analyst", { field: "user_closed_case", type: "keyword" }],
  ["siem_alert_id", { field: "siem_alert_id", type: "keyword" }],
  ["severity", { field: "severity", type: "keyword" }],
  ["timediffminutes", { field: "timeDiffMinutes", type: "number" }],
  ["case_analyzed_time", { field: "case_analyzed_time", type: "date" }],
  ["open_case_time", { field: "open_case_time", type: "date" }],
  ["case_detected_time", { field: "case_detected_time", type: "date" }],
  ["day_night", { field: "day_night", type: "keyword" }],
  ["full_name_customer", { field: "full_name_customer", type: "text" }],
  ["industry", { field: "industry", type: "keyword" }],
  ["local_timestamp", { field: "local_timestamp", type: "date" }],
  ["location", { field: "location", type: "keyword" }],
  ["message_confirm_case", { field: "message_confirm_case", type: "text" }],
  ["mitre_tactic", { field: "mitre_tactic", type: "keyword" }],
  ["mitre_technique", { field: "mitre_technique", type: "keyword" }],
  ["platform", { field: "platform", type: "keyword" }],
  ["priority", { field: "priority", type: "keyword" }],
  ["sla", { field: "sla", type: "boolean" }],
  ["soar_case_name", { field: "soar_case_name", type: "text" }],
  ["soar_id", { field: "soar_id", type: "keyword" }],
  ["status", { field: "status", type: "boolean" }],
  ["timedetectedtoanalyzedminutes", { field: "timeDetectedtoAnalyzedMinutes", type: "number" }],
  ["timeopentodetectedminutes", { field: "timeOpentoDetectedMinutes", type: "number" }],
  ["_id", { field: "_id", type: "keyword", meta: true }],
  ["_index", { field: "_index", type: "keyword", meta: true }],
  ["_score", { field: "_score", type: "number", meta: true }]
]);

function buildGlobalSearchQuery(value) {
  const parsed = parseFieldSearch(value);
  if (parsed) {
    const spec = GLOBAL_SEARCH_FIELD_MAP.get(normalizeSearchField(parsed.field));
    if (spec && (parsed.value !== "" || parsed.operator === "exists")) {
      return buildFieldSearchQuery(spec, parsed.value, parsed.operator);
    }
  }

  return {
    multi_match: {
      query: value,
      fields: GLOBAL_SEARCH_FIELDS,
      type: "best_fields"
    }
  };
}

function parseFieldSearch(value) {
  const text = String(value || "").trim();
  const rangeMatch = text.match(/^([@\w.]+)\s*(<=|>=|<|>|=)\s*(?:"([^"]*)"|'([^']*)'|(.+))$/);
  if (rangeMatch) {
    return {
      field: rangeMatch[1],
      operator: normalizeQueryOperator(rangeMatch[2]),
      value: String(rangeMatch[3] ?? rangeMatch[4] ?? rangeMatch[5] ?? "").trim()
    };
  }

  const match = text.match(/^([@\w.]+)\s*:\s*(?:"([^"]*)"|'([^']*)'|(.+))$/);
  if (!match) return null;
  const rawValue = String(match[2] ?? match[3] ?? match[4] ?? "").trim();
  const operatorMatch = rawValue.match(/^(<=|>=|<|>|=)\s*(.+)$/);
  if (operatorMatch) {
    return {
      field: match[1],
      operator: normalizeQueryOperator(operatorMatch[1]),
      value: operatorMatch[2].trim()
    };
  }
  if (rawValue === "*") {
    return {
      field: match[1],
      operator: "exists",
      value: ""
    };
  }
  return {
    field: match[1],
    operator: "eq",
    value: rawValue
  };
}

function normalizeQueryOperator(operator) {
  if (operator === ">") return "gt";
  if (operator === ">=") return "gte";
  if (operator === "<") return "lt";
  if (operator === "<=") return "lte";
  return "eq";
}

function normalizeSearchField(value) {
  return String(value || "").trim().replace(/[.\s]+/g, "_").toLowerCase();
}

function buildFieldSearchQuery(spec, value, operator = "eq") {
  if (operator === "exists") {
    return { exists: { field: spec.field } };
  }
  if (["gt", "gte", "lt", "lte"].includes(operator)) {
    return { range: { [spec.field]: { [operator]: coerceFieldValue(spec.type, value) } } };
  }
  if (spec.meta) {
    return { term: { [spec.field]: coerceFieldValue(spec.type, value) } };
  }
  if (spec.type === "text") {
    return buildTextShouldQuery(spec.field, value);
  }
  if (spec.type === "number" || spec.type === "boolean") {
    return { term: { [spec.field]: coerceFieldValue(spec.type, value) } };
  }
  if (spec.type === "date") {
    return {
      bool: {
        minimum_should_match: 1,
        should: [
          { term: { [spec.field]: value } },
          { match_phrase: { [spec.field]: value } }
        ]
      }
    };
  }
  return {
    bool: {
      minimum_should_match: 1,
      should: [
        { term: { [`${spec.field}.keyword`]: value } },
        { match_phrase: { [spec.field]: value } },
        { match: { [spec.field]: value } }
      ]
    }
  };
}

function coerceFieldValue(type, value) {
  if (type === "number") {
    const number = Number(value);
    return Number.isFinite(number) ? number : value;
  }
  if (type === "boolean") {
    if (String(value).toLowerCase() === "true") return true;
    if (String(value).toLowerCase() === "false") return false;
  }
  return value;
}

function buildConfirmKeywordQuery() {
  const fields = [
    "description",
    "alert_description",
    "siem_alert_description",
    "message",
    "message_confirm_case",
    "reason_close_case",
    "resolution",
    "soar_case_name",
    "siem_alert_name",
    "handling_detail"
  ];
  const phrases = ["\u0110\u00e3 Confirm KH", "Da Confirm KH"];

  return {
    bool: {
      minimum_should_match: 1,
      should: fields.flatMap((field) => [
        ...phrases.map((phrase) => ({ match_phrase: { [field]: phrase } })),
        ...phrases.map((phrase) => ({
          wildcard: {
            [`${field}.keyword`]: {
              value: `*${phrase}*`,
              case_insensitive: true
            }
          }
        }))
      ])
    }
  };
}
function buildElkRequestConfig() {
  return {
    auth: {
      username: process.env.ELK_USERNAME,
      password: process.env.ELK_PASSWORD
    },
    headers: {
      "Content-Type": "application/json"
    },
    httpsAgent: new https.Agent({
      rejectUnauthorized: false
    }),
    proxy: false,
    timeout: Number(process.env.ELK_TIMEOUT_MS || 30000)
  };
}

function mapElkItem(item) {
  const source = item._source || {};
  return {
    id: item._id,
    index: item._index,
    ignored: item._ignored,
    score: item._score,
    rawSource: source,
    timestamp: source["@timestamp"],
    localTimestamp: source.local_timestamp,
    alertName: source.siem_alert_name,
    description: source.description || source.alert_description || source.siem_alert_description || source.message,
    severity: source.severity,
    priority: source.priority,
    tactics: source.mitre_tactic,
    techniques: source.mitre_technique,
    resolution: source.resolution,
    analyst: source.user_closed_case,
    tenant: source.tenant,
    status: source.status,
    reasonCloseCase: source.reason_close_case,
    openCaseTime: source.open_case_time,
    closedCaseTime: firstSourceValue(source, [
      "closed_case_time",
      "case_closed_time",
      "close_case_time",
      "case_close_time",
      "closed_time",
      "close_time",
      "case_closed_at",
      "closed_at",
      "resolved_time",
      "case_resolved_time",
      "case_analyzed_time"
    ]),
    caseAnalyzedTime: source.case_analyzed_time,
    caseDetectedTime: source.case_detected_time,
    soarId: source.soar_id,
    siemAlertId: source.siem_alert_id,
    soarCaseName: source.soar_case_name,
    platform: source.platform,
    sla: source.sla,
    messageConfirmCase: source.message_confirm_case,
    handlingDetail: source.handling_detail || source.handlingDetail || source.detail,
    timeDiffMinutes: source.timeDiffMinutes,
    timeDetectedToAnalyzedMinutes: source.timeDetectedtoAnalyzedMinutes,
    timeOpenToDetectedMinutes: source.timeOpentoDetectedMinutes
  };
}

function firstSourceValue(source, keys = []) {
  for (const key of keys) {
    if (source[key] !== undefined && source[key] !== null && source[key] !== "") return source[key];
  }
  return undefined;
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
      buildElkRequestConfig()
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

async function searchElkSeveritySummary(filters = {}) {
  try {
    const query = buildElkQuery({ ...filters, from: 0, size: 0 });
    query.aggs = {
      severities: { terms: { field: "severity.keyword", size: 100 } }
    };

    const response = await axios.post(
      `${process.env.ELK_URL}/${process.env.ELK_INDEX}/_search`,
      query,
      buildElkRequestConfig()
    );

    const summary = { critical: 0, high: 0, medium: 0, low: 0 };
    const buckets = response.data.aggregations?.severities?.buckets || [];
    buckets.forEach((bucket) => {
      const key = String(bucket.key || "").toLowerCase();
      if (summary[key] !== undefined) summary[key] = Number(bucket.doc_count || 0);
    });

    return summary;
  } catch (error) {
    console.error("ELK SEVERITY SUMMARY ERROR:", error.response?.data || error.message);
    throw error;
  }
}

async function scrollElkReports(filters = {}, { batchSize = 500, maxRows = 50000, scroll = "2m" } = {}) {
  const rows = [];
  let scrollId = null;

  try {
    const query = buildElkQuery({ ...filters, from: 0, size: batchSize });
    delete query.from;
    query.sort = ["_doc"];

    const firstResponse = await axios.post(
      `${process.env.ELK_URL}/${process.env.ELK_INDEX}/_search?scroll=${encodeURIComponent(scroll)}`,
      query,
      buildElkRequestConfig()
    );

    scrollId = firstResponse.data._scroll_id;
    let hits = firstResponse.data.hits?.hits || [];
    const total = normalizeTotal(firstResponse.data.hits?.total);

    while (hits.length > 0 && rows.length < maxRows) {
      rows.push(...hits.map(mapElkItem).slice(0, maxRows - rows.length));
      if (rows.length >= maxRows || rows.length >= total) break;

      const nextResponse = await axios.post(
        `${process.env.ELK_URL}/_search/scroll`,
        { scroll, scroll_id: scrollId },
        buildElkRequestConfig()
      );
      scrollId = nextResponse.data._scroll_id;
      hits = nextResponse.data.hits?.hits || [];
    }

    return { rows, total };
  } catch (error) {
    console.error("ELK SCROLL ERROR:", error.response?.data || error.message);
    throw error;
  } finally {
    if (scrollId) {
      axios
        .delete(`${process.env.ELK_URL}/_search/scroll`, {
          ...buildElkRequestConfig(),
          data: { scroll_id: [scrollId] }
        })
        .catch(() => {});
    }
  }
}

async function getElkFilterOptions(filters = {}) {
  try {
    const query = buildElkQuery({ ...filters, from: 0, size: 0 });
    query.aggs = {
      tenants: { terms: { field: "tenant.keyword", size: 1000 } },
      analysts: { terms: { field: "user_closed_case.keyword", size: 1000 } },
      severities: { terms: { field: "severity.keyword", size: 100 } },
      priorities: { terms: { field: "priority.keyword", size: 100 } },
      locations: { terms: { field: "location.keyword", size: 100 } }
    };

    const response = await axios.post(
      `${process.env.ELK_URL}/${process.env.ELK_INDEX}/_search`,
      query,
      buildElkRequestConfig()
    );

    return {
      tenants: bucketsToValues(response.data.aggregations?.tenants?.buckets),
      analysts: bucketsToValues(response.data.aggregations?.analysts?.buckets),
      severities: bucketsToValues(response.data.aggregations?.severities?.buckets),
      priorities: bucketsToValues(response.data.aggregations?.priorities?.buckets),
      locations: bucketsToValues(response.data.aggregations?.locations?.buckets)
    };
  } catch (error) {
    console.error("ELK OPTIONS ERROR:", error.response?.data || error.message);
    throw error;
  }
}

function bucketsToValues(buckets = []) {
  return buckets.map((bucket) => String(bucket.key)).filter(Boolean);
}

function normalizeTotal(total) {
  return typeof total === "number" ? total : Number(total?.value || 0);
}

module.exports = {
  buildElkQuery,
  getElkFilterOptions,
  getElkReports,
  scrollElkReports,
  searchElkSeveritySummary,
  searchElkReports
};
