/*!
 * hcg-color-picker-react — TypeScript declarations
 * https://github.com/html-code-generator/hcg-color-picker-react
 */

import { CSSProperties, ForwardRefExoticComponent, RefAttributes } from 'react';

// -- Color output object returned by getColor() / onChange -------

export interface HcgColorSet {
    /** 6-digit HEX, no alpha  — e.g. "#ff0000"          */
    hex:  string;
    /** 8-digit HEX with alpha — e.g. "#ff0000ff"         */
    hexa: string;
    /** e.g. "rgb(255, 0, 0)"                             */
    rgb:  string;
    /** e.g. "rgba(255, 0, 0, 1)"                         */
    rgba: string;
    /** e.g. "hsl(0, 100%, 50%)"                          */
    hsl:  string;
    /** e.g. "hsla(0, 100%, 50%, 1)"                      */
    hsla: string;
}

// -- Source string passed as second arg to onChange --------------

export type HcgColorSource =
    | 'drag'        // dragging the color box, hue or alpha slider
    | 'input'       // typing into HEX / RGBA / HSLA inputs
    | 'api'         // calling ref.current.setColor() programmatically
    | 'eyedropper'; // picking with the EyeDropper API

// -- Ref methods exposed via useImperativeHandle -----------------

export interface ColorPickerRef {
    /** Set the color programmatically. */
    setColor(color: string): void;
    /** Returns the current color in all formats. */
    getColor(): HcgColorSet;
    /** Show or hide the alpha slider at runtime. */
    setAlphaEnabled(enabled: boolean): void;
    /** Programmatically open the picker. */
    open(): void;
    /** Programmatically close the picker. */
    close(): void;
    /** Re-enable a previously disabled picker. */
    enable(): void;
    /** Prevent the picker from opening on click. */
    disable(): void;
}

// -- Component props ---------------------------------------------

export interface ColorPickerProps {
    /** Initial color — HEX, RGB, or HSL format. Default: '#ff0000'. */
    color?:     string;
    /** Called with (colors, source) every time the color changes. */
    onChange?:  (colors: HcgColorSet, source: HcgColorSource) => void;
    /** Called with the current hex when the picker opens. */
    onOpen?:    (hex: string) => void;
    /** Called with the final hex when the picker closes. */
    onClose?:   (hex: string) => void;
    /** Enable alpha / opacity control. Default: true. */
    alpha?:     boolean;
    /** Debounce the onChange event by this many ms (0 = off). Default: 0. */
    debounce?:  number;
    /** Prevents the picker from opening. Default: false. */
    disabled?:  boolean;
    /** CSS class applied to the trigger button. */
    className?: string;
    /** Inline styles for the trigger button. */
    style?:     CSSProperties;
}

// -- Component ---------------------------------------------------

declare const ColorPicker: ForwardRefExoticComponent<
    ColorPickerProps & RefAttributes<ColorPickerRef>
>;

export default ColorPicker;
