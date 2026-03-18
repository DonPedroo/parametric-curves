import * as THREE from 'three/webgpu';
import { vec2, uniform, int, pass, Fn, uv, rtt } from 'three/tsl';
import { createMainMaterial } from './material.js';
import GUI from 'lil-gui';
import { themes, defaultThemeName } from './settings.js';
import { EffectManager } from './EffectManager.js';
import { setupSketchGUI, getFolderStates, applyFolderStates } from './gui.js';
import { saveCanvasToPNG } from './utils/export-image.js';
import { exportSequence } from './utils/export-sequence.js';
import { setupMetadataDrop } from './utils/drag-drop.js';
import { deepMerge } from './utils/deepMerge.js';

/**
 * Sketch 016: Full Screen Quad Gradient with Noise Post Processing
 */
export default class Sketch {
    constructor(container) {
        this.container = container;

        // Stage Init
        this.width = window.innerWidth;
        this.height = window.innerHeight;

        // Scene
        this.scene = new THREE.Scene();

        // Camera
        this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1); // For Full Screen Quad

        this.scenePass = pass(this.scene, this.camera);

        // Texture Cache System
        this.textures = {};
        this.imageFiles = import.meta.glob(['./tex/*.{png,jpg,jpeg,webp}', './assets/*.{png,jpg,jpeg,webp}'], { eager: true, as: 'url' });

        // GUI Initialization
        this.gui = new GUI();
        this.themes = themes;

        this.params = {};
        this.effectManager = new EffectManager(this);

        this.globalDefaults = this.getGlobalDefaults();
        const currentTheme = themes[defaultThemeName];
        deepMerge(this.params, this.globalDefaults, { theme: defaultThemeName }, currentTheme);

        // Renderer
        this.renderer = new THREE.WebGPURenderer({
            antialias: true,
            alpha: true, // Enabling alpha for pass transparency
            preserveDrawingBuffer: true
        });
        this.renderer.setSize(this.width, this.height);
        this.renderer.setClearColor(0x000000, 0); // Default to transparent
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.container.appendChild(this.renderer.domElement);

        // Global Shared TSL Uniforms
        this.uDpr = uniform(Math.min(window.devicePixelRatio, 2));
        this.uResolution = uniform(vec2(this.width, this.height));
        this.uGlobalTime = uniform(0);
        this.resolution = this.uResolution; // alias for effects
        this.dpr = this.uDpr; // alias for effects
        this.mouseTarget = new THREE.Vector2(0.5, 0.5);
        this.uMousePos = uniform(vec2(0.5, 0.5));

        // Initial Uniforms setup
        this.uniforms = {
            ...this.effectManager.setupUniforms(),
            uResolution: this.uResolution,
            uDpr: this.uDpr,
            uGlobalTime: this.uGlobalTime,
            uAnimationSpeed: uniform(vec2(this.params.animationSpeed, this.params.animationSpeed * 0.8)),
            uDistortionAmplitude: uniform(this.params.distortionAmplitude),
            uDistortionFrequency: uniform(this.params.distortionFrequency),
            uMousePos: this.uMousePos
        };

        // Get direct access to key effects for legacy logic where needed
        this.gradientEffect = this.effectManager.getEffect('GradientEffect');
        this.archesEffect = this.effectManager.getEffect('ArchesEffect');
        this.barkEffect = this.effectManager.getEffect('BarkEffect');
        this.postProcessingEffect = this.effectManager.getEffect('PostProcessingEffect');

        // Alias uniform properties for backwards compat with scripts that expect them on "this"
        Object.assign(this, this.uniforms);

        // Mesh - Full Screen Quad
        const geometry = new THREE.PlaneGeometry(2, 2);

        // TSL Material
        this.material = new THREE.MeshBasicNodeMaterial();
        this.updateMaterial();

        this.mesh = new THREE.Mesh(geometry, this.material);
        this.scene.add(this.mesh);

        // Post Processing Setup
        this.postProcessing = new THREE.RenderPipeline(this.renderer);
        this.postUniforms = this.postProcessingEffect?.uniforms;

        // Registry of all modular effects (Now managed via manager)
        this.mountedEffects = this.effectManager.effects;

        this.updatePostProcessingChain();
        this.updateAnimationSpeeds();

        // GUI Initialization
        const guiSetup = setupSketchGUI(this);

