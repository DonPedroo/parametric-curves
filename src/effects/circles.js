import { uniform, vec2, Fn, float, mix, step, vec3, texture, uv, vec4, distance, smoothstep, If } from 'three/tsl';
import * as THREE from 'three/webgpu';

/**
 * Blending functions in TSL
 */
export const blendOverlayTSL = Fn(([base, blend]) => {
    return mix(
        base.mul(blend).mul(2.0),
        vec3(1.0).sub(vec3(1.0).sub(base).mul(vec3(1.0).sub(blend)).mul(2.0)),
        step(0.5, base)
    );
});

/**
 * Core image processing logic (Scale, Aspect, Exposure, Gamma, Blend)
 */
export const applyImageOverlayTSL = Fn(([inputColor, vUv, uTexture, uConfig]) => {
    const {
        uOpacity,
        uScale,
        uCover,
        uExposure,
        uGamma,
        uBlendMode,
        uAspect,
        uResolution,
        uInvert
    } = uConfig;

    const screenAspect = uResolution.x.div(uResolution.y);

    // UV manipulation for scaling and cover mode
    const imageUv = vUv.toVar();

    // Center the UVs before scaling
    imageUv.assign(imageUv.sub(0.5));

    const isWider = screenAspect.greaterThan(uAspect);

    // Logic for "Cover":
    const coverScale = isWider.select(
        vec2(1.0, screenAspect.div(uAspect)), // Wider screen: scale Y up
        vec2(uAspect.div(screenAspect), 1.0)  // Taller screen: scale X up
    );

    const finalScale = uCover.equal(1).select(coverScale, vec2(1.0));
    imageUv.assign(imageUv.div(finalScale));

    // Apply manual scale
    imageUv.assign(imageUv.div(uScale));

    const sampledUv = imageUv.add(0.5);
    const imgColor = uTexture.sample(sampledUv).toVar();

    // Invert
    imgColor.rgb.assign(uInvert.equal(1).select(vec3(1.0).sub(imgColor.rgb), imgColor.rgb));

    // Exposure & Gamma
    imgColor.rgb.assign(imgColor.rgb.mul(uExposure.exp2()));
    imgColor.rgb.assign(imgColor.rgb.pow(float(1.0).div(uGamma)));

    // Blending Logic
    const blendResult = vec3(0.0).toVar();
    const base = inputColor.rgb;
    const blend = imgColor.rgb;

    const isMix = uBlendMode.equal(0);
    const isAdd = uBlendMode.equal(1);
    const isScreen = uBlendMode.equal(2);
    const isMultiply = uBlendMode.equal(3);
    const isOverlay = uBlendMode.equal(4);

    blendResult.assign(
        isMix.select(blend,
            isAdd.select(base.add(blend),
                isScreen.select(vec3(1.0).sub(vec3(1.0).sub(base).mul(vec3(1.0).sub(blend))),
                    isMultiply.select(base.mul(blend),
                        isOverlay.select(blendOverlayTSL(base, blend),
                            blend)))))
    );

    const finalRgb = mix(base, blendResult, uOpacity.mul(imgColor.a));
    return vec4(finalRgb, inputColor.a);
});

/**
 * Circles Effect Module
 * Allows overlaying up to 5 textured circles on the screen.
 */
export class CirclesEffect {
    static type = 'standard';
    static order = 10;
    static id = 'CirclesEffect';

    static getDefaults() {
        const circleDefaults = {
            enabled: false,
            x: 0.5,
            y: 0.5,
            diameter: 0.3,
            opacity: 1.0,
            invert: false,
            scale: 1.0,
            cover: true,
            exposure: 0.0,
            gamma: 1.0,
            blendMode: 'mix',
            filename: 'Grain – Light 1.png'
        };
        return {
            circlesEnabled: false,
            circlesSelected: 0,
            circles: [
                { ...circleDefaults, enabled: true },
                { ...circleDefaults },
                { ...circleDefaults },
                { ...circleDefaults },
                { ...circleDefaults }
            ]
        };
    }

    constructor(sketch) {
        this.sketch = sketch;
        this.params = sketch.params;
        this.uniforms = {};
    }

