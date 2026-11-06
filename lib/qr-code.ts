import { create } from "qrcode";

/**
 * A QR code as data, and the one path that draws it.
 *
 * Pure: it imports the encoder and nothing native, so the screen that draws
 * it (`components/settings/setup-qr-code.tsx`) owns `react-native-svg` alone
 * and everything here is table-tested.
 *
 * Built for the two-factor setup card, where the text is an `otpauth://`
 * link holding the account's secret. Nothing here caches, logs or writes
 * anything: a matrix exists for as long as the caller holds it.
 */

/**
 * Modules of light margin on every side. The QR specification asks for four,
 * and a camera that cannot find the edge of the code reads nothing.
 */
export const QR_QUIET_ZONE = 4;

/**
 * Error correction M: about 15% of the code can be lost and it still reads.
 * The setup card asks for M or higher, and higher grows the code a version
 * for an `otpauth://` link with nothing gained on a clean screen.
 */
export const QR_ERROR_CORRECTION = "M" as const;

/** The encoded modules: `dark[row][col]`, square, `size` on each side. */
export type QrMatrix = {
  size: number;
  dark: readonly (readonly boolean[])[];
};

/**
 * Encode `text` at error correction M. Null for an empty string, which the
 * encoder refuses and which would draw a code that says nothing.
 */
export function qrMatrix(text: string): QrMatrix | null {
  if (text.length === 0) return null;
  const { modules } = create(text, { errorCorrectionLevel: QR_ERROR_CORRECTION });
  const dark: boolean[][] = [];
  for (let row = 0; row < modules.size; row += 1) {
    const line: boolean[] = [];
    for (let col = 0; col < modules.size; col += 1) {
      line.push(Boolean(modules.get(row, col)));
    }
    dark.push(line);
  }
  return { size: modules.size, dark };
}

/**
 * The drawing data for a matrix: one SVG path of the dark modules, in module
 * units, offset by the quiet zone, inside a square `extent` modules wide.
 *
 * One rectangle per horizontal run of dark modules rather than per module, so
 * a version 7 code is a few hundred subpaths instead of a few thousand
 * elements. Each run is a closed rectangle, `M x y h w v 1 h -w z`, so runs
 * never join across rows and the fill rule cannot open a hole.
 */
export function qrPath(
  matrix: QrMatrix,
  quietZone: number = QR_QUIET_ZONE,
): { extent: number; d: string } {
  const parts: string[] = [];
  for (let row = 0; row < matrix.size; row += 1) {
    const line = matrix.dark[row];
    let col = 0;
    while (col < matrix.size) {
      if (!line[col]) {
        col += 1;
        continue;
      }
      const start = col;
      while (col < matrix.size && line[col]) col += 1;
      const width = col - start;
      parts.push(`M${start + quietZone} ${row + quietZone}h${width}v1h-${width}z`);
    }
  }
  return { extent: matrix.size + quietZone * 2, d: parts.join("") };
}