        // Events
        this.resizeHandler = this.onResize.bind(this);
        window.addEventListener('resize', this.resizeHandler);

        this.pointerHandler = this.onPointerMove.bind(this);
        window.addEventListener('pointermove', this.pointerHandler);

        // Auto-Save / Initial Theme Setup
        this.ignoreAutoSave = true;
        const autoSavedSettings = localStorage.getItem('next_now_sketch_016_autosave');
        if (autoSavedSettings) {
            try {
                const parsedSettings = JSON.parse(autoSavedSettings);
                // Merge GlobalDefaults -> Current Theme in autosave (if any) -> Parsed Settings
                const baseThemeName = parsedSettings.theme || defaultThemeName;
                const baseTheme = themes[baseThemeName] || themes[defaultThemeName];
                const mergedSettings = deepMerge({}, this.globalDefaults, { theme: baseThemeName }, baseTheme, parsedSettings);
                this.loadSettings(mergedSettings);
            } catch (e) {
                console.error("Failed to load auto-saved settings", e);
                applyFolderStates(this.gui, this.params.guiFolderStates);
                this.applyTheme(defaultThemeName);
            }
        } else {
            // Initially collapse all folders from params if present
            applyFolderStates(this.gui, this.params.guiFolderStates);
            // Apply Initial Theme
            this.applyTheme(defaultThemeName);
        }

        // Make sure GUI reflects the state
        applyFolderStates(this.gui, this.params.guiFolderStates);

        // Setup Auto-Save Listeners
        this.gui.onChange(() => this.scheduleAutoSave());
        // Listen to interaction to catch folder opening/closing and custom swatches
        this.gui.domElement.addEventListener('click', () => this.scheduleAutoSave());
        this.gui.domElement.addEventListener('keyup', () => this.scheduleAutoSave());

        // Wait a bit before enabling auto-save to ensure setup initialization is fully done
        setTimeout(() => {
            this.ignoreAutoSave = false;
        }, 100);

        // Drag and Drop for PNG metadata
        this.dropCleanup = setupMetadataDrop(
            this.container,
            'next-now-settings',
            (params) => {
                const baseThemeName = params.theme || defaultThemeName;
                const baseTheme = themes[baseThemeName] || themes[defaultThemeName];
                const mergedSettings = deepMerge({}, this.globalDefaults, { theme: baseThemeName }, baseTheme, params);
                this.loadSettings(mergedSettings);
            }
        );

