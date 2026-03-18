export const BRAND_COLORS = {
    PrimaryGreen: "#39B54A",
    DeepGreen: "#046A38",

    Black: "#000000",
    White: "#FFFFFF",

    LightGray: "#EEF0F1",
    DarkGray: "#53575A",

    DeepBlue: "#2B71B9",
    LightBlue: "#41B6E6",
};

/**
 * Themes are now extracted into standalone JSON files in the ./themes directory.
 * This file dynamically imports them to keep the main settings file lean.
 */
const themeFiles = import.meta.glob('./themes/*.json', { eager: true });
export const themes = {};

for (const path in themeFiles) {
    const filename = path.split('/').pop().replace('.json', '');
    // Convert '2026-03-03_11_32_34' back to '2026-03-03 11:32:34'
    const key = filename.replace(/^(\d{4}-\d{2}-\d{2})_(\d{2})_(\d{2})_(\d{2})$/, '$1 $2:$3:$4');

    // In Vite, eager JSON imports are the object itself
    // If the JSON was imported via glob, it might have a .default property depending on Vite version/config
    themes[key] = themeFiles[path].default || themeFiles[path];
}

export const defaultThemeName = '2026-03-16 14:40:30';