    updateTextureUniforms() {
        this.params.circles.forEach((config, i) => {
            if (config.filename) {
                this.sketch.loadTexture(config.filename).then(tex => {
                    if (tex) {
                        this.uniforms.circles[i].uTexture.value = tex;
                        this.updateAspectUniform(i);
                    }
                });
            }
        });
    }

    updateAspectUniform(i) {
        const tex = this.uniforms.circles[i].uTexture.value;
        if (tex && tex.image) {
            this.uniforms.circles[i].uAspect.value = tex.image.width / tex.image.height;
        }
    }

    setupUniforms() {
        Object.assign(this.uniforms, {
            uEnabled: uniform(this.params.circlesEnabled ? 1 : 0),
            uResolution: this.sketch.uResolution,
            circles: this.params.circles.map((c, i) => {
                const dummyTex = new THREE.DataTexture(new Uint8Array([0, 0, 0, 0]), 1, 1);
                dummyTex.wrapS = THREE.RepeatWrapping;
                dummyTex.wrapT = THREE.RepeatWrapping;
                dummyTex.needsUpdate = true;

                const defaults = CirclesEffect.getDefaults().circles[i];
                const p = { ...defaults, ...c };

                return {
                    uEnabled: uniform(p.enabled ? 1 : 0),
                    uPos: uniform(vec2(p.x, p.y)),
                    uDiameter: uniform(p.diameter),
                    uOpacity: uniform(p.opacity),
                    uInvert: uniform(p.invert ? 1 : 0),
                    uScale: uniform(p.scale),
                    uCover: uniform(p.cover ? 1 : 0),
                    uExposure: uniform(p.exposure),
                    uGamma: uniform(p.gamma),
                    uBlendMode: uniform(['mix', 'add', 'screen', 'multiply', 'overlay'].indexOf(p.blendMode)),
                    uAspect: uniform(1.0),
                    uTexture: texture(dummyTex)
                };
            })
        });

        this.updateTextureUniforms();
        return this.uniforms;
    }

    buildNode(inputColorNode, uvNode) {
        if (!this.params.circlesEnabled) return inputColorNode;
        return this._buildNodeTSL(inputColorNode, uvNode);
    }

    _buildNodeTSL = Fn(([inputColorNode, uvNode]) => {
        const finalColor = inputColorNode.toVar();

        If(this.uniforms.uEnabled.equal(1), () => {
            const screenAspect = this.uniforms.uResolution.x.div(this.uniforms.uResolution.y);

            for (let i = 0; i < 5; i++) {
                const c = this.uniforms.circles[i];

                If(c.uEnabled.equal(1), () => {
                    // Circle Mask logic
                    const aspectCorrectedUv = uvNode.toVar();
                    aspectCorrectedUv.x.assign(aspectCorrectedUv.x.mul(screenAspect));

                    const correctedPos = c.uPos.toVar();
                    correctedPos.x.assign(correctedPos.x.mul(screenAspect));

                    const dist = distance(aspectCorrectedUv, correctedPos);
                    const radius = c.uDiameter.div(2.0);
                    const mask = step(dist, radius);

                    // Re-center UV for texture mapping relative to circle center
                    const relativeUv = uvNode.sub(c.uPos).div(c.uDiameter).add(0.5);

                    const config = {
                        uInvert: c.uInvert,
                        uOpacity: c.uOpacity.mul(mask),
                        uScale: c.uScale,
                        uCover: c.uCover,
                        uExposure: c.uExposure,
                        uGamma: c.uGamma,
                        uBlendMode: c.uBlendMode,
                        uAspect: c.uAspect,
                        uResolution: this.uniforms.uResolution
                    };

                    const circleColor = applyImageOverlayTSL(finalColor, relativeUv, c.uTexture, config);

                    // Only modify if inside mask
                    finalColor.assign(circleColor);
                });
            }
        });

        return finalColor;
    });

