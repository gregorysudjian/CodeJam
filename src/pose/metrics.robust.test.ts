/// <reference types="node" />
import { existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from 'vitest';

// Offline inspection of a locally intercepted MediaPipe 1.2.3 end-of-session POST.
// The field layout comes from the installed SDK source map (Pj, Qj, Rj and Tj).
// If the SDK changes, an unfamiliar field needs inspection before renewing the Q&A claim.
interface Fields {
  [field: number]: Fields | 'integer' | 'version' | 'empty';
}
const integer = 'integer';
const stats: Fields = {
  1: integer,
  4: integer,
  5: integer,
  6: integer,
  7: integer,
  8: { 1: integer, 2: integer },
};
const client: Fields = { 1: integer, 2: 'empty', 3: 'empty', 4: 'version', 5: 'empty', 6: integer };
const event: Fields = {
  1: integer,
  2: integer,
  3: { 1: integer, 3: integer },
  4: stats,
  5: { 2: stats },
};
const batch: Fields = { 2: integer, 3: { 6: { 1: client, 2: event } } };

function inspect(message: Uint8Array, fields: Fields, path: string, seen: Set<string>) {
  let pos = 0;
  function varint() {
    let n = 0,
      weight = 1;
    while (pos < message.length) {
      const byte = message[pos++];
      n += (byte & 127) * weight;
      if (!Number.isSafeInteger(n) || !Number.isSafeInteger(weight))
        throw Error('Invalid metric integer at ' + path);
      if ((byte & 128) === 0) return n;
      weight *= 128;
    }
    throw Error('Truncated metric integer at ' + path);
  }
  while (pos < message.length) {
    const key = varint();
    const id = Math.floor(key / 8),
      wire = key % 8,
      kind = fields[id];
    const field = path + '.' + id;
    if (!kind) throw Error('Unrecognized field ' + field);
    seen.add(field);
    if (kind === integer) {
      expect(wire, field).toBe(0);
      varint();
      continue;
    }
    expect(wire, field).toBe(2);
    const size = varint();
    if (size > message.length - pos) throw Error('Truncated metric message at ' + field);
    const bytes = message.subarray(pos, pos + size);
    pos += size;
    if (typeof kind === 'object') inspect(bytes, kind, field, seen);
    else if (kind === 'empty') expect(size, field).toBe(0);
    else expect(new TextDecoder().decode(bytes), field).toBe('1.2.3');
  }
}
const local = join(tmpdir(), 'codejam-pose-sdk-flush.bin');
test.skipIf(!existsSync(local))(
  'local SDK flush contains only the inspected usage, timing and environment fields',
  () => {
    const seen = new Set<string>();
    inspect(readFileSync(local), batch, 'batch', seen);
    // Require a version, startup, an inference counter and a closing summary.
    for (const path of ['3.6.1.4', '3.6.2.3.3', '3.6.2.4.8.2', '3.6.2.5.2.8.2']) {
      expect(seen.has('batch.' + path), path).toBe(true);
    }
  },
);

test('an unfamiliar length-delimited field cannot pass a metrics inspection', () => {
  // Batch field 3 contains an envelope with one new field (4) and a byte of data.
  const unknown = Uint8Array.of(0x1a, 0x03, 0x22, 0x01, 0xff);
  expect(() => inspect(unknown, batch, 'batch', new Set())).toThrow('Unrecognized field batch.3.4');
});
