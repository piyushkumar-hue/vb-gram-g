function csvCell(value) {
  let text = value === null || value === undefined ? '' : String(value);
  const isFiniteNumber = typeof value === 'number' && Number.isFinite(value);
  if (!isFiniteNumber && (/^[\t\r\n ]*[=+\-@]/.test(text) || /^[\t\r\n]/.test(text))) {
    text = `'${text}`;
  }
  return `"${text.replaceAll('"', '""')}"`;
}

module.exports = { csvCell };