    setupGUI(parentFolder) {
        const folder = parentFolder.addFolder('Circles Effect');
        const params = this.params;
        const uniforms = this.uniforms;

        folder.add(params, 'circlesEnabled').name('Enabled').onChange(v => {
            uniforms.uEnabled.value = v ? 1 : 0;
            if (this.sketch.updatePostProcessing) this.sketch.updatePostProcessing();
        }).listen();

        folder.add(params, 'circlesSelected', { 'Circle 1': 0, 'Circle 2': 1, 'Circle 3': 2, 'Circle 4': 3, 'Circle 5': 4 }).name('Select Circle').onChange(() => {
            this.refreshCircleGUI();
        }).listen();

        this.circleFolder = folder.addFolder('Circle Settings');
        this.refreshCircleGUI();

        return folder;
    }

    refreshCircleGUI() {
        const folder = this.circleFolder;
        // Clear previous controllers
        const controllers = [...folder.controllers];
        controllers.forEach(c => c.destroy());

        const index = this.params.circlesSelected;
        const p = this.params.circles[index];
        const u = this.uniforms.circles[index];

        folder.add(p, 'enabled').name('Enabled').onChange(v => {
            u.uEnabled.value = v ? 1 : 0;
            if (this.sketch.updatePostProcessing) this.sketch.updatePostProcessing();
        }).listen();
        folder.add(p, 'x', 0, 1).name('Pos X').onChange(v => u.uPos.value.x = v).listen();
        folder.add(p, 'y', 0, 1).name('Pos Y').onChange(v => u.uPos.value.y = v).listen();
        folder.add(p, 'diameter', 0.01, 2).name('Diameter').onChange(v => u.uDiameter.value = v).listen();

        const filenames = Object.keys(this.sketch.imageFiles).map(path => path.split('/').pop());
        folder.add(p, 'filename', filenames).name('Image').onChange(async v => {
            const tex = await this.sketch.loadTexture(v);
            if (tex) {
                u.uTexture.value = tex;
                this.updateAspectUniform(index);
            }
        }).listen();

        if (p.invert === undefined) p.invert = false;
        folder.add(p, 'invert').name('Invert').onChange(v => u.uInvert.value = v ? 1 : 0).listen();
        folder.add(p, 'opacity', 0, 1).name('Opacity').onChange(v => u.uOpacity.value = v).listen();
        folder.add(p, 'scale', 0.1, 5).name('Texture Scale').onChange(v => u.uScale.value = v).listen();
        folder.add(p, 'cover').name('Cover Mode').onChange(v => u.uCover.value = v ? 1 : 0).listen();
        folder.add(p, 'exposure', -2, 2).name('Exposure').onChange(v => u.uExposure.value = v).listen();
        folder.add(p, 'gamma', 0.1, 3).name('Gamma').onChange(v => u.uGamma.value = v).listen();

        const blendModes = ['mix', 'add', 'screen', 'multiply', 'overlay'];
        folder.add(p, 'blendMode', blendModes).name('Blend Mode').onChange(v => u.uBlendMode.value = blendModes.indexOf(v)).listen();
    }

    updateUniforms(params) {
        this.uniforms.uEnabled.value = params.circlesEnabled ? 1 : 0;
        params.circles.forEach((c, i) => {
            const defaults = CirclesEffect.getDefaults().circles[i];
            const p = { ...defaults, ...c };
            const u = this.uniforms.circles[i];
            u.uEnabled.value = p.enabled ? 1 : 0;
            u.uPos.value.set(p.x, p.y);
            u.uDiameter.value = p.diameter;
            u.uOpacity.value = p.opacity;
            u.uInvert.value = p.invert ? 1 : 0;
            u.uScale.value = p.scale;
            u.uCover.value = p.cover ? 1 : 0;
            u.uExposure.value = p.exposure;
            u.uGamma.value = p.gamma;
            const blendModes = ['mix', 'add', 'screen', 'multiply', 'overlay'];
            u.uBlendMode.value = blendModes.indexOf(p.blendMode);

            if (p.filename) {
                this.sketch.loadTexture(p.filename).then(tex => {
                    if (tex) {
                        u.uTexture.value = tex;
                        this.updateAspectUniform(i);
                    }
                });
            }
        });
    }

    /**
     * Updates animation speeds based on perfect loop settings
     * Placeholder for future animated parameters
     */
    updateSpeeds(isPerfectLoop, duration, quantizeFn) {
        // No animated parameters in CirclesEffect currently
    }
}
