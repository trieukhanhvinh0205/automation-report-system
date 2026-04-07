const ExcelJS = require("exceljs");

async function parseExcel(buffer) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);

  const worksheet = workbook.worksheets[0];
  if (!worksheet) {
    return [];
  }

  const rows = [];
  let headers = [];
  worksheet.eachRow((row, rowNumber) => {
    const values = row.values.slice(1);
    if (rowNumber === 1) {
      headers = values.map((value) => String(value || "").trim());
      return;
    }

    const record = {};
    headers.forEach((header, index) => {
      if (!header) return;
      record[header] = values[index] ?? null;
    });
    rows.push(record);
  });

  return rows;
}

module.exports = { parseExcel };
