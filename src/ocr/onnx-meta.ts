// Metadati (chiave/valore) di un modello ONNX, letti dal protobuf senza librerie.
// ModelProto.metadata_props è il campo 14: una StringStringEntryProto { key = 1, value = 2 }.
// PP-OCRv6 tiene il dizionario dei caratteri nella chiave `character`.

const decoder = new TextDecoder('utf-8');

function readVarint(buf: Uint8Array, pos: number): [value: number, next: number] {
  let result = 0;
  let shift = 0;
  let p = pos;
  for (;;) {
    const byte = buf[p++];
    if (byte === undefined) throw new Error('File ONNX troncato (varint)');
    result += (byte & 0x7f) * 2 ** shift;
    if (!(byte & 0x80)) return [result, p];
    shift += 7;
  }
}

/** Salta un campo di cui si è appena letta l'etichetta. */
function skip(buf: Uint8Array, pos: number, wire: number): number {
  if (wire === 0) return readVarint(buf, pos)[1];
  if (wire === 1) return pos + 8;
  if (wire === 5) return pos + 4;
  if (wire === 2) {
    const [len, next] = readVarint(buf, pos);
    return next + len;
  }
  throw new Error(`Tipo di campo protobuf non supportato: ${wire}`);
}

function readEntry(buf: Uint8Array, start: number, end: number): [string, string] {
  let key = '';
  let value = '';
  let pos = start;
  while (pos < end) {
    const [tag, next] = readVarint(buf, pos);
    const field = tag >> 3;
    const wire = tag & 7;
    if (wire !== 2 || (field !== 1 && field !== 2)) {
      pos = skip(buf, next, wire);
      continue;
    }
    const [len, dataStart] = readVarint(buf, next);
    if (dataStart + len > end) throw new Error('File ONNX troncato (voce di metadati)');
    const text = decoder.decode(buf.subarray(dataStart, dataStart + len));
    if (field === 1) key = text;
    else value = text;
    pos = dataStart + len;
  }
  return [key, value];
}

export function readModelMetadata(model: Uint8Array): Record<string, string> {
  const out: Record<string, string> = {};
  let pos = 0;
  while (pos < model.length) {
    const [tag, next] = readVarint(model, pos);
    const field = tag >> 3;
    const wire = tag & 7;
    if (field === 14 && wire === 2) {
      const [len, dataStart] = readVarint(model, next);
      if (dataStart + len > model.length) throw new Error('File ONNX troncato (metadati)');
      const [k, v] = readEntry(model, dataStart, dataStart + len);
      out[k] = v;
      pos = dataStart + len;
    } else {
      pos = skip(model, next, wire);
    }
  }
  if (pos > model.length) throw new Error('File ONNX troncato');
  return out;
}
