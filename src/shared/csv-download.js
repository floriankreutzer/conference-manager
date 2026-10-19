// Only bounded, already serialized in-memory CSV can become a temporary download
// URL. This is not a general navigation or arbitrary blob-URL authorization API.
export function downloadCsvText(csv, filename) {
  if (typeof csv !== 'string' || csv.length < 1 || new TextEncoder().encode(csv).byteLength > 2_097_152
    || typeof filename !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,155}\.csv$/u.test(filename)) {
    throw new TypeError('CSV_DOWNLOAD_INVALID');
  }
  const objectUrl = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  let link = null;
  try {
    link = document.createElement('a'); link.href = objectUrl; link.download = filename; link.hidden = true;
    document.body.appendChild(link); link.click();
  } finally { link?.remove(); setTimeout(() => URL.revokeObjectURL(objectUrl), 0); }
}
