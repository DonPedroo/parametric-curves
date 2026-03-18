# PNG Data Extraction Utility

This folder contains utilities for extracting configuration settings directly from exported `.png` files and injecting them into the sketch's `settings.js`.

### 1. Approach Used

The scripts use a direct binary-parsing approach to read the `.png` contents instead of relying on external dependencies like `exiftool`.

When the sketch exports an image, it typically saves the parameters into text chunks (`tEXt`, `iTXt`, or `zTXt`) embedded in the image's format. 
1. **`read-png-chunks.js`**: Iterates over all `.png` files in `../ref`, finds these text chunks, extracts the JSON data blob, and saves it intermediately into `presets.json`.
2. **`update-settings.js`**: Reads `presets.json`, parses out the hex colors to convert them back into dynamic `BRAND_COLORS` variable references, formats the presets, names them by their file timestamp, and overwrites the `themes` section in `../settings.js`.

### 2. How to use

If you export new reference PNGs to `src/sketches/016/ref` and want to populate those in `settings.js`, simply do the following from your terminal:

```bash
# Change directory to this folder
cd "src/sketches/016/data-extraction"

# 1. Parse the PNG files and extract JSON to presets.json
node read-png-chunks.js

# 2. Inject presets.json into settings.js
node update-settings.js
```

**Note:** These scripts use relative paths, so make sure they remain parallel to `../ref` and `../settings.js`.
