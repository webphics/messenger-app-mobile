import { create } from "qrcode";

import {
  QR_ERROR_CORRECTION,
  QR_QUIET_ZONE,
  qrMatrix,
  qrPath,
  type QrMatrix,
} from "@/lib/qr-code";

/** A matrix from rows of `#` (dark) and `.` (light). */
function grid(...rows: string[]): QrMatrix {
  return { size: rows.length, dark: rows.map((row) => [...row].map((cell) => cell === "#")) };
}

/**
 * The shape the API's enable response carries, at the length a real one has:
 * a 32-character base32 secret, the issuer and the account's email.
 */
const TOTP_URI =
  "otpauth://totp/ChatRoute:someone%40example.com?secret=JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP&issuer=ChatRoute&digits=6&period=30";

describe("the drawing data", () => {
  test.each([
    {
      name: "an all-light matrix draws nothing",
      matrix: grid("..", ".."),
      quiet: 0,
      d: "",
      extent: 2,
    },
    {
      name: "a single dark module is one 1x1 rectangle",
      matrix: grid("#"),
      quiet: 0,
      d: "M0 0h1v1h-1z",
      extent: 1,
    },
    {
      name: "a horizontal run is one rectangle as wide as the run",
      matrix: grid("###", "...", "..."),
      quiet: 0,
      d: "M0 0h3v1h-3z",
      extent: 3,
    },
    {
      name: "runs split at a light module",
      matrix: grid("#.#", "...", "..."),
      quiet: 0,
      d: "M0 0h1v1h-1zM2 0h1v1h-1z",
      extent: 3,
    },
    {
      name: "runs never join across rows",
      matrix: grid("##", "##"),
      quiet: 0,
      d: "M0 0h2v1h-2zM0 1h2v1h-2z",
      extent: 2,
    },
    {
      name: "a run that ends at the right edge is closed",
      matrix: grid(".##", "...", "..#"),
      quiet: 0,
      d: "M1 0h2v1h-2zM2 2h1v1h-1z",
      extent: 3,
    },
    {
      name: "the quiet zone offsets every module and widens the extent on both sides",
      matrix: grid("#.", ".#"),
      quiet: 4,
      d: "M4 4h1v1h-1zM5 5h1v1h-1z",
      extent: 10,
    },
  ])("$name", ({ matrix, quiet, d, extent }) => {
    expect(qrPath(matrix, quiet)).toEqual({ d, extent });
  });

  test("the quiet zone is four modules unless told otherwise", () => {
    expect(QR_QUIET_ZONE).toBe(4);
    expect(qrPath(grid("#"))).toEqual({ d: "M4 4h1v1h-1z", extent: 9 });
  });

  test("every dark module of a real code is covered exactly once", () => {
    const matrix = qrMatrix(TOTP_URI);
    if (!matrix) throw new Error("expected a matrix");
    const covered = matrix.dark.map((row) => row.map(() => 0));

    for (const [, x, y, w] of qrPath(matrix, 0).d.matchAll(/M(\d+) (\d+)h(\d+)v1h-\d+z/g)) {
      for (let col = Number(x); col < Number(x) + Number(w); col += 1) {
        covered[Number(y)][col] += 1;
      }
    }

    expect(covered).toEqual(matrix.dark.map((row) => row.map((cell) => (cell ? 1 : 0))));
  });
});

describe("the encoding", () => {
  test("an empty string has no code", () => {
    expect(qrMatrix("")).toBeNull();
  });

  test("error correction is M, as the setup card asks", () => {
    expect(QR_ERROR_CORRECTION).toBe("M");
    // The encoder's own record of the level, read off the same call the
    // matrix comes from. Bit 0 is M in the QR specification's format bits.
    expect(create(TOTP_URI, { errorCorrectionLevel: QR_ERROR_CORRECTION }).errorCorrectionLevel.bit).toBe(0);
  });

  test.each([
    { name: "a short string", text: "a" },
    { name: "a real otpauth link", text: TOTP_URI },
  ])("$name is a square matrix the encoder's own size", ({ text }) => {
    const matrix = qrMatrix(text);
    const { modules } = create(text, { errorCorrectionLevel: "M" });

    expect(matrix?.size).toBe(modules.size);
    expect(matrix?.dark).toHaveLength(modules.size);
    for (const row of matrix?.dark ?? []) expect(row).toHaveLength(modules.size);
  });

  test("the same link always draws the same code", () => {
    expect(qrMatrix(TOTP_URI)).toEqual(qrMatrix(TOTP_URI));
  });

  test("the three finder patterns sit in their corners", () => {
    const matrix = qrMatrix(TOTP_URI);
    if (!matrix) throw new Error("expected a matrix");
    const last = matrix.size - 1;

    // A finder's outer ring is dark at its corners and its centre is dark.
    for (const [row, col] of [
      [0, 0],
      [0, last],
      [last, 0],
      [3, 3],
      [3, last - 3],
      [last - 3, 3],
    ]) {
      expect(matrix.dark[row][col]).toBe(true);
    }
    // The fourth corner has no finder.
    expect(
      [0, 1, 2, 3, 4, 5, 6].every((offset) => matrix.dark[last][last - offset]),
    ).toBe(false);
  });
});
