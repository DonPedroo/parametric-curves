import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const settingsPath = path.join(__dirname, '../settings.js');
const settingsContent = fs.readFileSync(settingsPath, 'utf8');

const brandColorsMatch = settingsContent.match(/export const BRAND_COLORS = \{[\s\S]*?\};/);
if (!brandColorsMatch) throw new Error("Could not find BRAND_COLORS");

const presetsJsonPath = path.join(__dirname, 'presets.json');
const presetsJson = JSON.parse(fs.readFileSync(presetsJsonPath, 'utf8'));
let themesObjStr = "export const themes = {\n";
let firstKey = null;

const createKeyName = (filename) => {
    const match = filename.match(/(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})/);
    if (match) {
        return `${match[1]}-${match[2]}-${match[3]} ${match[4]}:${match[5]}:${match[6]}`;
    }
    return filename;
};

const colorMap = {
    "#ED2738": "BRAND_COLORS.PrimaryRed",
    "#CB343B": "BRAND_COLORS.DeepRed",
    "#7D2D3F": "BRAND_COLORS.Wine",
    "#D98878": "BRAND_COLORS.Terra",
    "#FF7600": "BRAND_COLORS.Orange",
    "#000000": "BRAND_COLORS.Black",
    "#201E1E": "BRAND_COLORS.DDNBlack",
    "#402022": "BRAND_COLORS.WarmBlack",
    "#77494D": "BRAND_COLORS.Brown",
    "#D8D2CB": "BRAND_COLORS.WarmGray",
    "#374967": "BRAND_COLORS.DeepBlue",
    "#7594B2": "BRAND_COLORS.Blue2157",
    "#70C5E8": "BRAND_COLORS.Blue297",
    "#BDD6E7": "BRAND_COLORS.LightBlue",
    "#E9E8E8": "BRAND_COLORS.CoolGray"
};

for (const [filename, presetObj] of Object.entries(presetsJson)) {
    // Ensure we go to the params object if wrapped in version
    const preset = presetObj.params ? presetObj.params : presetObj;
    const versionStr = presetObj.version ? `version: "${presetObj.version}",\n        ` : "";
    const exportedStr = presetObj.exportedAt ? `,\n        exportedAt: "${presetObj.exportedAt}"` : "";

    const key = createKeyName(filename);
    if (!firstKey) firstKey = key;

    let presetStrStr = JSON.stringify(preset, null, 8);
    for (const [hex, brand] of Object.entries(colorMap)) {
        const regex = new RegExp(`"${hex}"`, 'ig');
        presetStrStr = presetStrStr.replace(regex, brand);
    }
    presetStrStr = presetStrStr.replace(/"([a-zA-Z0-9_\$]+)":/g, '$1:');

    // Expose params directly since index.js expects themes[name] to be spread directly into this.params
    if (presetObj.params) {
        let insert = "";
        if (presetObj.version) insert += `version: "${presetObj.version}",\n        `;
        if (presetObj.exportedAt) insert += `exportedAt: "${presetObj.exportedAt}",\n        `;

        // Remove the opening brace, and add our extra fields first
        presetStrStr = `{\n        ${insert}` + presetStrStr.substring(presetStrStr.indexOf('{') + 1);
    }

    themesObjStr += `    '${key}': ${presetStrStr},\n`;
}

themesObjStr = themesObjStr.substring(0, themesObjStr.lastIndexOf(',')) + '\n};\n';

const finalContent = `${brandColorsMatch[0]}

${themesObjStr}
export const defaultThemeName = '${firstKey}';
`;

fs.writeFileSync(settingsPath, finalContent);
console.log("Settings updated successfully. new default theme:", firstKey);
