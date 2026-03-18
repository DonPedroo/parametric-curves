import { injectMetadata } from './png-metadata.js';

/**
 * Saves a canvas element as a PNG with embedded JSON metadata.
 * 
 * @param {HTMLCanvasElement} canvas - The canvas to capture.
 * @param {Object} metadata - JSON serializable object to embed.
 * @param {string} metadataKey - The key for the tEXt chunk (e.g., 'next-now-settings').
 * @param {string} filename - The output filename.
 */
export function saveCanvasToPNG(canvas, metadata, metadataKey, filename) {
    canvas.toBlob(async (blob) => {
        if (!blob) {
            console.error("Failed to create blob from canvas");
            return;
        }

        const metadataToInject = {
            version: "1.0",
            params: metadata,
            exportedAt: new Date().toISOString()
        };

        try {
            const enrichedBlob = await injectMetadata(blob, metadataKey, metadataToInject);
            const url = URL.createObjectURL(enrichedBlob);
            const link = document.createElement('a');
            link.href = url;
            link.download = filename;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
        } catch (err) {
            console.error("Failed to inject metadata, falling back to basic download", err);
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = filename;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
        }
    }, 'image/png');
}
