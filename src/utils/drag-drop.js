import { extractMetadata } from './png-metadata.js';

/**
 * Sets up drag and drop listeners for a container to load sketch state from PNG metadata.
 * 
 * @param {HTMLElement} container - The element to attach listeners to.
 * @param {string} metadataKey - The key to look for in the PNG tEXt chunks.
 * @param {Function} onMetadataLoaded - Callback(params) called when metadata is successfully extracted.
 * @returns {Function} - A cleanup function to remove listeners.
 */
export function setupMetadataDrop(container, metadataKey, onMetadataLoaded) {
    const onDragOver = (e) => {
        e.preventDefault();
        container.style.cursor = 'copy';
    };

    const onDragLeave = () => {
        container.style.cursor = 'default';
    };

    const onDrop = async (e) => {
        e.preventDefault();
        container.style.cursor = 'default';

        const file = e.dataTransfer.files[0];
        if (file && file.type === 'image/png') {
            try {
                const metadata = await extractMetadata(file, metadataKey);
                if (metadata && metadata.params) {
                    onMetadataLoaded(metadata.params);
                } else {
                    console.warn('No valid metadata found in PNG for key:', metadataKey);
                }
            } catch (err) {
                console.error('Error processing dropped PNG:', err);
            }
        }
    };

    container.addEventListener('dragover', onDragOver);
    container.addEventListener('dragleave', onDragLeave);
    container.addEventListener('drop', onDrop);

    // Return cleanup function
    return () => {
        container.removeEventListener('dragover', onDragOver);
        container.removeEventListener('dragleave', onDragLeave);
        container.removeEventListener('drop', onDrop);
    };
}
