/**
 * PNG Metadata Utility
 * Provides functions to inject and extract JSON metadata into PNG files using tEXt chunks.
 */

// CRC32 Table for PNG chunk checking
const crcTable = new Int32Array(256);
for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
        if (c & 1) {
            c = 0xedb88320 ^ (c >>> 1);
        } else {
            c = c >>> 1;
        }
    }
    crcTable[n] = c;
}

function calculateCrc(buf) {
    let crc = -1;
    for (let i = 0; i < buf.length; i++) {
        crc = crcTable[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
    }
    return crc ^ -1;
}

/**
 * Injects a tEXt chunk into a PNG Blob.
 * @param {Blob} blob - The original PNG blob.
 * @param {string} key - Metadata key (max 79 chars).
 * @param {object} metadata - The JSON serializable metadata.
 * @returns {Promise<Blob>} - A new Blob with the metadata injected.
 */
export async function injectMetadata(blob, key, metadata) {
    const buffer = await blob.arrayBuffer();
    const view = new DataView(buffer);
    const uint8View = new Uint8Array(buffer);

    // Metadata as string
    const jsonString = JSON.stringify(metadata);
    const metadataString = `${key}\0${jsonString}`;
    const metadataBytes = new TextEncoder().encode(metadataString);

    // Create tEXt chunk: [Length(4)][Type(4)][Data(Length)][CRC(4)]
    const chunkLength = metadataBytes.length;
    const chunkBuffer = new Uint8Array(4 + 4 + chunkLength + 4);
    const chunkView = new DataView(chunkBuffer.buffer);

    // 1. Length
    chunkView.setUint32(0, chunkLength);
    // 2. Type "tEXt" (116, 69, 88, 116)
    chunkBuffer[4] = 116; // t
    chunkBuffer[5] = 69;  // E
    chunkBuffer[6] = 88;  // X
    chunkBuffer[7] = 116; // t

    // 3. Data
    chunkBuffer.set(metadataBytes, 8);

    // 4. CRC (Type + Data)
    const crc = calculateCrc(chunkBuffer.subarray(4, 8 + chunkLength));
    chunkView.setUint32(8 + chunkLength, crc);

    // Find IEND chunk to insert before it
    // IEND is always the last chunk. It has 4 bytes length (0), 4 bytes type (IEND), 4 bytes CRC.
    // The "IEND" marker starts 8 bytes before the end of the file in a standard PNG.
    let iendOffset = -1;
    for (let i = uint8View.length - 8; i >= 8; i--) {
        if (uint8View[i] === 73 && uint8View[i + 1] === 69 && uint8View[i + 2] === 78 && uint8View[i + 3] === 68) {
            iendOffset = i - 4; // Length field starts 4 bytes before 'I'
            break;
        }
    }

    if (iendOffset === -1) {
        console.error("IEND chunk not found in PNG buffer of length", uint8View.length);
        throw new Error("Invalid PNG: IEND chunk not found");
    }

    console.log(`Injecting metadata at offset ${iendOffset}, total size: ${chunkBuffer.length}`);

    // Assemble new file: [Start...IEND-4] + [New Chunk] + [IEND...]
    const finalBlob = new Blob([
        uint8View.subarray(0, iendOffset),
        chunkBuffer,
        uint8View.subarray(iendOffset)
    ], { type: 'image/png' });

    return finalBlob;
}

/**
 * Extracts metadata from a PNG file.
 * @param {File|Blob} file - The file/blob to extract from.
 * @param {string} key - The key to look for.
 * @returns {Promise<object|null>} - The parsed JSON metadata or null if not found.
 */
export async function extractMetadata(file, key) {
    const buffer = await file.arrayBuffer();
    const view = new DataView(buffer);
    const uint8View = new Uint8Array(buffer);

    // Check PNG signature
    if (uint8View[0] !== 0x89 || uint8View[1] !== 0x50 || uint8View[2] !== 0x4E || uint8View[3] !== 0x47) {
        return null;
    }

    let offset = 8; // Skip signature
    while (offset + 12 <= buffer.byteLength) {
        const length = view.getUint32(offset);
        const typeCharCodes = uint8View.subarray(offset + 4, offset + 8);
        const type = String.fromCharCode(...typeCharCodes);

        if (type === 'tEXt') {
            const data = uint8View.subarray(offset + 8, offset + 8 + length);
            const text = new TextDecoder().decode(data);
            const nullIndex = text.indexOf('\0');
            if (nullIndex !== -1) {
                const chunkKey = text.substring(0, nullIndex);
                if (chunkKey === key) {
                    try {
                        const parsed = JSON.parse(text.substring(nullIndex + 1));
                        console.log("Metadata successfully extracted:", parsed);
                        return parsed;
                    } catch (e) {
                        console.error("Failed to parse PNG metadata JSON", e);
                        return null;
                    }
                }
            }
        }

        if (type === 'IEND') break;
        offset += 12 + length;
    }

    console.warn("No tEXt chunk with key '" + key + "' found in PNG.");

    return null;
}
