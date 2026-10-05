// Bound expansion before inflating any ZIP member and verify CRC/length after
// inflation. fflate alone is deliberately permissive about ZIP integrity.
export async function readDocxArchive(bytes: Uint8Array): Promise<Record<string, Uint8Array>> {
  function invalid(reason = "is corrupt, encrypted or unreadable"): never {
    throw new Error(`The DOCX archive ${reason}. Export a fresh DOCX and try again.`);
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let end = -1;
  for (let offset = bytes.length - 22; offset >= Math.max(0, bytes.length - 65557); offset--) {
    if (view.getUint32(offset, true) === 0x06054b50 && offset + 22 + view.getUint16(offset + 20, true) === bytes.length) { end = offset; break; }
  }
  if (end < 0) invalid();
  const count = view.getUint16(end + 10, true);
  const centralSize = view.getUint32(end + 12, true);
  const centralStart = view.getUint32(end + 16, true);
  if (!count || count > 2048 || view.getUint16(end + 4, true) || view.getUint16(end + 6, true) || view.getUint16(end + 8, true) !== count || centralStart + centralSize !== end) invalid("has an unsupported or oversized directory");
  const metadata: Record<string, { size: number; crc: number }> = Object.create(null);
  const names = new Set<string>();
  let offset = centralStart;
  let total = 0;
  for (let index = 0; index < count; index++) {
    if (offset + 46 > end || view.getUint32(offset, true) !== 0x02014b50) invalid();
    const flags = view.getUint16(offset + 8, true);
    const method = view.getUint16(offset + 10, true);
    const compressed = view.getUint32(offset + 20, true);
    const size = view.getUint32(offset + 24, true);
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const local = view.getUint32(offset + 42, true);
    const next = offset + 46 + nameLength + extraLength + commentLength;
    if (next > end || flags & 0x41 || (method !== 0 && method !== 8) || local + 30 > centralStart || view.getUint32(local, true) !== 0x04034b50) invalid();
    const name = new TextDecoder("utf-8", { fatal: true }).decode(bytes.subarray(offset + 46, offset + 46 + nameLength));
    if (names.has(name) || name.includes("\u0000") || /(^|\/)\.\.(\/|$)/.test(name)) invalid();
    names.add(name);
    const localNameLength = view.getUint16(local + 26, true);
    const payload = local + 30 + localNameLength + view.getUint16(local + 28, true);
    if (payload + compressed > centralStart || view.getUint16(local + 6, true) !== flags || view.getUint16(local + 8, true) !== method || new TextDecoder().decode(bytes.subarray(local + 30, local + 30 + localNameLength)) !== name) invalid();
    total += size;
    if (size > 32 * 1024 * 1024 || total > 64 * 1024 * 1024) invalid("expands beyond safe document limits");
    if (name === "[Content_Types].xml" || name === "word/_rels/document.xml.rels" || /^word\/(document|numbering|styles|header\d+|footer\d+)\.xml$/.test(name)) {
      if (size > 16 * 1024 * 1024) invalid("contains an oversized text part");
      metadata[name] = { size, crc: view.getUint32(offset + 16, true) };
    }
    offset = next;
  }
  if (offset !== end) invalid();
  // Lazy-loaded only for DOCX uploads; static import would put decompression
  // code in the initial extension UI bundle.
  const { unzipSync } = await import("fflate");
  let archive: Record<string, Uint8Array>;
  try { archive = unzipSync(bytes, { filter: (entry) => Object.hasOwn(metadata, entry.name) }); }
  catch { invalid(); }
  const crcTable = new Uint32Array(256);
  for (let index = 0; index < 256; index++) {
    let value = index;
    for (let bit = 0; bit < 8; bit++) value = (value >>> 1) ^ (0xedb88320 & -(value & 1));
    crcTable[index] = value;
  }
  for (const [name, data] of Object.entries(archive)) {
    let crc = 0xffffffff;
    for (const byte of data) crc = (crc >>> 8) ^ crcTable[(crc ^ byte) & 0xff];
    if (data.length !== metadata[name].size || ((crc ^ 0xffffffff) >>> 0) !== metadata[name].crc) invalid();
  }
  return archive;
}
