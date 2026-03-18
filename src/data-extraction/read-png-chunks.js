import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function readPNGChunks(filePath) {
    const buffer = fs.readFileSync(filePath);
    let offset = 8; // skip signature
    const chunks = [];
    while (offset < buffer.length) {
        if (offset + 8 > buffer.length) break;
        const length = buffer.readUInt32BE(offset);
        const type = buffer.toString('ascii', offset + 4, offset + 8);

        if (type === 'tEXt' || type === 'iTXt' || type === 'zTXt') {
            const data = buffer.subarray(offset + 8, offset + 8 + length);
            chunks.push({ type, data: data.toString('utf8') });
        }
        offset += 8 + length + 4; // length, type, data, crc
    }
    return chunks;
}

const dir = path.join(__dirname, '../ref');
const files = fs.readdirSync(dir).filter(f => f.endsWith('.png'));

const presets = {};
for (const f of files) {
    const p = path.join(dir, f);
    const chunks = readPNGChunks(p);

    let found = false;
    for (const chunk of chunks) {
        const nullIdx = chunk.data.indexOf('\x00');
        if (nullIdx !== -1) {
            const keyword = chunk.data.substring(0, nullIdx);
            const text = chunk.data.substring(nullIdx + 1);
            if (text.includes('{')) {
                const start = text.indexOf('{');
                const end = text.lastIndexOf('}');
                if (start !== -1 && end !== -1) {
                    try {
                        presets[f] = JSON.parse(text.substring(start, end + 1));
                        found = true;
                    } catch (e) {
                        try {
                            presets[f] = JSON.parse(decodeURIComponent(text.substring(start, end + 1)));
                            found = true;
                        } catch (e2) {
                            console.log(f, "JSON parse failed on", keyword);
                        }
                    }
                }
            }
        }
    }
    if (!found) {
        console.log("No JSON found in chunks for", f);
    }
}

const outPath = path.join(__dirname, 'presets.json');
fs.writeFileSync(outPath, JSON.stringify(presets, null, 2));
console.log("Extracted keys saved to presets.json:", Object.keys(presets));
