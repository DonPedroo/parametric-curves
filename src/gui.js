import { BRAND_COLORS } from './settings.js';
import * as THREE from 'three/webgpu';
import { GradientEffect } from './effects/gradient.js';

/**
 * Injects custom CSS for the color swatches
 */
export function injectGUIStyles() {
    if (document.getElementById('brand-swatches-styles')) return;
    const style = document.createElement('style');
    style.id = 'brand-swatches-styles';
    style.innerHTML = `
        .brand-swatches-container {
            display: flex;
            flex-wrap: wrap;
            gap: 6px;
            padding: 12px;
            background: #1a1a1a;
            border-left: 2px solid #333;
            margin: 5px 0;
        }
        .brand-swatch {
            width: 22px;
            height: 22px;
            border-radius: 4px;
            cursor: pointer;
            border: 1px solid rgba(255,255,255,0.2);
            transition: all 0.15s cubic-bezier(0.4, 0, 0.2, 1);
            box-shadow: 0 2px 4px rgba(0,0,0,0.3);
        }
        .brand-swatch.selected {
            border: 2px solid white;
            transform: scale(1.1);
            box-shadow: 0 0 8px rgba(255,255,255,0.5);
            z-index: 5;
        }
        .brand-swatch:hover {
            transform: scale(1.25);
            border-color: #fff;
            box-shadow: 0 4px 8px rgba(0,0,0,0.5);
            z-index: 10;
        }
        .brand-swatch:active {
            transform: scale(0.95);
        }
    `;
    document.head.appendChild(style);
}

/**
 * Helper to create the brand color swatch grid
 */
export const createSwatchGrid = (targetFolder, label, controller, onSelect) => {
    const wrapper = document.createElement('div');
    wrapper.style.marginBottom = '10px';

    if (label) {
        const title = document.createElement('div');
        title.innerText = label;
        title.style.fontSize = '10px';
        title.style.opacity = '0.5';
        title.style.padding = '0 12px';
        title.style.textTransform = 'uppercase';
        title.style.fontWeight = 'bold';
        wrapper.appendChild(title);
    }

    const container = document.createElement('div');
    container.className = 'brand-swatches-container';

    const swatches = [];
    Object.entries(BRAND_COLORS).forEach(([name, color]) => {
        const swatch = document.createElement('div');
        swatch.className = 'brand-swatch';
        swatch.style.backgroundColor = color;
        swatch.dataset.color = color;
        swatch.title = `${name}: ${color}`;
        swatch.onclick = () => {
            swatches.forEach(s => s.classList.remove('selected'));
            swatch.classList.add('selected');
            onSelect(color);
        };
        container.appendChild(swatch);
        swatches.push(swatch);
    });
    wrapper.appendChild(container);

    const updateSelection = () => {
        const currentVal = (controller.getValue && typeof controller.getValue === 'function')
            ? controller.getValue()
            : controller.object[controller.property];

        const normalizedCurrent = String(currentVal).toLowerCase();
        swatches.forEach(s => {
            if (s.dataset.color.toLowerCase() === normalizedCurrent) {
                s.classList.add('selected');
            } else {
                s.classList.remove('selected');
            }
        });
    };

    controller.onChange((v) => {
        onSelect(v);
        updateSelection();
    });

    updateSelection();

    if (!targetFolder._updateSwatches) targetFolder._updateSwatches = [];
    targetFolder._updateSwatches.push(updateSelection);

    if (controller && controller.domElement) {
        controller.domElement.parentNode.insertBefore(wrapper, controller.domElement);
    } else {
        const childrenContainer = targetFolder.domElement.querySelector('.children') || targetFolder.domElement;
        childrenContainer.prepend(wrapper);
    }
};

/**
 * Main GUI setup for the sketch
 */
