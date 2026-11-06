// Impronta SHA-256 dei file scaricati (modelli): un file troncato o alterato non si usa mai.
export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes as BufferSource);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function verifySha256(
  bytes: Uint8Array,
  expected: string,
  label = 'file',
): Promise<void> {
  const actual = await sha256Hex(bytes);
  if (actual !== expected.toLowerCase()) {
    throw new Error(
      `Impronta SHA-256 diversa per ${label}: atteso ${expected}, ottenuto ${actual}`,
    );
  }
}
