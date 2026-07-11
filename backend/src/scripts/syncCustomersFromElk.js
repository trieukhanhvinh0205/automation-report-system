require("dotenv").config();

const pool = require("../db");
const { getElkFilterOptions } = require("../services/elkService");

function toCustomerCode(tenant) {
  const code = String(tenant || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return (code || "UNKNOWN").slice(0, 50);
}

function toCustomerName(tenant) {
  return toCustomerCode(tenant);
}

async function syncCustomersFromElk() {
  const options = await getElkFilterOptions({});
  const tenants = Array.from(new Set((options.tenants || []).map((tenant) => String(tenant).trim()).filter(Boolean))).sort();

  if (tenants.length === 0) {
    console.log("No ELK tenants found. Nothing to sync.");
    return;
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const existingResult = await client.query("SELECT id, code, tenant FROM customers WHERE tenant IS NOT NULL");
    const existingByTenant = new Map(
      existingResult.rows
        .filter((row) => row.tenant)
        .map((row) => [String(row.tenant).trim().toLowerCase(), row])
    );

    for (const tenant of tenants) {
      const tenantKey = tenant.toLowerCase();
      const existing = existingByTenant.get(tenantKey);
      if (existing) {
        await client.query("UPDATE customers SET tenant = $1, updated_at = NOW() WHERE id = $2", [tenant, existing.id]);
        continue;
      }

      const code = toCustomerCode(tenant);
      const name = toCustomerName(tenant);
      const result = await client.query(
        `INSERT INTO customers (code, name, full_name, tenant)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (code) DO UPDATE SET
           name = COALESCE(NULLIF(customers.name, ''), EXCLUDED.name),
           full_name = COALESCE(NULLIF(customers.full_name, ''), EXCLUDED.full_name),
           tenant = EXCLUDED.tenant,
           updated_at = NOW()
         RETURNING id, code, tenant`,
        [code, name, name, tenant]
      );
      existingByTenant.set(tenantKey, result.rows[0]);
    }

    await client.query("COMMIT");
    console.log(`Synced ${tenants.length} customers from ELK tenants: ${tenants.join(", ")}`);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

syncCustomersFromElk()
  .catch((error) => {
    console.error("Failed to sync customers from ELK:", error.response?.data || error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
