import { useEffect, useRef } from "react";
import QRCode from "qrcode";

interface QrCodeProps {
  data: string;
  size?: number;
}

export default function QrCode({ data, size = 160 }: QrCodeProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (canvasRef.current && data) {
      QRCode.toCanvas(canvasRef.current, data, {
        width: size,
        margin: 1,
        color: {
          dark: "#f5f5f5",
          light: "#171717",
        },
      });
    }
  }, [data, size]);

  return <canvas ref={canvasRef} className="rounded" />;
}
