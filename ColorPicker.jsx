import { useState, useRef, useEffect, forwardRef, useImperativeHandle } from 'react';
import { createPortal } from 'react-dom';
import './ColorPicker.css';

// -- Unique ID per instance (avoids SVG gradient ID conflicts) ------
let _instanceCount = 0;

// -- Module-level helpers (stable references) -----------------------
const clamp  = (v, lo, hi) => v < lo ? lo : v > hi ? hi : v;
const HEX_RE = /^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

// -- Color converters ------------------------------------------------
function HSLAToRGBA(h, s, l, a, toHex) {
    h = ((h % 360) + 360) % 360;
    s /= 100; l /= 100;
    const c = (1 - Math.abs(2 * l - 1)) * s;
    const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
    const m = l - c / 2;
    let r = 0, g = 0, b = 0;
    if      (h < 60)  { r = c; g = x; }
    else if (h < 120) { r = x; g = c; }
    else if (h < 180) { g = c; b = x; }
    else if (h < 240) { g = x; b = c; }
    else if (h < 300) { r = x; b = c; }
    else              { r = c; b = x; }
    r = Math.round((r + m) * 255);
    g = Math.round((g + m) * 255);
    b = Math.round((b + m) * 255);
    return toHex ? RGBAToHexA(r, g, b, a) : { r, g, b, a };
}

function RGBAToHSLA(r, g, b, a) {
    a = (a === undefined) ? 1 : +a;
    r /= 255; g /= 255; b /= 255;
    const cmin  = Math.min(r, g, b);
    const cmax  = Math.max(r, g, b);
    const delta = cmax - cmin;
    let h = 0, s = 0;
    const l = (cmax + cmin) / 2;
    if (delta !== 0) {
        s = delta / (1 - Math.abs(2 * l - 1));
        if      (cmax === r) h = ((g - b) / delta) % 6;
        else if (cmax === g) h = (b - r) / delta + 2;
        else                 h = (r - g) / delta + 4;
    }
    h = Math.round(h * 60);
    if (h < 0) h += 360;
    return { h, s: parseFloat((s * 100).toFixed(4)), l: parseFloat((l * 100).toFixed(4)), a };
}

function RGBAToHexA(r, g, b, a) {
    const pad   = n => n.toString(16).padStart(2, '0');
    const rgb   = pad(r) + pad(g) + pad(b);
    const alpha = pad(Math.round(a * 255));
    return '#' + (alpha === 'ff' ? rgb : rgb + alpha);
}

function parseColor(color) {
    const fallback = { h: 0, s: 100, l: 50, a: 1 };
    if (!isValidColorString(color)) return fallback;
    color = color.trim().toLowerCase();
    if (color[0] === '#') {
        let hex = color;
        if (hex.length === 4) hex = '#' + hex[1]+hex[1]+hex[2]+hex[2]+hex[3]+hex[3];
        if (hex.length === 5) hex = '#' + hex[1]+hex[1]+hex[2]+hex[2]+hex[3]+hex[3]+hex[4]+hex[4];
        if (hex.length === 7) hex += 'ff';
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        const a = +(parseInt(hex.slice(7, 9), 16) / 255).toFixed(3);
        return RGBAToHSLA(r, g, b, a);
    }
    const parts = color.match(/-?\d*\.?\d+%?/g);
    const nums  = parts.map(parseFloat);
    if (color.startsWith('rgb')) {
        const isPercent = parts[0].endsWith('%');
        const r = isPercent ? Math.round(nums[0] * 2.55) : nums[0];
        const g = isPercent ? Math.round(nums[1] * 2.55) : nums[1];
        const b = isPercent ? Math.round(nums[2] * 2.55) : nums[2];
        const a = parts[3] ? (parts[3].endsWith('%') ? nums[3] / 100 : nums[3]) : 1;
        return RGBAToHSLA(r, g, b, a);
    }
    if (color.startsWith('hsl')) {
        const h = ((nums[0] % 360) + 360) % 360;
        const a = parts[3] ? (parts[3].endsWith('%') ? nums[3] / 100 : nums[3]) : 1;
        return { h, s: nums[1], l: nums[2], a };
    }
    return fallback;
}

function isValidColorString(color) {
    if (!color || typeof color !== 'string') return false;
    color = color.trim().toLowerCase();
    if (color[0] === '#') return HEX_RE.test(color);
    const parts = color.match(/-?\d*\.?\d+%?/g);
    if (!parts) return false;
    const nums = parts.map(parseFloat);
    if (nums.some(n => !Number.isFinite(n))) return false;
    if (color.startsWith('rgb')) {
        const isPercent = parts[0].endsWith('%');
        const [r, g, b] = nums;
        const a = parts[3] ? (parts[3].endsWith('%') ? nums[3] / 100 : nums[3]) : 1;
        const max = isPercent ? 100 : 255;
        return parts.length >= 3 && r >= 0 && r <= max && g >= 0 && g <= max && b >= 0 && b <= max && a >= 0 && a <= 1;
    }
    if (color.startsWith('hsl')) {
        const [h, s, l] = nums;
        const a = parts[3] ? (parts[3].endsWith('%') ? nums[3] / 100 : nums[3]) : 1;
        return parts.length >= 3 && Number.isFinite(h) && s >= 0 && s <= 100 && l >= 0 && l <= 100 && a >= 0 && a <= 1;
    }
    return false;
}

