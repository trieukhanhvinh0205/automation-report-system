const CUSTOMER_CATALOG = {
  VSP: {
    code: "VSP",
    name: "VSP",
    full_name: "SOC Liên doanh Việt - Nga Vietsovpetro",
    tenant: "vsp"
  },
  BD: {
    code: "BD",
    name: "BD",
    full_name: "Công Ty Điều hành Dầu khí Biển Đông",
    tenant: "bd"
  },
  NVL: {
    code: "NVL",
    name: "NVL",
    full_name: "Công ty TNHH Địa ốc NovaHome",
    tenant: "nvl"
  },
  NVH: {
    code: "NVH",
    name: "NVH",
    full_name: "Công ty TNHH Địa ốc NovaHome",
    tenant: "nvh"
  },
  PVOIL: {
    code: "PVOIL",
    name: "PVOIL",
    full_name: "Tổng công ty Dầu Việt Nam - Công ty Cổ phần",
    tenant: "pvoil"
  },
  PVO: {
    code: "PVOIL",
    name: "PVOIL",
    full_name: "Tổng công ty Dầu Việt Nam - Công ty Cổ phần",
    tenant: "pvo"
  },
  NAB: {
    code: "NAB",
    name: "NAB",
    full_name: "Ngân hàng TMCP Nam Á",
    tenant: "nab"
  },
  VPC: {
    code: "VPC",
    name: "VPC",
    full_name: "Bệnh viện Quốc tế Hồng Bàng",
    tenant: "vpc"
  },
  MASVN: {
    code: "MASVN",
    name: "MASVN",
    full_name: "Công ty Cổ phần Chứng Khoán Mirae Asset (Việt Nam)",
    tenant: "masvn"
  },
  TDTP: {
    code: "TDTP",
    name: "TDTP",
    full_name: "Công ty TNHH Nhiệt Điện Thủ Đức",
    tenant: "tdtp"
  },
  PQPOC: {
    code: "PQPOC",
    name: "PQPOC",
    full_name: "Công ty Điều hành dầu khí Phú Quốc",
    tenant: "pqpoc"
  },
  VBD: {
    code: "VBD",
    name: "VBD",
    full_name: "Công Ty Cổ phần Tin Học - Bản Đồ Việt Nam (Vietbando)",
    tenant: "vbd"
  },
  VB: {
    code: "VB",
    name: "VB",
    full_name: "Ngân hàng thương mại cổ phần Việt Nam Thương Tín",
    tenant: "vb"
  },
  VAB: {
    code: "VAB",
    name: "VAB",
    full_name: "Ngân hàng Thương mại Cổ phần Việt Á",
    tenant: "vab"
  }
};

const CUSTOMER_BY_TENANT = Object.values(CUSTOMER_CATALOG).reduce((acc, customer) => {
  acc[String(customer.tenant).toLowerCase()] = customer;
  return acc;
}, {});

function getCanonicalCustomer(row = {}) {
  const code = String(row.code || "").trim().toUpperCase();
  const tenant = String(row.tenant || "").trim().toLowerCase();
  return CUSTOMER_CATALOG[code] || CUSTOMER_BY_TENANT[tenant] || null;
}

function normalizeCustomer(row = {}) {
  const canonical = getCanonicalCustomer(row);
  if (!canonical) return row;
  return {
    ...row,
    code: canonical.code || row.code,
    name: canonical.name || row.name,
    full_name: canonical.full_name || row.full_name,
    tenant: row.tenant || canonical.tenant
  };
}

function customerFromTenant(tenant) {
  const tenantText = String(tenant || "").trim();
  const code = tenantText.toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  const canonical = CUSTOMER_CATALOG[code] || CUSTOMER_BY_TENANT[tenantText.toLowerCase()];
  if (canonical) {
    return {
      ...canonical,
      tenant: tenantText || canonical.tenant
    };
  }
  return {
    code: (code || "UNKNOWN").slice(0, 50),
    name: code || tenantText || "UNKNOWN",
    full_name: code || tenantText || "UNKNOWN",
    tenant: tenantText
  };
}

module.exports = {
  CUSTOMER_CATALOG,
  customerFromTenant,
  normalizeCustomer
};
