import { useRef, useState, useEffect } from 'react';
import { hexToRgb, rgbToHex, rgbToHsv, hsvToRgb, isHexColor } from '../utils.js';

const clamp = (v, min, max) => Math.min(max, Math.max(min, v));

/**
 * A full-spectrum colour picker, shared across the app (web + mobile web).
 * A circular hue/saturation wheel (angle = hue, radius = saturation) plus a
 * horizontal brightness slider — nothing else. Works with mouse and touch via
 * Pointer Events. `value` is a hex string; `onChange` fires with the new hex on
 * every adjustment. HSV is the internal source of truth so hue/saturation stay
 * stable at the black/white extremes.
 */
export default function ColorPicker({ value, onChange }) {
  const [hsv, setHsv] = useState(() => rgbToHsv(hexToRgb(isHexColor(value) ? value : '#3b82f6')));

  const wheelRef = useRef(null);
  const valRef = useRef(null);
  const dragging = useRef(null);

  const hex = rgbToHex(hsvToRgb(hsv));
  const pureHex = rgbToHex(hsvToRgb({ h: hsv.h, s: hsv.s, v: 100 }));

  // Re-sync from the outside only when the incoming value is a different colour.
  useEffect(() => {
    if (isHexColor(value) && value.toLowerCase() !== hex.toLowerCase()) {
      setHsv(rgbToHsv(hexToRgb(value)));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const emit = (nextHsv) => {
    setHsv(nextHsv);
    onChange?.(rgbToHex(hsvToRgb(nextHsv)));
  };

  const moveWheel = (e) => {
    const el = wheelRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const radius = Math.min(r.width, r.height) / 2;
    const dx = e.clientX - (r.left + r.width / 2);
    const dy = e.clientY - (r.top + r.height / 2);
    const dist = Math.min(Math.hypot(dx, dy), radius);
    let deg = (Math.atan2(dy, dx) * 180) / Math.PI;
    deg = (deg + 360) % 360;
    emit({ h: Math.round(deg), s: radius ? Math.round((dist / radius) * 100) : 0, v: hsv.v });
  };
  const moveVal = (e) => {
    const el = valRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    emit({ ...hsv, v: Math.round(clamp((e.clientX - r.left) / r.width, 0, 1) * 100) });
  };
  const bind = (name, handler) => ({
    onPointerDown: (e) => {
      dragging.current = name;
      e.currentTarget.setPointerCapture?.(e.pointerId);
      handler(e);
    },
    onPointerMove: (e) => { if (dragging.current === name) handler(e); },
    onPointerUp: (e) => {
      dragging.current = null;
      e.currentTarget.releasePointerCapture?.(e.pointerId);
    },
    onPointerCancel: () => { dragging.current = null; },
  });

  const rad = (hsv.h * Math.PI) / 180;
  const thumbLeft = 50 + Math.cos(rad) * (hsv.s / 100) * 50;
  const thumbTop = 50 + Math.sin(rad) * (hsv.s / 100) * 50;

  return (
    <div className="cp">
      <div className="cp-wheel-wrap">
        <div ref={wheelRef} className="cp-wheel" {...bind('wheel', moveWheel)}>
          <div className="cp-wheel-shade" style={{ opacity: 1 - hsv.v / 100 }} />
          <span className="cp-wheel-thumb" style={{ left: `${thumbLeft}%`, top: `${thumbTop}%`, background: hex }} />
        </div>
      </div>

      <div
        ref={valRef}
        className="cp-slider"
        style={{ background: `linear-gradient(to right, #000, ${pureHex})` }}
        {...bind('val', moveVal)}
      >
        <span className="cp-slider-thumb" style={{ left: `${hsv.v}%` }} />
      </div>
    </div>
  );
}