        // Start Loop
        this.renderer.setAnimationLoop(this.update.bind(this));
    }

    async init() {
        await this.renderer.init();
        this.initialized = true;
    }

    async loadTexture(filename) {
        if (this.textures[filename]) return this.textures[filename];
        const path = Object.keys(this.imageFiles).find(p => p.endsWith(filename));
        if (!path) return null;

        const loader = new THREE.TextureLoader();
        const url = this.imageFiles[path];
        const tex = await loader.loadAsync(url);
        tex.wrapS = THREE.RepeatWrapping;
        tex.wrapT = THREE.RepeatWrapping;
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.needsUpdate = true;
        this.textures[filename] = tex;
        return tex;
    }

    updateMaterial() {
        this.material.colorNode = createMainMaterial(this.uniforms, this.params)();
        this.material.needsUpdate = true;
    }

    updatePostProcessingChain() {
        const sceneTexture = this.scenePass.getTextureNode('output');
        const vUv = uv();

        // Ensure resolution is integer and valid
        const w = Math.floor(this.width);
        const h = Math.floor(this.height);

        // Start with sampled scene
        // Consistently split the shader before standard effects to avoid monolithic compilation
        let currentNode = rtt(sceneTexture.sample(vUv), w, h, { type: THREE.HalfFloatType }).sample(vUv);

        // Standard effects (Generator -> etc)
        currentNode = this.effectManager.buildStandardNodes(currentNode, vUv);

        // Post-standard modifiers (Color correction)
        if (this.params.colorCorrectionEnabled && this.postProcessingEffect) {
            currentNode = this.postProcessingEffect.buildColorCorrectionNode(currentNode);
        }

        this.postProcessing.outputNode = currentNode;
        this.postProcessing.needsUpdate = true;
    }

    updatePostProcessing() {
        this.updatePostProcessingChain();
    }

    getGlobalDefaults() {
        return {
            ...this.effectManager.gatherDefaults(),
            distortionAmplitude: 0.1,
            distortionFrequency: 2.0,
            animationSpeed: 0.1,
            perfectLoop: true,
            isPlaying: false,
            previewFrame: 0,
            exportFPS: 30,
            exportDuration: 4,
            exportScaleMultiplier: 1,
            gradientColorCount: 3,
            guiFolderStates: {}
        };
    }

    applyTheme(themeName) {
        const theme = themes[themeName];
        if (!theme) return;

        // Reset to global defaults first, then apply theme
        // Actually, we want to keep current params and MERGE the theme
        // But the requirement says "falls back to default component-level definitions"
        // So we should merge: GlobalDefaults -> Theme
        const mergedSettings = deepMerge({}, this.globalDefaults, { theme: themeName }, theme);
        this.loadSettings(mergedSettings);
    }

    loadSettings(settings) {
        // Deep merge the incoming settings into our params
        deepMerge(this.params, settings);

        // Ensure color count is accurately reflected
        if (settings.gradientColors) {
            this.params.gradientColorCount = settings.gradientColors.length;
        }

        if (this.rebuildDynamicControls) {
            this.rebuildDynamicControls(false);
        }

        if (this.updateFrameLimits) {
            this.updateFrameLimits();
        }

        // Update Gradient Uniforms
        this.uCenter?.value.set(settings.centerX, settings.centerY);
        if (this.uRadius) this.uRadius.value = settings.radius;
        if (this.uDistortionAmplitude) this.uDistortionAmplitude.value = settings.distortionAmplitude;
        if (this.uDistortionFrequency) this.uDistortionFrequency.value = settings.distortionFrequency;
        this.updateAnimationSpeeds();

        if (this.uGradientType) this.uGradientType.value = settings.gradientType === 'Noise Based Gradient' ? 0 : 1;
        const directions = ['Left to Right', 'Right to Left', 'Top to Bottom', 'Bottom to Top'];
        if (this.uLinearDirection) this.uLinearDirection.value = directions.indexOf(settings.linearDirection || 'Left to Right');
        if (this.uLinearRotation) this.uLinearRotation.value = settings.linearRotation !== undefined ? settings.linearRotation : 0;
        this.uLinearScale?.value.set(settings.linearScaleX || 1, settings.linearScaleY || 1);
        this.uLinearCenter?.value.set(settings.linearCenterX !== undefined ? settings.linearCenterX : 0.5, settings.linearCenterY !== undefined ? settings.linearCenterY : 0.5);
        if (this.uLinearWrapMode) this.uLinearWrapMode.value = ['Clamp', 'Repeat', 'Mirror'].indexOf(settings.linearWrapMode || 'Mirror');
        if (this.uGradientMidpoint) this.uGradientMidpoint.value = settings.gradientMidpoint !== undefined ? settings.gradientMidpoint : 0.5;

        // Update LUT Texture
        this.gradientEffect?.updateTexture();

        if (this.updateGradientVisibility) {
            this.updateGradientVisibility(settings.gradientType || 'Noise Based Gradient');
        }

        this.updateMaterial();

        // Update Noise Post Processing Uniforms
        if (this.postUniforms) {
            this.effectManager.updateUniforms(this.params);
            this.updatePostProcessingChain();
            this.updateAnimationSpeeds();
        }


        // Refresh all swatch grids
        this.gui.folders.forEach(f => {
            if (f._updateSwatches) f._updateSwatches.forEach(update => update());
        });

        // Apply GUI folder states (collapses by default if states missing)
        applyFolderStates(this.gui, settings.guiFolderStates);

        // Update GUI display
        const refreshGui = (folders) => {
            folders.forEach(f => {
                f.controllers.forEach(c => c.updateDisplay());
                if (f.folders) refreshGui(f.folders);
            });
        };
        refreshGui([this.gui]);

        if (this.scheduleAutoSave) {
            this.scheduleAutoSave();
        }
    }

    // onDrop functionality is now handled by setupMetadataDrop in the constructor

    scheduleAutoSave() {
        if (this.ignoreAutoSave) return;
        if (this.autoSaveTimeout) clearTimeout(this.autoSaveTimeout);
        this.autoSaveTimeout = setTimeout(() => {
            this.autoSave();
        }, 500);
    }

    getQuantizedSpeed(speed, duration) {
        if (duration <= 0) return speed;
        // Calculate nearest integer cycle
        let cycles = Math.round((duration * speed) / (2 * Math.PI));

        // Prevent speed from dropping to 0 (freezing) unless original speed was exactly 0
        if (speed !== 0 && cycles === 0) {
            cycles = Math.sign(speed);
        }

        // Return the perfect loop speed
        return (2 * Math.PI * cycles) / duration;
    }

    updateBaseSpeeds(isLoop, duration, quantizeFn) {
        let speedX = this.params.animationSpeed;
        let speedY = this.params.animationSpeed * 0.8;
        if (isLoop) {
            speedX = quantizeFn(speedX, duration);
            speedY = quantizeFn(speedY, duration);
        }
        if (this.uAnimationSpeed) {
            this.uAnimationSpeed.value.set(speedX, speedY);
        }
    }

    updateAnimationSpeeds() {
        const dur = this.params.exportDuration || 4;
        const isLoop = this.params.perfectLoop;

        // Update base speeds (gradient/distortion)
        this.updateBaseSpeeds(isLoop, dur, this.getQuantizedSpeed.bind(this));

        // Delegate to mounted modular effects
        if (this.mountedEffects) {
            this.mountedEffects.forEach(effect => {
                if (typeof effect.updateSpeeds === 'function') {
                    effect.updateSpeeds(isLoop, dur, this.getQuantizedSpeed.bind(this));
                }
            });
        }
    }

    autoSave() {
        if (!this.initialized) return;

        // Record GUI states into params before saving
        this.params.guiFolderStates = getFolderStates(this.gui);

        const serializableParams = {};
        for (const [key, value] of Object.entries(this.params)) {
            if (typeof value !== 'function') {
                serializableParams[key] = value;
            }
        }
        localStorage.setItem('next_now_sketch_016_autosave', JSON.stringify(serializableParams));
    }

    onResize() {
        this.width = window.innerWidth;
        this.height = window.innerHeight;

        this.renderer.setSize(this.width, this.height);
        const dpr = Math.min(window.devicePixelRatio, 2);
        this.renderer.setPixelRatio(dpr);

        this.uResolution.value.set(this.width, this.height);
        this.uDpr.value = dpr;
        this.updateAnimationSpeeds();
    }

    onPointerMove(e) {
        if (!this.initialized) return;
        const x = e.clientX / this.width;
        const y = e.clientY / this.height;
        this.mouseTarget.set(x, y);
    }

    update(t) {
        if (!this.initialized) return;

        // Apply mouse smoothing if relevant settings exist
        // Arches mouse interaction is the primary user, but we can make it generic
        const momentum = this.params.archesMouseSmoothing !== undefined ? this.params.archesMouseSmoothing : 1.0;
        if (momentum < 1.0) {
            this.uMousePos.value.lerp(this.mouseTarget, 1.0 - momentum);
        } else {
            this.uMousePos.value.copy(this.mouseTarget);
        }

        let deltaTime = 0;
        if (this.lastTime !== undefined) {
            deltaTime = t - this.lastTime;
        }
        this.lastTime = t;

        let timeSeconds;

        if (this.params.perfectLoop) {
            if (this.params.previewFrame === undefined || isNaN(this.params.previewFrame)) {
                this.params.previewFrame = 0;
            }

            const totalFrames = Math.floor(this.params.exportFPS * this.params.exportDuration);

            if (!this.isExporting) {
                // Keep fractional tracking independent so the GUI only receives pure integers
                if (this._fractionalFrame === undefined || Math.floor(this._fractionalFrame) !== this.params.previewFrame) {
                    this._fractionalFrame = this.params.previewFrame;
                }

                if (this.params.isPlaying) {
                    const frameIncrement = (deltaTime / 1000) * this.params.exportFPS;
                    this._fractionalFrame += frameIncrement;
                    this._fractionalFrame = this._fractionalFrame % totalFrames;

                    this.params.previewFrame = Math.floor(this._fractionalFrame);
                }
            }

            timeSeconds = this.params.previewFrame / this.params.exportFPS;
        } else {
            timeSeconds = t / 1000;
        }

        if (this.uniforms && this.uniforms.uGlobalTime) {
            this.uniforms.uGlobalTime.value = timeSeconds;
        }

        if (this.postUniforms && this.postUniforms.uTime) {
            this.postUniforms.uTime.value = timeSeconds;
        }

        if (this.mountedEffects) {
            this.mountedEffects.forEach(effect => {
                if (typeof effect.update === 'function') {
                    effect.update(deltaTime, timeSeconds);
                }
            });
        }

        // Render Final Scene (Quad) with Post Processing
        this.postProcessing.render();
    }

    dispose() {
        this.renderer.setAnimationLoop(null);
        window.removeEventListener('resize', this.resizeHandler);
        window.removeEventListener('pointermove', this.pointerHandler);

        if (this.gui) this.gui.destroy();
        if (this.dropCleanup) this.dropCleanup();

        this.renderer.dispose();

        // Dispose all mounted effects
        if (this.mountedEffects) {
            this.mountedEffects.forEach(effect => {
                if (typeof effect.dispose === 'function') {
                    effect.dispose();
                }
            });
        }

        // Dispose textures
        if (this.textures) {
            Object.values(this.textures).forEach(tex => {
                if (tex && typeof tex.dispose === 'function') {
                    tex.dispose();
                }
            });
            this.textures = {};
        }

        this.scene.traverse((child) => {
            if (child.isMesh) {
                child.geometry.dispose();
                child.material.dispose();
            }
        });

        if (this.container.contains(this.renderer.domElement)) {
            this.container.removeChild(this.renderer.domElement);
        }
    }

    saveAsPNG() {
        const themeName = this.params.theme;
        const date = new Date();
        const timestamp = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}-${String(date.getHours()).padStart(2, '0')}${String(date.getMinutes()).padStart(2, '0')}${String(date.getSeconds()).padStart(2, '0')}`;
        const filename = `sketch-016-${themeName}-${timestamp}.png`;

        // Record GUI states into params before saving
        this.params.guiFolderStates = getFolderStates(this.gui);

        saveCanvasToPNG(this.renderer.domElement, this.params, 'next-now-settings', filename);
    }

    async exportSequence() {
        if (this.isExporting) return;
        this.isExporting = true;

        let exportCtrl;
        this.gui.folders.forEach(f => {
            if (f._title === 'Export') {
                exportCtrl = f.controllers.find(c => c.property === 'exportSequence');
            }
        });

        // Prepare UI for export
        this.gui.domElement.style.pointerEvents = 'none';
        this.gui.domElement.style.opacity = '0.5';

        // Stop animation loop to take manual control
        this.renderer.setAnimationLoop(null);

        const wasPerfectLoop = this.params.perfectLoop;
        const wasPlaying = this.params.isPlaying;

        this.params.perfectLoop = true; // Force math
        this.params.isPlaying = false; // Freeze the scrubber
        this.updateAnimationSpeeds();

        try {
            await exportSequence({
                renderer: this.renderer,
                fps: this.params.exportFPS || 30,
                duration: this.params.exportDuration || 4,
                resolution: [
                    Math.floor(this.width * (this.params.exportScaleMultiplier || 1)),
                    Math.floor(this.height * (this.params.exportScaleMultiplier || 1))
                ],
                onProgress: (current, total, statusText) => {
                    if (exportCtrl) exportCtrl.name(statusText || `Exporting... ${current}/${total}`);
                },
                renderFrame: async (tSeconds, i) => {
                    this.params.previewFrame = i;

                    this.uResolution.value.set(
                        Math.floor(this.width * (this.params.exportScaleMultiplier || 1)),
                        Math.floor(this.height * (this.params.exportScaleMultiplier || 1))
                    );

                    // Drives the exact same math as the live canvas!
                    this.update(0);

                    // Yield to keep the browser responsive, awaiting the GPU compositor to finish
                    await new Promise(r => requestAnimationFrame(r));
                }
            });
        } catch (err) {
            console.error("Failed to export sequence", err);
            alert(`Export failed: ${err.message}`);
        } finally {
            // Restore UI and state
            this.params.perfectLoop = wasPerfectLoop;
            this.params.isPlaying = wasPlaying;
            this.updateAnimationSpeeds();

            this.uResolution.value.set(this.width, this.height);
            this.gui.domElement.style.pointerEvents = 'auto';
            this.gui.domElement.style.opacity = '1';
            if (exportCtrl) exportCtrl.name('Export Sequence 🎬');
            this.isExporting = false;
            this.renderer.setAnimationLoop(this.update.bind(this));
        }
    }
}
