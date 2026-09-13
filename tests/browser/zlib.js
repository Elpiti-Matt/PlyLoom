// Browser stand-in for node:zlib. Stored (uncompressed) raw DEFLATE blocks are valid input for the decoders;
// the decompression-bomb test therefore checks a large input rather than a high compression ratio.
// deflateRawSync with stored (uncompressed) blocks: valid raw DEFLATE, enough to feed the decoders under test.
export function deflateRawSync(input) {
  const data = typeof input === "string" ? new TextEncoder().encode(input) : new Uint8Array(input);
  const blocks = Math.max(1, Math.ceil(data.length / 65535)), out = new Uint8Array(data.length + blocks * 5);
  let o = 0;
  for (let i = 0; i < blocks; i++) {
    const chunk = data.subarray(i * 65535, Math.min(data.length, (i + 1) * 65535)), len = chunk.length;
    out[o++] = i === blocks - 1 ? 1 : 0; out[o++] = len & 255; out[o++] = len >> 8; out[o++] = ~len & 255; out[o++] = (~len >> 8) & 255;
    out.set(chunk, o); o += len;
  }
  return { bytes: out, toString(enc) { if (enc !== "base64") throw new Error("only base64"); let s = ""; for (let i = 0; i < out.length; i += 0x8000) s += String.fromCharCode(...out.subarray(i, i + 0x8000)); return btoa(s); } };
}
