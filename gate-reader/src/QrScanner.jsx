import React, { useEffect, useRef, useState } from 'react';
import jsQR from 'jsqr';
import { colors } from '../../shared/tokens.js';

// Camera-based QR scanning: reads frames off a hidden <video> onto a
// <canvas>, decodes with jsQR, and reports the first successful payload.
// Used as an alternative to a physical RFID tap — the QR content is treated
// exactly like a scanned tag UID.
export default function QrScanner({ onDetect, onClose }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const rafRef = useRef(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;

    async function start() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        tick();
      } catch {
        if (!cancelled) setError('Could not access the camera. Check browser permissions.');
      }
    }

    function tick() {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (!video || !canvas || video.readyState !== video.HAVE_ENOUGH_DATA) {
        rafRef.current = requestAnimationFrame(tick);
        return;
      }
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const frame = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const code = jsQR(frame.data, frame.width, frame.height);
      if (code && code.data) {
        onDetect(code.data);
        return;
      }
      rafRef.current = requestAnimationFrame(tick);
    }

    start();
    return () => {
      cancelled = true;
      cancelAnimationFrame(rafRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, [onDetect]);

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }}>
      <div style={{ width: 420, borderRadius: 22, background: colors.surfaceDeep, border: `1px solid ${colors.border}`, padding: 24, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontWeight: 700, fontSize: 18, color: colors.textPrimary }}>Scan QR code</div>
        {error ? (
          <div style={{ fontSize: 13, color: colors.redLight }}>{error}</div>
        ) : (
          <div style={{ position: 'relative', borderRadius: 14, overflow: 'hidden', background: '#000' }}>
            <video ref={videoRef} playsInline muted style={{ width: '100%', display: 'block' }} />
            <div style={{ position: 'absolute', inset: 24, border: `2px solid ${colors.lime}`, borderRadius: 12, pointerEvents: 'none' }} />
          </div>
        )}
        <canvas ref={canvasRef} style={{ display: 'none' }} />
        <button
          onClick={onClose}
          style={{ padding: '12px 16px', borderRadius: 12, background: 'transparent', color: colors.textMid, fontWeight: 700, fontSize: 13, border: `1px solid ${colors.border}`, cursor: 'pointer', fontFamily: "'Space Grotesk',sans-serif" }}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