function buildColorSet(h, s, l, a) {
    const rgba = HSLAToRGBA(h, s, l, a);
    const hexa = RGBAToHexA(rgba.r, rgba.g, rgba.b, a);
    const hex  = '#' + hexa.slice(1, 7);
    return {
        hex, hexa,
        rgb:  `rgb(${rgba.r}, ${rgba.g}, ${rgba.b})`,
        rgba: `rgba(${rgba.r}, ${rgba.g}, ${rgba.b}, ${a})`,
        hsl:  `hsl(${h}, ${s}%, ${l}%)`,
        hsla: `hsla(${h}, ${s}%, ${l}%, ${a})`,
    };
}

// -- Component -------------------------------------------------------
const ColorPicker = forwardRef(function ColorPicker(
    { color = '#ff0000', onChange, onOpen, onClose, alpha: alphaEnabled = true, debounce: debounceMs = 0, disabled = false, className, style },
    ref
) {
    // -- Unique SVG IDs for this instance -----------------------
    const iid = useRef(++_instanceCount);
    const uid = name => `hcg_${iid.current}_${name}`;

    // -- UI state -----------------------------------------------
    const [isOpen,       setIsOpen]       = useState(false);
    const [colorMode,    setColorMode]    = useState('HEXA');
    const [pickerPos,    setPickerPos]    = useState({ top: 0, left: 0 });
    const [alphaVisible, setAlphaVisible] = useState(alphaEnabled);
    const [copyDone,     setCopyDone]     = useState(false);
    const copyTimeoutRef = useRef(null);

    // -- Current color (ref - no re-render during drag) ---------
    const cur = useRef(parseColor(isValidColorString(color) ? color : '#ff0000'));
    // - fix 6: initialise with the real starting hex so defaultValue and early getColor() are correct
    const _ia    = alphaEnabled ? cur.current.a : 1;
    const _irgba = HSLAToRGBA(cur.current.h, cur.current.s, cur.current.l, _ia);
    const lastHex = useRef(RGBAToHexA(_irgba.r, _irgba.g, _irgba.b, _ia));

    // -- Keep refs in sync --------------------------------------
    const colorModeRef = useRef('HEXA');
    const alphaOnRef   = useRef(alphaEnabled);
    const onChangeRef  = useRef(onChange);
    const onOpenRef    = useRef(onOpen);
    const onCloseRef   = useRef(onClose);
    // - fix 2: track disabled in a ref so the imperative open() always reads the latest value
    const disabledRef  = useRef(disabled);
    useEffect(() => { colorModeRef.current = colorMode; },    [colorMode]);
    useEffect(() => { alphaOnRef.current   = alphaEnabled; }, [alphaEnabled]);
    useEffect(() => { onChangeRef.current  = onChange; },     [onChange]);
    useEffect(() => { onOpenRef.current    = onOpen; },       [onOpen]);
    useEffect(() => { onCloseRef.current   = onClose; },      [onClose]);
    useEffect(() => { disabledRef.current  = disabled; },     [disabled]);
    // - fix 3: sync alphaVisible state when the alpha prop changes after mount
    useEffect(() => { setAlphaVisible(alphaEnabled); },       [alphaEnabled]);

    // -- Debounce refs ------------------------------------------
    const debounceRef      = useRef(debounceMs);
    const emitTimerRef     = useRef(null);
    const pendingColorsRef = useRef(null);
    const pendingSourceRef = useRef(null);
    const colorSourceRef   = useRef('drag');   // 'drag' | 'input' | 'api' | 'eyedropper'
    useEffect(() => { debounceRef.current = debounceMs; }, [debounceMs]);

    // -- Active drag ('box' | 'hue' | 'alpha' | null) ----------
    const drag               = useRef(null);
    const currentPointerIdRef = useRef(null);

    // -- DOM refs -----------------------------------------------
    const prevHueRef      = useRef(-1);
    const activeRectRef   = useRef(null);
    const btnRef          = useRef(null);
    const pickerElRef     = useRef(null);
    const colorBoxRef     = useRef(null);
    const boxDraggerRef   = useRef(null);
    const hueSliderRef    = useRef(null);
    const hueDraggerRef   = useRef(null);
    const alphaSliderRef  = useRef(null);
    const alphaDraggerRef = useRef(null);
    const satStopRef      = useRef(null);
    const opacStopRef     = useRef(null);
    const colorPrevRef    = useRef(null);
    const hexInputRef     = useRef(null);
    const rRef = useRef(null), gRef = useRef(null), bRef = useRef(null), aRgbaRef = useRef(null);
    const hRef = useRef(null), sRef = useRef(null), lRef = useRef(null), aHslaRef = useRef(null);

    // -- SVG helpers (direct DOM - no re-render) ----------------
    function setStops(h) {
        if (h === prevHueRef.current) return;
        prevHueRef.current = h;
        const c = `hsl(${h},100%,50%)`;
        satStopRef.current?.setAttribute('stop-color', c);
        opacStopRef.current?.setAttribute('stop-color', c);
    }

    function setDraggers(h, s, l, a) {
        const s_hsl = s / 100, l_hsl = l / 100;
        const b_hsb = l_hsl + s_hsl * Math.min(l_hsl, 1 - l_hsl);
        const s_hsb = b_hsb === 0 ? 0 : 2 * (1 - l_hsl / b_hsb);
        const bx = clamp(s_hsb * 227 + 3, 3, 230);
        const by = clamp((1 - b_hsb) * 127 + 3, 3, 130);
        if (boxDraggerRef.current)   boxDraggerRef.current.style.transform   = `translate3d(${bx}px, ${by}px, 0)`;
        const hueX   = clamp((1 - h / 360) * 130, 0, 130);
        const alphaX = clamp(a * 130, 0, 130);
        if (hueDraggerRef.current)   hueDraggerRef.current.style.transform   = `translate3d(${hueX}px, 6.5px, 0)`;
        if (alphaDraggerRef.current) alphaDraggerRef.current.style.transform = `translate3d(${alphaX}px, 6.5px, 0)`;
    }

    function setInputs(h, s, l, a) {
        const mode = colorModeRef.current;
        const skip = document.activeElement;
        if (mode === 'HEXA') {
            if (hexInputRef.current && hexInputRef.current !== skip)
                hexInputRef.current.value = HSLAToRGBA(h, s, l, a, true);
        } else if (mode === 'RGBA') {
            const rgba = HSLAToRGBA(h, s, l, a);
            if (rRef.current     && rRef.current     !== skip) rRef.current.value     = rgba.r;
            if (gRef.current     && gRef.current     !== skip) gRef.current.value     = rgba.g;
            if (bRef.current     && bRef.current     !== skip) bRef.current.value     = rgba.b;
            if (aRgbaRef.current && aRgbaRef.current !== skip) aRgbaRef.current.value = rgba.a;
        } else {
            if (hRef.current     && hRef.current     !== skip) hRef.current.value     = h;
            if (sRef.current     && sRef.current     !== skip) sRef.current.value     = Math.round(s);
            if (lRef.current     && lRef.current     !== skip) lRef.current.value     = Math.round(l);
            if (aHslaRef.current && aHslaRef.current !== skip) aHslaRef.current.value = a;
        }
    }

    // -- Release pointer capture and reset drag state -----------
    const stopDragFn = useRef(null);
    stopDragFn.current = () => {
        if (currentPointerIdRef.current !== null) {
            const el = drag.current === 'box'   ? colorBoxRef.current
                     : drag.current === 'hue'   ? hueSliderRef.current
                     : drag.current === 'alpha' ? alphaSliderRef.current
                     : null;
            if (el) { try { el.releasePointerCapture(currentPointerIdRef.current); } catch (_) {} }
            currentPointerIdRef.current = null;
        }
        drag.current = null;
    };

    // -- Flush debounced change immediately (called before close)
    const flushDebounce = useRef(null);
    flushDebounce.current = () => {
        if (emitTimerRef.current) {
            clearTimeout(emitTimerRef.current);
            emitTimerRef.current = null;
            if (pendingColorsRef.current) {
                onChangeRef.current?.(pendingColorsRef.current, pendingSourceRef.current);
                pendingColorsRef.current = null;
                pendingSourceRef.current = null;
            }
        }
    };

    function emitChange() {
        const { h, s, l, a } = cur.current;
        const colors = buildColorSet(h, s, l, a);
        if (colors.hexa === lastHex.current) return;
        lastHex.current = colors.hexa;
        if (btnRef.current) {
            btnRef.current.dataset.color    = colors.hexa;
            btnRef.current.style.background = colors.hexa;
        }
        colorPrevRef.current?.setAttribute('fill', colors.hexa);
        const src = colorSourceRef.current;
        if (debounceRef.current > 0) {
            pendingColorsRef.current = colors;
            pendingSourceRef.current = src;
            clearTimeout(emitTimerRef.current);
            emitTimerRef.current = setTimeout(() => {
                emitTimerRef.current = null;
                onChangeRef.current?.(pendingColorsRef.current, pendingSourceRef.current);
                pendingColorsRef.current = null;
                pendingSourceRef.current = null;
            }, debounceRef.current);
        } else {
            onChangeRef.current?.(colors, src);
        }
    }

    // -- RAF drag throttle --------------------------------------
    const rafId = useRef(null);

    const queueUpdate = () => {
        if (rafId.current) return;
        rafId.current = requestAnimationFrame(() => {
            rafId.current = null;
            const { h, s, l, a } = cur.current;
            setInputs(h, s, l, a);
            emitChange();
        });
    };

    // -- Drag handlers (stored in ref - always latest version) --
    const fn = useRef({});

    fn.current.box = (clientX, clientY) => {
        const rect = activeRectRef.current;
        if (!rect) return;
        const ex    = clamp(clientX - rect.left, 3, 230);
        const ey    = clamp(clientY - rect.top,  3, 130);
        if (boxDraggerRef.current) boxDraggerRef.current.style.transform = `translate3d(${ex}px, ${ey}px, 0)`;
        const s_hsb = (ex - 3) / 227;
        const b     = 1 - (ey - 3) / 127;
        const l     = b * (1 - s_hsb / 2);
        const s_hsl = (l === 0 || l === 1) ? 0 : (b - l) / Math.min(l, 1 - l);
        cur.current.s = Math.round(s_hsl * 100);
        cur.current.l = Math.round(l * 100);
        queueUpdate();
    };

    fn.current.hue = (clientX) => {
        const rect = activeRectRef.current;
        if (!rect) return;
        const ex = clamp(clientX - rect.left - 9, 0, 130);
        if (hueDraggerRef.current) hueDraggerRef.current.style.transform = `translate3d(${ex}px, 6.5px, 0)`;
        cur.current.h = Math.round(360 - 360 * (ex / 130)) % 360;
        setStops(cur.current.h);
        queueUpdate();
    };

    fn.current.alpha = (clientX) => {
        const rect = activeRectRef.current;
        if (!rect) return;
        const ex = clamp(clientX - rect.left - 9, 0, 130);
        if (alphaDraggerRef.current) alphaDraggerRef.current.style.transform = `translate3d(${ex}px, 6.5px, 0)`;
        cur.current.a = parseFloat((ex / 130).toFixed(2));
        queueUpdate();
    };

    // -- Global pointer (outside-click to close only) -----------
    useEffect(() => {
        const onPD = e => {
            if (!pickerElRef.current) return;
            if (!pickerElRef.current.contains(e.target) && !btnRef.current?.contains(e.target)) {
                stopDragFn.current?.();
                flushDebounce.current?.();
                setIsOpen(false);
            }
        };
        document.addEventListener('pointerdown', onPD);
        return () => document.removeEventListener('pointerdown', onPD);
    }, []);

    // -- Sync UI when picker opens ------------------------------
    useEffect(() => {
        if (!isOpen) return;
        // - fix 5: portal is now mounted — recalculate position with real offsetHeight
        setPickerPos(calcPos());
        const { h, s, l, a } = cur.current;
        setStops(h);
        setDraggers(h, s, l, a);
        setInputs(h, s, l, a);
        colorPrevRef.current?.setAttribute('fill', lastHex.current || HSLAToRGBA(h, s, l, a, true));
    }, [isOpen]);

    // -- Fire onOpen / onClose callbacks -----------------------
    const mountedRef = useRef(false);
    useEffect(() => {
        if (!mountedRef.current) { mountedRef.current = true; return; }
        if (isOpen) onOpenRef.current?.(lastHex.current);
        else        onCloseRef.current?.(lastHex.current);
    }, [isOpen]);

    // -- Sync inputs when color mode changes -------------------
    useEffect(() => {
        if (!isOpen) return;
        const { h, s, l, a } = cur.current;
        setInputs(h, s, l, a);
    }, [colorMode]);

    // -- Initialize on mount -----------------------------------
    useEffect(() => {
        const parsed     = parseColor(isValidColorString(color) ? color : '#ff0000');
        const effectiveA = alphaOnRef.current ? parsed.a : 1;
        parsed.a         = effectiveA;
        cur.current      = { ...parsed };
        const colors     = buildColorSet(parsed.h, parsed.s, parsed.l, effectiveA);
        lastHex.current  = colors.hexa;
        if (btnRef.current) {
            btnRef.current.dataset.color    = colors.hexa;
            btnRef.current.style.background = colors.hexa;
        }
    }, []);

    // -- Position picker (flip above/below based on space) -----
    function calcPos() {
        const rect = btnRef.current.getBoundingClientRect();
        const ph   = pickerElRef.current?.offsetHeight || 250;
        const pw   = 232;
        let top;
        if (rect.bottom + ph > window.innerHeight && rect.top >= ph) {
            top = rect.top + window.scrollY - ph - 2;
        } else {
            top = rect.bottom + window.scrollY + 2;
        }
        let left = rect.left + window.scrollX;
        if (left + pw > window.innerWidth - 20) {
            left -= (left + pw - window.innerWidth) + 20;
        }
        return { top, left };
    }

    // -- Cancel timers on unmount ------------------------------
    useEffect(() => () => {
        clearTimeout(emitTimerRef.current);
        // - fix 10: also clear copy-done timeout to avoid setState on unmounted component
        clearTimeout(copyTimeoutRef.current);
    }, []);

    // -- Reposition on scroll / resize while picker is open ---
    useEffect(() => {
        if (!isOpen) return;
        const handler = () => setPickerPos(calcPos());
        document.addEventListener('scroll', handler, { capture: true, passive: true });
        window.addEventListener('resize', handler, { passive: true });
        return () => {
            document.removeEventListener('scroll', handler, { capture: true });
            window.removeEventListener('resize', handler);
        };
    }, [isOpen]);

    // -- Open picker -------------------------------------------
    function handleBtnClick() {
        if (disabled) return;
        if (isOpen) { stopDragFn.current?.(); flushDebounce.current?.(); setIsOpen(false); return; }
        setPickerPos(calcPos());
        setIsOpen(true);
    }

    // -- setColor (called via ref or internally) ---------------
    const applySetColor = useRef(null);
    applySetColor.current = (c) => {
        if (!isValidColorString(c)) return;
        const parsed = parseColor(c);
        if (!alphaOnRef.current) parsed.a = 1;
        cur.current  = { ...parsed };
        const colors = buildColorSet(parsed.h, parsed.s, parsed.l, parsed.a);
        // - fix 7: deduplicate — do not fire onChange if the color hasn't actually changed
        if (colors.hexa === lastHex.current) return;
        lastHex.current = colors.hexa;
        if (btnRef.current) {
            btnRef.current.dataset.color    = colors.hexa;
            btnRef.current.style.background = colors.hexa;
        }
        if (isOpen) {
            setStops(parsed.h);
            setDraggers(parsed.h, parsed.s, parsed.l, parsed.a);
            setInputs(parsed.h, parsed.s, parsed.l, parsed.a);
            colorPrevRef.current?.setAttribute('fill', colors.hexa);
        }
        onChangeRef.current?.(colors, 'api');
    };

    // -- Public API via ref ------------------------------------
    useImperativeHandle(ref, () => ({
        setColor:        (c)  => applySetColor.current(c),
        getColor:        ()   => { const p = parseColor(lastHex.current); return buildColorSet(p.h, p.s, p.l, p.a); },
        setAlphaEnabled: (v)  => {
            alphaOnRef.current = !!v;
            setAlphaVisible(!!v);
            if (!v) {
                cur.current.a = 1;
                const colors = buildColorSet(cur.current.h, cur.current.s, cur.current.l, 1);
                lastHex.current = colors.hexa;
                if (btnRef.current) {
                    btnRef.current.dataset.color    = colors.hexa;
                    btnRef.current.style.background = colors.hexa;
                }
                if (isOpen) {
                    setDraggers(cur.current.h, cur.current.s, cur.current.l, 1);
                    setInputs(cur.current.h, cur.current.s, cur.current.l, 1);
                    colorPrevRef.current?.setAttribute('fill', colors.hexa);
                }
                // - fix 13: notify parent — alpha was forced to 1 so the color may have changed
                onChangeRef.current?.(colors, 'api');
            }
        },
        enable:  () => {},   // controlled via disabled prop
        disable: () => {},
        // - fix 2: read disabledRef so late prop changes are respected
        open:    () => { if (disabledRef.current) return; setPickerPos(calcPos()); setIsOpen(true); },
        close:   () => { stopDragFn.current?.(); flushDebounce.current?.(); setIsOpen(false); },
    }), []);

    // -- Input handlers ----------------------------------------
    function onHexInput(e) {
        const v = e.target.value;
        if (HEX_RE.test(v)) {
            const p = parseColor(v);
            cur.current = { ...p };
            setStops(p.h);
            setDraggers(p.h, p.s, p.l, p.a);
            colorSourceRef.current = 'input';
            emitChange();
        }
    }

    function onRgbaChange() {
        const r = +rRef.current?.value || 0;
        const g = +gRef.current?.value || 0;
        const b = +bRef.current?.value || 0;
        const a = +(aRgbaRef.current?.value ?? 1);
        if (!isFinite(r + g + b + a)) return;
        if (r < 0 || r > 255 || g < 0 || g > 255 || b < 0 || b > 255 || a < 0 || a > 1) return;
        const p = RGBAToHSLA(r, g, b, a);
        cur.current = { ...p };
        setStops(p.h);
        setDraggers(p.h, p.s, p.l, p.a);
        colorSourceRef.current = 'input';
        queueUpdate();
    }

    function onHslaChange() {
        const h = +hRef.current?.value || 0;
        const s = +sRef.current?.value || 0;
        const l = +lRef.current?.value || 0;
        const a = +(aHslaRef.current?.value ?? 1);
        if (!isFinite(h + s + l + a)) return;
        if (h < 0 || h > 360 || s < 0 || s > 100 || l < 0 || l > 100 || a < 0 || a > 1) return;
        cur.current = { h, s, l, a };
        setStops(h);
        setDraggers(h, s, l, a);
        colorSourceRef.current = 'input';
        queueUpdate();
    }

    // -- Color mode switch -------------------------------------
    function switchMode() {
        const modes = ['HEXA', 'RGBA', 'HSLA'];
        setColorMode(modes[(modes.indexOf(colorMode) + 1) % 3]);
    }

    // -- EyeDropper --------------------------------------------
    async function handleEyeDropper() {
        if (!('EyeDropper' in window)) return;
        try {
            const result = await new window.EyeDropper().open();
            const p      = parseColor(result.sRGBHex);
            cur.current  = { ...p };
            setStops(p.h);
            setDraggers(p.h, p.s, p.l, p.a);
            setInputs(p.h, p.s, p.l, p.a);
            colorSourceRef.current = 'eyedropper';
            emitChange();
        } catch (_) {}
    }

    // -- Picker UI (rendered via portal) -----------------------
    const pickerUI = (
        <div
            ref={pickerElRef}
            className="hcg_color_picker"
            style={{ top: pickerPos.top, left: pickerPos.left }}
        >
            {/* Color box */}
            <svg
                ref={colorBoxRef}
                className="hcg_color_box"
                width="230"
                height="130"
                style={{ touchAction: 'none' }}
                onPointerDown={e => { e.currentTarget.setPointerCapture(e.pointerId); currentPointerIdRef.current = e.pointerId; activeRectRef.current = e.currentTarget.getBoundingClientRect(); drag.current = 'box'; colorSourceRef.current = 'drag'; fn.current.box(e.clientX, e.clientY); }}
                onPointerMove={e => { if (drag.current !== 'box') return; fn.current.box(e.clientX, e.clientY); }}
                onPointerUp={() => { drag.current = null; currentPointerIdRef.current = null; }}
                onPointerCancel={() => { drag.current = null; currentPointerIdRef.current = null; }}
                onLostPointerCapture={() => { drag.current = null; currentPointerIdRef.current = null; }}
            >
                <defs>
                    <linearGradient id={uid('saturation')} x1="0%" y1="0%" x2="100%" y2="0%">
                        <stop offset="0%" stopColor="#fff" />
                        <stop ref={satStopRef} offset="100%" stopColor="hsl(0,100%,50%)" />
                    </linearGradient>
                    <linearGradient id={uid('brightness')} x1="0%" y1="0%" x2="0%" y2="100%">
                        <stop offset="0%" stopColor="rgba(0,0,0,0)" />
                        <stop offset="100%" stopColor="#000" />
                    </linearGradient>
                    <pattern id={uid('pattern')} width="100%" height="100%">
                        <rect x="0" y="0" width="100%" height="100%" fill={`url(#${uid('saturation')})`} />
                        <rect x="0" y="0" width="100%" height="100%" fill={`url(#${uid('brightness')})`} />
                    </pattern>
                </defs>
                <rect width="230" height="130" stroke="#fff" fill={`url(#${uid('pattern')})`} cursor="crosshair" />
                <g ref={boxDraggerRef} style={{ transform: 'translate3d(219px, 14px, 0)' }}>
                    <circle r="9" fill="none" stroke="#000" strokeWidth="2" />
                    <circle r="7" fill="none" stroke="#fff" strokeWidth="2" />
                </g>
            </svg>

            <div className="hcg_slider_container">

                {/* Eye dropper + color preview */}
                <div className="hcg_eye_dropper">
                    {'EyeDropper' in window && (
                        <button className="hcg_eye_dropper_btn" title="Eye dropper" onClick={handleEyeDropper}>
                            <svg width="22" height="22" fill="#333"><path d="m20.71 5.63-2.34-2.34a.996.996 0 0 0-1.41 0l-3.12 3.12-1.93-1.91-1.41 1.41 1.42 1.42L3 16.25V21h4.75l8.92-8.92 1.42 1.42 1.41-1.41-1.92-1.92 3.12-3.12c.4-.4.4-1.03.01-1.42M6.92 19 5 17.08l8.06-8.06 1.92 1.92z" /></svg>
                        </button>
                    )}
                    <div className="hcg_preview_wrap">
                        <svg width="35" height="35">
                            <defs>
                                <pattern id={uid('prev_checker')} width="13" height="13" patternUnits="userSpaceOnUse">
                                    <rect width="13" height="13" fill="#fff" />
                                    <rect width="6.5" height="6.5" fill="#d7d7d7" />
                                    <rect x="6.5" y="6.5" width="6.5" height="6.5" fill="#d7d7d7" />
                                </pattern>
                            </defs>
                            <rect rx="33" ry="33" x="1" y="1" width="33" height="33" fill={`url(#${uid('prev_checker')})`} />
                            <rect ref={colorPrevRef} rx="33" ry="33" x="1" y="1" width="33" height="33" stroke="#ddd" strokeWidth="1" />
                        </svg>
                        <button
                            className="hcg_copy_btn"
                            title="Copy color"
                            style={copyDone ? { background: 'rgba(34, 197, 94, 0.85)' } : undefined}
                            onClick={() => {
                                const { h, s, l, a } = cur.current;
                                const colors = buildColorSet(h, s, l, a);
                                const text   = colorModeRef.current === 'RGBA' ? colors.rgba
                                             : colorModeRef.current === 'HSLA' ? colors.hsla
                                             : colors.hexa;
                                navigator.clipboard?.writeText(text);
                                clearTimeout(copyTimeoutRef.current);
                                setCopyDone(true);
                                copyTimeoutRef.current = setTimeout(() => setCopyDone(false), 1500);
                            }}
                        >
                            {copyDone
                                ? <svg width="14" height="14" fill="#fff" viewBox="0 0 24 24"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>
                                : <svg width="14" height="14" fill="#fff" viewBox="0 0 24 24"><path d="M16 1H4C3 1 2 2 2 3v14h2V3h12V1zm3 4H8C7 5 6 6 6 7v14c0 1 1 2 2 2h11c1 0 2-1 2-2V7c0-1-1-2-2-2zm0 16H8V7h11v14z"/></svg>
                            }
                        </button>
                    </div>
                </div>

                {/* Sliders */}
                <div className="hcg_color_sliders">

                    {/* Hue slider */}
                    <svg
                        ref={hueSliderRef}
                        width="148" height="22"
                        style={{ touchAction: 'none' }}
                        onPointerDown={e => { e.currentTarget.setPointerCapture(e.pointerId); currentPointerIdRef.current = e.pointerId; activeRectRef.current = e.currentTarget.getBoundingClientRect(); drag.current = 'hue'; colorSourceRef.current = 'drag'; fn.current.hue(e.clientX); }}
                        onPointerMove={e => { if (drag.current !== 'hue') return; fn.current.hue(e.clientX); }}
                        onPointerUp={() => { drag.current = null; currentPointerIdRef.current = null; }}
                        onPointerCancel={() => { drag.current = null; currentPointerIdRef.current = null; }}
                        onLostPointerCapture={() => { drag.current = null; currentPointerIdRef.current = null; }}
                    >
                        <defs>
                            <filter id={uid('shadow')} x="-10%" y="-20%" width="120%" height="140%">
                                <feDropShadow dx="0" dy="0" stdDeviation=".5" floodColor="rgba(0,0,0,0.9)" />
                            </filter>
                            <linearGradient id={uid('hue')} x1="100%" y1="0%" x2="0%" y2="0%">
                                <stop offset="0%"      stopColor="#f00" />
                                <stop offset="16.666%" stopColor="#ff0" />
                                <stop offset="33.333%" stopColor="#0f0" />
                                <stop offset="50%"     stopColor="#0ff" />
                                <stop offset="66.666%" stopColor="#00f" />
                                <stop offset="83.333%" stopColor="#f0f" />
                                <stop offset="100%"    stopColor="#f00" />
                            </linearGradient>
                        </defs>
                        <g transform="translate(9, 4.5)">
                            <rect rx="2" ry="2" width="130" height="13" fill={`url(#${uid('hue')})`} cursor="crosshair" />
                            <g ref={hueDraggerRef} style={{ transform: 'translate3d(130px, 6.5px, 0)' }}>
                                <circle r="7.5" fill="none" stroke="#fff" strokeWidth="2" filter={`url(#${uid('shadow')})`} />
                            </g>
                        </g>
                    </svg>

                    {/* Alpha slider */}
                    {alphaVisible && (
                        <svg
                            ref={alphaSliderRef}
                            width="148" height="22"
                            style={{ touchAction: 'none' }}
                            onPointerDown={e => { e.currentTarget.setPointerCapture(e.pointerId); currentPointerIdRef.current = e.pointerId; activeRectRef.current = e.currentTarget.getBoundingClientRect(); drag.current = 'alpha'; colorSourceRef.current = 'drag'; fn.current.alpha(e.clientX); }}
                            onPointerMove={e => { if (drag.current !== 'alpha') return; fn.current.alpha(e.clientX); }}
                            onPointerUp={() => { drag.current = null; currentPointerIdRef.current = null; }}
                            onPointerCancel={() => { drag.current = null; currentPointerIdRef.current = null; }}
                            onLostPointerCapture={() => { drag.current = null; currentPointerIdRef.current = null; }}
                        >
                            <defs>
                                <pattern id={uid('checker')} width="13" height="13" patternUnits="userSpaceOnUse">
                                    <rect width="13" height="13" fill="#fff" />
                                    <rect width="6.5" height="6.5" fill="#d7d7d7" />
                                    <rect x="6.5" y="6.5" width="6.5" height="6.5" fill="#d7d7d7" />
                                </pattern>
                                <linearGradient id={uid('opacity')} x1="100%" y1="0%" x2="0%" y2="0%">
                                    <stop ref={opacStopRef} offset="0%" stopColor="#000" />
                                    <stop offset="100%" stopColor="transparent" />
                                </linearGradient>
                            </defs>
                            <g transform="translate(9, 4.5)">
                                <rect rx="2" ry="2" width="130" height="13" fill={`url(#${uid('checker')})`} />
                                <rect rx="2" ry="2" width="130" height="13" fill={`url(#${uid('opacity')})`} cursor="crosshair" />
                                <g ref={alphaDraggerRef} style={{ transform: 'translate3d(130px, 6.5px, 0)' }}>
                                    <circle r="7.5" fill="none" stroke="#fff" strokeWidth="2" filter={`url(#${uid('shadow')})`} />
                                </g>
                            </g>
                        </svg>
                    )}

                </div>
            </div>

            {/* Color value inputs */}
            <div className="hcg_color_values">
                <div className="hcg_color_input">

                    {/* HEX */}
                    <div className="hcg_input_row" style={{ display: colorMode === 'HEXA' ? 'flex' : 'none' }}>
                        <div className="hcg_color_col">
                            <label>
                                <input ref={hexInputRef} type="text" maxLength="9" spellCheck="false"
                                    name={uid('hex')} defaultValue={lastHex.current} onInput={onHexInput} />
                                HEX
                            </label>
                        </div>
                    </div>

                    {/* RGBA */}
                    <div className="hcg_input_row" style={{ display: colorMode === 'RGBA' ? 'flex' : 'none' }}>
                        <div className="hcg_color_col"><label><input ref={rRef} name={uid('r')} type="number" min="0" max="255" onChange={onRgbaChange} />R</label></div>
                        <div className="hcg_color_col"><label><input ref={gRef} name={uid('g')} type="number" min="0" max="255" onChange={onRgbaChange} />G</label></div>
                        <div className="hcg_color_col"><label><input ref={bRef} name={uid('b')} type="number" min="0" max="255" onChange={onRgbaChange} />B</label></div>
                        {alphaVisible && (
                            <div className="hcg_color_col"><label><input ref={aRgbaRef} name={uid('a_rgba')} type="number" step="0.01" min="0" max="1" onChange={onRgbaChange} />A</label></div>
                        )}
                    </div>

                    {/* HSLA */}
                    <div className="hcg_input_row" style={{ display: colorMode === 'HSLA' ? 'flex' : 'none' }}>
                        <div className="hcg_color_col"><label><input ref={hRef} name={uid('h')} type="number" min="0" max="360" onChange={onHslaChange} />H</label></div>
                        <div className="hcg_color_col"><label><input ref={sRef} name={uid('s')} type="number" min="0" max="100" onChange={onHslaChange} />S%</label></div>
                        <div className="hcg_color_col"><label><input ref={lRef} name={uid('l')} type="number" min="0" max="100" onChange={onHslaChange} />L%</label></div>
                        {alphaVisible && (
                            <div className="hcg_color_col"><label><input ref={aHslaRef} name={uid('a_hsla')} type="number" step="0.01" min="0" max="1" onChange={onHslaChange} />A</label></div>
                        )}
                    </div>

                </div>

                {/* Switch mode button */}
                <button className="hcg_switch_btn" title="Change color format" onClick={switchMode}>
                    <svg width="25" height="25" fill="none" stroke="#9b9b9b" strokeWidth="2">
                        <path d="m7 15 5 5 5-5M7 9l5-5 5 5" />
                    </svg>
                </button>
            </div>
        </div>
    );

    return (
        <>
            <button
                ref={btnRef}
                onClick={handleBtnClick}
                disabled={disabled}
                className={className}
                style={style}
            />
            {isOpen && createPortal(pickerUI, document.body)}
        </>
    );
});

export default ColorPicker;
