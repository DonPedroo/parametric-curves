import * as THREE from 'three/webgpu';

/**
 * Exports an image sequence directly to a user-selected folder using the File System Access API.
 * This avoids memory issues by saving each frame to disk immediately.
 * 
 * @param {Object} options - Export options.
 * @param {WebGPURenderer} options.renderer - The Three.js renderer.
 * @param {Function} options.renderFrame - Async function(time) to update state and render a frame.
 * @param {number} options.fps - Frames per second.
 * @param {number} options.duration - Total duration in seconds.
 * @param {Array<number>} options.resolution - [width, height] for export.
 * @param {Function} options.onProgress - Callback(currentFrame, totalFrames, status) for UI updates.
 */
export async function exportSequence({
    renderer,
    renderFrame,
    fps = 30,
    duration = 4,
    resolution = [1920, 1080],
    onProgress = () => { }
}) {
    if (!window.showDirectoryPicker) {
        throw new Error("File System Access API is not supported in this browser. Please use a Chromium-based browser (Chrome, Edge, Brave).");
    }

    const totalFrames = Math.floor(duration * fps);

    // Prompt user to select a directory
    let directoryHandle;
    try {
        directoryHandle = await window.showDirectoryPicker({
            mode: 'readwrite'
        });
    } catch (err) {
        console.warn("Directory selection cancelled:", err);
        return;
    }

    // Store original state to restore later
    const originalSize = new THREE.Vector2();
    renderer.getSize(originalSize);
    const originalPixelRatio = renderer.getPixelRatio();

    // Prepare renderer for export
    renderer.setSize(resolution[0], resolution[1], false);

    try {
        for (let i = 0; i < totalFrames; i++) {
            const tSeconds = i / fps;

            // Progress callback
            onProgress(i + 1, totalFrames, `Exporting frame ${i + 1}/${totalFrames}...`);

            // Update scene and render
            await renderFrame(tSeconds, i);

            // Capture frame as blob
            const blob = await new Promise(resolve => renderer.domElement.toBlob(resolve, 'image/png'));

            if (blob) {
                const frameName = `frame_${String(i).padStart(5, '0')}.png`;

                // Save directly to the chosen folder
                const fileHandle = await directoryHandle.getFileHandle(frameName, { create: true });
                const writable = await fileHandle.createWritable();
                await writable.write(blob);
                await writable.close();
            }
        }

        onProgress(totalFrames, totalFrames, "Export complete!");

    } catch (err) {
        console.error("Sequence export failed:", err);
        throw err;
    } finally {
        // Restore renderer
        renderer.setSize(originalSize.x, originalSize.y);
        renderer.setPixelRatio(originalPixelRatio);
    }
}