export function setupSketchGUI(sketch) {
    injectGUIStyles();
    const { gui, params, themes } = sketch;

    // Theme Selection
    gui.add(params, 'theme', Object.keys(themes)).name('Theme').onChange((v) => sketch.applyTheme(v));

    // Gradient Logic
    const gradientEffect = sketch.gradientEffect;
    const gradFolder = gradientEffect.setupGUI(gui);

    const animFolder = gui.addFolder('Animation Settings');
    animFolder.add(params, 'distortionAmplitude', 0.0, 1.0).name('Amplitude').onChange((v) => sketch.uDistortionAmplitude.value = v).listen();
    animFolder.add(params, 'distortionFrequency', 0.1, 10.0).name('Frequency').onChange((v) => sketch.uDistortionFrequency.value = v).listen();
    animFolder.add(params, 'animationSpeed', 0.0, 5.0).name('Speed').onChange((v) => {
        if (sketch.updateAnimationSpeeds) sketch.updateAnimationSpeeds();
    }).listen();

    const postFolder = gui.addFolder('Post Processing');

    const updateGradientVisibility = (type) => {
        gradientEffect.updateVisibility(type);
        animFolder.show(true);
    };

    // Unified applyTheme logic is now in index.js to handle deep merging and defaults

    // Export
    const exportFolder = gui.addFolder('Export');
    exportFolder.add(params, 'perfectLoop').name('Perfect Loop').onChange(() => {
        if (sketch.updateAnimationSpeeds) sketch.updateAnimationSpeeds();
    }).listen();

    params.togglePlay = () => {
        params.isPlaying = !params.isPlaying;
    };
    exportFolder.add(params, 'togglePlay').name('Play / Pause');

    const previewFrameController = exportFolder.add(params, 'previewFrame', 0, params.exportFPS * params.exportDuration, 1).name('Preview Frame').listen();

    previewFrameController.onChange(() => {
        if (!sketch.isExporting) {
            params.isPlaying = false;
        }
    });

    const updateFrameLimits = () => {
        const totalFrames = Math.floor(params.exportFPS * params.exportDuration);
        previewFrameController.max(totalFrames);
        if (params.previewFrame > totalFrames) params.previewFrame = totalFrames;
        previewFrameController.updateDisplay();
    };

    sketch.updateFrameLimits = updateFrameLimits;

    exportFolder.add(params, 'exportFPS', 1, 60, 1).name('Sequence FPS').onChange(updateFrameLimits).listen();
    exportFolder.add(params, 'exportDuration', 1, 30, 0.5).name('Duration (s)').onChange((v) => {
        updateFrameLimits();
        if (sketch.updateAnimationSpeeds) sketch.updateAnimationSpeeds();
    }).listen();
    exportFolder.add(params, 'exportScaleMultiplier', 0.5, 4.0, 0.5).name('Scale Multiplier').listen();

    params.savePNG = () => sketch.saveAsPNG();
    exportFolder.add(params, 'savePNG').name('Save Image 📸');

    params.exportSequence = () => {
        if (sketch.exportSequence) sketch.exportSequence();
    };
    exportFolder.add(params, 'exportSequence').name('Export Sequence 🎬');

    sketch.updateGradientVisibility = updateGradientVisibility;
    sketch.rebuildDynamicControls = () => {
        sketch.effectManager.effects.forEach(effect => {
            const refreshMethod = Object.getOwnPropertyNames(Object.getPrototypeOf(effect))
                .find(name => name.startsWith('refresh') && name.endsWith('GUI'));
            if (refreshMethod) effect[refreshMethod]();
        });
        if (gradientEffect.rebuildDynamicControls) gradientEffect.rebuildDynamicControls();
    };

    setupPostGUI(sketch, postFolder);

    return {
        gradFolder,
        animFolder,
        postFolder,
        exportFolder
    };
}

/**
 * Post Processing GUI setup
 */
export function setupPostGUI(sketch, postFolder) {
    // PostProcessing Module GUI (Top level settings)
    if (sketch.postProcessingEffect) {
        sketch.postProcessingEffect.setupGUI(postFolder);
    }

    // Load all other effect GUIs dynamically
    sketch.effectManager.effects.forEach(effect => {
        // Skip PostProcessingEffect as we already added it above at the top
        if (effect.constructor.name === 'PostProcessingEffect') return;
        // Skip GradientEffect as it has its own top-level folder
        if (effect.constructor.name === 'GradientEffect') return;

        if (typeof effect.setupGUI === 'function') {
            effect.setupGUI(postFolder);
        }
    });
}

/**
 * Recursively gets the open/closed state of all folders in the GUI.
 * returns { 'FolderName': isOpen }
 */
export function getFolderStates(gui) {
    const states = {};
    const traverse = (folder) => {
        if (folder._title) {
            states[folder._title] = !folder._closed;
        }
        folder.folders.forEach(traverse);
    };
    gui.folders.forEach(traverse);
    return states;
}

/**
 * Recursively applies open/closed states to folders in the GUI.
 * If a state is not found for a folder, it defaults to closed.
 */
export function applyFolderStates(gui, states = {}) {
    const safeStates = states || {};
    const traverse = (folder) => {
        const title = folder._title;
        if (title) {
            // Force Export folder to always be closed
            const isExport = title === 'Export';
            const shouldBeOpen = !isExport && safeStates[title] === true;

            if (shouldBeOpen) {
                folder.open();
            } else {
                folder.close();
            }
        }
        folder.folders.forEach(traverse);
    };
    gui.folders.forEach(traverse);
}
