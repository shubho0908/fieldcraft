// Strict, bounded [MS-CFB] container decoding before the legacy Word reader.
// Rejects cycles, short chains and oversized stream declarations rather than
// allowing a recovery-oriented parser to return plausible partial text.
export function readDocStreams(bytes: Uint8Array): Record<string, Uint8Array> {
  function invalid(): never {
    throw new Error("The DOC container is corrupt, truncated or exceeds safe document limits. Export a fresh DOCX instead.");
  }
  if (bytes.length < 512) invalid();
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const version = view.getUint16(26, true);
  const shift = view.getUint16(30, true);
  if (view.getUint16(28, true) !== 0xfffe || !((version === 3 && shift === 9) || (version === 4 && shift === 12)) || view.getUint16(32, true) !== 6 || view.getUint32(56, true) !== 4096) invalid();
  const sectorSize = 2 ** shift;
  if (bytes.length % sectorSize) invalid();
  const sectors = bytes.length / sectorSize - 1;
  const fatCount = view.getUint32(44, true);
  const difatCount = view.getUint32(72, true);
  if (!fatCount || fatCount > sectors || difatCount > sectors) invalid();
  function sector(id: number): Uint8Array {
    if (id >= sectors) invalid();
    return bytes.subarray((id + 1) * sectorSize, (id + 2) * sectorSize);
  }
  const fatIds: number[] = [];
  const seenFat = new Set<number>();
  function addFat(id: number) {
    if (id === 0xffffffff) return;
    if (id >= sectors || seenFat.has(id)) invalid();
    seenFat.add(id); fatIds.push(id);
  }
  for (let index = 0; index < 109; index++) addFat(view.getUint32(76 + index * 4, true));
  let difat = view.getUint32(68, true);
  const seenDifat = new Set<number>();
  for (let index = 0; index < difatCount; index++) {
    if (seenDifat.has(difat)) invalid();
    seenDifat.add(difat);
    const data = sector(difat);
    const entries = new DataView(data.buffer, data.byteOffset, data.byteLength);
    for (let offset = 0; offset < sectorSize - 4; offset += 4) addFat(entries.getUint32(offset, true));
    difat = entries.getUint32(sectorSize - 4, true);
  }
  if (fatIds.length !== fatCount || (difatCount && difat !== 0xfffffffe)) invalid();
  const fat = new Uint32Array(fatCount * sectorSize / 4);
  fatIds.forEach((id, index) => {
    const data = sector(id);
    const entries = new DataView(data.buffer, data.byteOffset, data.byteLength);
    for (let offset = 0; offset < sectorSize; offset += 4) fat[index * sectorSize / 4 + offset / 4] = entries.getUint32(offset, true);
  });
  function chain(start: number, links: Uint32Array, maximum: number): number[] {
    const ids: number[] = [];
    const seen = new Set<number>();
    for (let id = start; id !== 0xfffffffe; id = links[id]) {
      if (!Number.isInteger(id) || id >= maximum || id >= links.length || seen.has(id)) invalid();
      seen.add(id); ids.push(id);
    }
    return ids;
  }
  function normal(start: number, size?: number): Uint8Array {
    const ids = chain(start, fat, sectors);
    const length = size ?? ids.length * sectorSize;
    if (length > bytes.length || ids.length !== Math.ceil(length / sectorSize)) invalid();
    const output = new Uint8Array(length);
    ids.forEach((id, index) => output.set(sector(id).subarray(0, Math.min(sectorSize, length - index * sectorSize)), index * sectorSize));
    return output;
  }
  const directory = normal(view.getUint32(48, true));
  const entries = new DataView(directory.buffer);
  const records: { name: string; type: number; start: number; size: number }[] = [];
  let totalSize = 0;
  for (let offset = 0; offset + 128 <= directory.length; offset += 128) {
    const type = entries.getUint8(offset + 66);
    if (type === 0) continue;
    const nameSize = entries.getUint16(offset + 64, true);
    if (nameSize < 2 || nameSize > 64 || nameSize % 2) invalid();
    const name = new TextDecoder("utf-16le").decode(directory.subarray(offset, offset + nameSize - 2));
    const low = entries.getUint32(offset + 120, true);
    const high = entries.getUint32(offset + 124, true);
    if (high && version === 4) invalid();
    if ((type === 2 || type === 5) && (low > bytes.length || (totalSize += low) > 32 * 1024 * 1024)) invalid();
    records.push({ name, type, start: entries.getUint32(offset + 116, true), size: low });
  }
  const root = records.find((entry) => entry.type === 5);
  if (!root) invalid();
  const miniStream = root.size ? normal(root.start, root.size) : new Uint8Array();
  const miniFatCount = view.getUint32(64, true);
  if (miniFatCount > sectors) invalid();
  const miniFatData = miniFatCount ? normal(view.getUint32(60, true), miniFatCount * sectorSize) : new Uint8Array();
  const miniFatView = new DataView(miniFatData.buffer);
  const miniFat = new Uint32Array(miniFatData.length / 4);
  for (let index = 0; index < miniFat.length; index++) miniFat[index] = miniFatView.getUint32(index * 4, true);
  const streams: Record<string, Uint8Array> = {};
  for (const entry of records.filter((record) => record.type === 2)) {
    if (Object.hasOwn(streams, entry.name)) invalid();
    if (!entry.size) { streams[entry.name] = new Uint8Array(); continue; }
    if (entry.size >= 4096) streams[entry.name] = normal(entry.start, entry.size);
    else {
      const ids = chain(entry.start, miniFat, Math.ceil(miniStream.length / 64));
      if (ids.length !== Math.ceil(entry.size / 64)) invalid();
      const data = new Uint8Array(entry.size);
      ids.forEach((id, index) => {
        const length = Math.min(64, entry.size - index * 64);
        if (id * 64 + length > miniStream.length) invalid();
        data.set(miniStream.subarray(id * 64, id * 64 + length), index * 64);
      });
      streams[entry.name] = data;
    }
  }
  return streams;
}
