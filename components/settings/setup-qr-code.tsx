import { useMemo } from "react";
import { View } from "react-native";
import Svg, { Path, Rect } from "react-native-svg";

import { qrMatrix, qrPath } from "@/lib/qr-code";

/**
 * Black on white whatever the app theme. A camera reads dark modules on a
 * light field; an inverted code is one many authenticator apps cannot scan,
 * so these are not theme tokens on purpose.
 */
const QR_DARK = "#000000";
const QR_LIGHT = "#FFFFFF";

/**
 * Wide enough for a phone camera to read a version 7 code from about 30 cm:
 * at 208 pt each module of a 45-module code plus its quiet zone is about
 * 3.9 pt.
 */
export const SETUP_QR_SIZE = 208;

/**
 * `text` drawn as a QR code: the quiet zone is part of the white square, so
 * the code scans against any card colour behind it.
 *
 * One image to a screen reader, named by `accessibilityLabel`. The encoded
 * text is never exposed, because on the setup card it holds the secret and
 * the setup key is already there as text.
 *
 * Nothing is cached: the matrix lives in this component's memo and goes when
 * the component unmounts.
 */
export function SetupQrCode({
  text,
  accessibilityLabel,
  size = SETUP_QR_SIZE,
}: {
  text: string;
  accessibilityLabel: string;
  size?: number;
}) {
  const drawing = useMemo(() => {
    const matrix = qrMatrix(text);
    return matrix ? qrPath(matrix) : null;
  }, [text]);

  if (!drawing) return null;

  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={accessibilityLabel}
      className="self-center overflow-hidden rounded-xl"
      style={{ width: size, height: size }}
    >
      <Svg
        width={size}
        height={size}
        viewBox={`0 0 ${drawing.extent} ${drawing.extent}`}
      >
        <Rect x={0} y={0} width={drawing.extent} height={drawing.extent} fill={QR_LIGHT} />
        <Path d={drawing.d} fill={QR_DARK} />
      </Svg>
    </View>
  );
}
