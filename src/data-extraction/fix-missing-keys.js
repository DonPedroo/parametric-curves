import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const settingsPath = path.join(__dirname, '../settings.js');
let content = fs.readFileSync(settingsPath, 'utf8');

const presetsJsonPath = path.join(__dirname, 'presets.json');
const presetsJson = JSON.parse(fs.readFileSync(presetsJsonPath, 'utf8'));

const REQUIRED_KEYS = {
    pixelateMaskRadialCenterX: 0.5,
    pixelateMaskRadialCenterY: 0.5,
    pixelateMaskRadialRadiusX: 0.54,
    pixelateMaskRadialRadiusY: 0.97,
    pixelateMaskRadialSoftness: 0.47,
    pixelateMask3WayCenter: 0.5,
    pixelateMask3WaySpread: 0.2,
    pixelateMaskType: 'Linear',
    pixelateMaskCenter: 0.5,
    pixelateMaskSpread: 0.2,
    pixelateMaskInvert: false
};

const DEFAULT_CIRCLES = [
    { enabled: true, x: 0.5, y: 0.5, diameter: 0.5, opacity: 1.0, scale: 1.0, cover: true, exposure: 0.0, gamma: 1.0, blendMode: 'mix', invert: false, filename: 'Grain – Light 1.png' },
    { enabled: false, x: 0.25, y: 0.5, diameter: 0.4, opacity: 1.0, scale: 1.0, cover: true, exposure: 0.0, gamma: 1.0, blendMode: 'mix', invert: false, filename: 'Grain – Light 1.png' },
    { enabled: false, x: 0.75, y: 0.5, diameter: 0.4, opacity: 1.0, scale: 1.0, cover: true, exposure: 0.0, gamma: 1.0, blendMode: 'mix', invert: false, filename: 'Grain – Light 1.png' },
    { enabled: false, x: 0.5, y: 0.25, diameter: 0.3, opacity: 1.0, scale: 1.0, cover: true, exposure: 0.0, gamma: 1.0, blendMode: 'mix', invert: false, filename: 'Grain – Light 1.png' },
    { enabled: false, x: 0.5, y: 0.75, diameter: 0.3, opacity: 1.0, scale: 1.0, cover: true, exposure: 0.0, gamma: 1.0, blendMode: 'mix', invert: false, filename: 'Grain – Light 1.png' }
];

for (const [filename, presetObj] of Object.entries(presetsJson)) {
    const preset = presetObj.params ? presetObj.params : presetObj;

    // Fill pixelate missing keys
    for (const [k, v] of Object.entries(REQUIRED_KEYS)) {
        if (preset[k] === undefined) {
            preset[k] = v;
        }
    }

    // Fill circles missing keys and mapping
    if (!preset.circles || !Array.isArray(preset.circles)) {
        preset.circles = JSON.parse(JSON.stringify(DEFAULT_CIRCLES));
    } else {
        preset.circles = preset.circles.map((c, i) => {
            const def = DEFAULT_CIRCLES[i] || DEFAULT_CIRCLES[0];
            if (!c) return { ...def };
            return {
                enabled: c.enabled !== undefined ? c.enabled : def.enabled,
                x: c.x !== undefined ? c.x : def.x,
                y: c.y !== undefined ? c.y : def.y,
                diameter: c.diameter !== undefined ? c.diameter : def.diameter,
                opacity: c.opacity !== undefined ? c.opacity : def.opacity,
                scale: c.scale !== undefined ? c.scale : def.scale,
                cover: c.cover !== undefined ? c.cover : def.cover,
                exposure: c.exposure !== undefined ? c.exposure : def.exposure,
                gamma: c.gamma !== undefined ? c.gamma : def.gamma,
                blendMode: c.blendMode !== undefined ? c.blendMode : def.blendMode,
                invert: c.invert !== undefined ? c.invert : def.invert,
                filename: c.filename !== undefined ? c.filename : def.filename
            };
        });
    }

    if (preset.ringsEnabled === undefined) preset.ringsEnabled = false;
    if (preset.ringsSelected === undefined) preset.ringsSelected = 0;

    const DEFAULT_RINGS = [];
    for (let i = 0; i < 5; i++) {
        DEFAULT_RINGS.push({
            enabled: false,
            x: 0.5,
            y: 0.5,
            count: 3,
            baseDiameter: 0.5,
            spacing: 0.05,
            thickness: 0.01,
            color: '#ffffff',
            opacity: 1.0,
            blendMode: 'mix',
            shadingEnabled: false,
            shadingIntensity: 0.5,
            shadingSharpness: 4.0,
            shadingAngle: 0.0,
            shadingColor: '#ffffff'
        });
    }
    DEFAULT_RINGS[0].enabled = true; // First one might be on, or let's say all false initially? The actual effect has everything false by default if disabled.

    if (!preset.rings || !Array.isArray(preset.rings)) {
        preset.rings = JSON.parse(JSON.stringify(DEFAULT_RINGS));
    } else {
        preset.rings = preset.rings.map((r, i) => {
            const def = DEFAULT_RINGS[i] || DEFAULT_RINGS[0];
            if (!r) return { ...def };
            return {
                enabled: r.enabled !== undefined ? r.enabled : def.enabled,
                x: r.x !== undefined ? r.x : def.x,
                y: r.y !== undefined ? r.y : def.y,
                count: r.count !== undefined ? r.count : def.count,
                baseDiameter: r.baseDiameter !== undefined ? r.baseDiameter : def.baseDiameter,
                spacing: r.spacing !== undefined ? r.spacing : def.spacing,
                thickness: r.thickness !== undefined ? r.thickness : def.thickness,
                color: r.color !== undefined ? r.color : def.color,
                opacity: r.opacity !== undefined ? r.opacity : def.opacity,
                blendMode: r.blendMode !== undefined ? r.blendMode : def.blendMode,
                shadingEnabled: r.shadingEnabled !== undefined ? r.shadingEnabled : def.shadingEnabled,
                shadingIntensity: r.shadingIntensity !== undefined ? r.shadingIntensity : def.shadingIntensity,
                shadingSharpness: r.shadingSharpness !== undefined ? r.shadingSharpness : def.shadingSharpness,
                shadingAngle: r.shadingAngle !== undefined ? r.shadingAngle : def.shadingAngle,
                shadingColor: r.shadingColor !== undefined ? r.shadingColor : def.shadingColor
            };
        });
    }
}

fs.writeFileSync(presetsJsonPath, JSON.stringify(presetsJson, null, 2));
console.log("Fixed presets.json keys");
