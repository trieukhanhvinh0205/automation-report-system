const axios = require("axios");
require("dotenv").config();

async function getElkReports() {
  try {
    console.log("ELK URL:", process.env.ELK_URL);

    const response = await axios.post(
      `${process.env.ELK_URL}/${process.env.ELK_INDEX}/_search`,
      {
        size: 20,
        sort: [{ "@timestamp": { order: "desc" } }],
        query: {
          match_all: {}
        }
      },
      {
        auth: {
          username: process.env.ELK_USERNAME,
          password: process.env.ELK_PASSWORD
        },
        headers: {
          "Content-Type": "application/json"
        },
        httpsAgent: new (require("https").Agent)({
          rejectUnauthorized: false
        })
      }
    );

    // return response.data.hits.hits;
    return response.data.hits.hits.map(item => ({
    id: item._id,
    timestamp: item._source["@timestamp"],
    alertName: item._source.siem_alert_name,
    severity: item._source.severity,
    priority: item._source.priority,
    tactics: item._source.mitre_tactic,
    techniques: item._source.mitre_technique,
    resolution: item._source.resolution,
    analyst: item._source.user_closed_case,
    tenant: item._source.tenant
    }));
  } catch (error) {
    console.error("ELK ERROR:", error.response?.data || error.message);
    throw error;
  }
}

module.exports = {
  getElkReports
};