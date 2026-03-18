import * as THREE from 'three/webgpu';
import { Fn, float, int, sin, cos, vec2, texture, uniform, smoothstep, mix, step, fract, If, uv } from 'three/tsl';
import { BRAND_COLORS } from '../settings.js';

/**
 * Gradient Effect Module
 * Provides reusable logic for N-color gradients with TSL integration and Lil-GUI support.
 */
export class GradientEffect {
    static type = 'generator';
    static order = 10;

    static getDefaults() {
        return {
            gradientType: 'Noise Based Gradient',
            gradientColors: [BRAND_COLORS.WarmBlack, BRAND_COLORS.PrimaryRed, BRAND_COLORS.DeepRed],
            gradientStops: [0, 0.5, 1.0],
            gradientColorCount: 3,
            centerX: 0.5,
            centerY: 0.5,
            radius: 1.0,
            gradientMidpoint: 0.5,
            linearDirection: 'Left to Right',
            linearRotation: 0,
            linearScaleX: 1,
            linearScaleY: 1,
            linearCenterX: 0.5,
            linearCenterY: 0.5,
            linearWrapMode: 'Mirror',
            gradientIGNDither: true,
            gradientDitherStrength: 1.0
        };
    }

    constructor(sketch) {
        this.sketch = sketch;
        this.params = sketch.params;
        this.uniforms = {};
        this.texture = null;
        this.ctx = null;
        this.dynamicControllers = [];
    }

    /**
     * Initializes uniforms required for the gradient shader
     */
    setupUniforms() {
        this.texture = this.createGradientTexture();

        this.uniforms = {
            uGradientMap: this.texture,
            uCenter: uniform(vec2(this.params.centerX, this.params.centerY)),
            uRadius: uniform(this.params.radius),
            uGradientMidpoint: uniform(this.params.gradientMidpoint),
            uGradientType: uniform(this.params.gradientType === 'Noise Based Gradient' ? 0 : 1),
            uLinearDirection: uniform(['Left to Right', 'Right to Left', 'Top to Bottom', 'Bottom to Top'].indexOf(this.params.linearDirection)),
            uLinearRotation: uniform(this.params.linearRotation),
            uLinearScale: uniform(vec2(this.params.linearScaleX, this.params.linearScaleY)),
            uLinearCenter: uniform(vec2(this.params.linearCenterX, this.params.linearCenterY)),
            uLinearWrapMode: uniform(['Clamp', 'Repeat', 'Mirror'].indexOf(this.params.linearWrapMode)),
            uGradientIGNDither: uniform(this.params.gradientIGNDither ? 1 : 0),
            uGradientDitherStrength: uniform(this.params.gradientDitherStrength),
            uResolution: this.sketch.uResolution,
            uDpr: this.sketch.uDpr
        };

        return this.uniforms;
    }

    /**
     * Creates the canvas texture used for the gradient LUT
     */
    createGradientTexture() {
        const canvas = document.createElement('canvas');
        canvas.width = 256;
        canvas.height = 1;
        this.ctx = canvas.getContext('2d');
        const gradientTexture = new THREE.CanvasTexture(canvas);
        gradientTexture.magFilter = THREE.LinearFilter;
        gradientTexture.minFilter = THREE.LinearFilter;
        gradientTexture.colorSpace = THREE.SRGBColorSpace;
        return gradientTexture;
    }

    /**
     * Updates the gradient texture based on current params
     */
    updateTexture() {
        if (!this.ctx) return;
        const ctx = this.ctx;
        const colors = this.params.gradientColors || [];
        const stops = this.params.gradientStops || [];

        const grad = ctx.createLinearGradient(0, 0, 256, 0);
        colors.forEach((color, i) => {
            const stop = stops[i] !== undefined ? stops[i] : (i / (colors.length - 1));
            grad.addColorStop(THREE.MathUtils.clamp(stop, 0, 1), color);
        });

        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, 256, 1);
        this.texture.needsUpdate = true;
    }

    /**
     * Injects GUI controls into a Lil-GUI folder
     */
    setupGUI(parentFolder) {
        const gradFolder = parentFolder.addFolder('Gradient Settings');
        const params = this.params;
        const uniforms = this.uniforms;

        const typeController = gradFolder.add(params, 'gradientType', ['Noise Based Gradient', 'Linear Gradient']).name('Type').onChange((v) => {
            uniforms.uGradientType.value = (v === 'Noise Based Gradient' ? 0 : 1);
            this.updateVisibility(v);
            if (this.sketch.updateMaterial) this.sketch.updateMaterial();
        }).listen();

        const linearDirectionController = gradFolder.add(params, 'linearDirection', ['Left to Right', 'Right to Left', 'Top to Bottom', 'Bottom to Top']).name('Direction').onChange((v) => {
            const directions = ['Left to Right', 'Right to Left', 'Top to Bottom', 'Bottom to Top'];
            uniforms.uLinearDirection.value = directions.indexOf(v);
        }).listen();

        const linearRotationController = gradFolder.add(params, 'linearRotation', 0, Math.PI * 2).name('Rotation').onChange((v) => {
            uniforms.uLinearRotation.value = v;
        }).listen();

        const linearScaleXController = gradFolder.add(params, 'linearScaleX', 0.01, 5).name('Scale X').onChange((v) => {
            uniforms.uLinearScale.value.x = v;
        }).listen();

        const linearScaleYController = gradFolder.add(params, 'linearScaleY', 0.01, 5).name('Scale Y').onChange((v) => {
            uniforms.uLinearScale.value.y = v;
        }).listen();

        const linearCenterXController = gradFolder.add(params, 'linearCenterX', -1, 2).name('Offset X').onChange((v) => {
            uniforms.uLinearCenter.value.x = v;
        }).listen();

        const linearCenterYController = gradFolder.add(params, 'linearCenterY', -1, 2).name('Offset Y').onChange((v) => {
            uniforms.uLinearCenter.value.y = v;
        }).listen();

        const linearWrapModeController = gradFolder.add(params, 'linearWrapMode', ['Clamp', 'Repeat', 'Mirror']).name('Wrap Mode').onChange((v) => {
            uniforms.uLinearWrapMode.value = ['Clamp', 'Repeat', 'Mirror'].indexOf(v);
        }).listen();

        gradFolder.add(params, 'gradientIGNDither').name('IGN Dithering').onChange(v => {
            uniforms.uGradientIGNDither.value = v ? 1 : 0;
            if (this.sketch.updateMaterial) this.sketch.updateMaterial();
        }).listen();

        gradFolder.add(params, 'gradientDitherStrength', 0, 5).name('Dither Strength').onChange(v => {
            uniforms.uGradientDitherStrength.value = v;
            if (this.sketch.updateMaterial) this.sketch.updateMaterial();
        }).listen();

        // N-Color Dynamic Controls
        params.gradientColorCount = params.gradientColors ? params.gradientColors.length : 3;

        const rebuildDynamicControls = (forceEvenStops = false) => {
            this.dynamicControllers.forEach(c => {
                if (c.destroy) c.destroy();
                if (c._swatchWrapper && c._swatchWrapper.parentNode) {
                    c._swatchWrapper.parentNode.removeChild(c._swatchWrapper);
                }
            });
            this.dynamicControllers.length = 0;

            const count = params.gradientColorCount;
            params.gradientColors = params.gradientColors ? [...params.gradientColors] : [];
            params.gradientStops = params.gradientStops ? [...params.gradientStops] : [];

            while (params.gradientColors.length < count) params.gradientColors.push('#ffffff');
            params.gradientColors = params.gradientColors.slice(0, count);

            if (forceEvenStops === true) {
                params.gradientStops = [];
                for (let i = 0; i < count; i++) {
                    params.gradientStops.push(i / (count - 1));
                }
            } else {
                while (params.gradientStops.length < count) {
                    params.gradientStops.push(params.gradientStops.length / (count - 1));
                }
                params.gradientStops = params.gradientStops.slice(0, count);
            }

            for (let i = 0; i < count; i++) {
                const colorCtrl = gradFolder.addColor(params.gradientColors, i).name(`Color ${i + 1}`).onChange(() => this.updateTexture());

                // Swatch Grid
                const wrapper = document.createElement('div');
                wrapper.style.marginBottom = '10px';
                const container = document.createElement('div');
                container.className = 'brand-swatches-container';
                Object.entries(BRAND_COLORS).forEach(([name, color]) => {
                    const swatch = document.createElement('div');
                    swatch.className = 'brand-swatch';
                    swatch.style.backgroundColor = color;
                    swatch.onclick = () => {
                        params.gradientColors[i] = color;
                        colorCtrl.updateDisplay();
                        this.updateTexture();
                        container.querySelectorAll('.brand-swatch').forEach(s => s.classList.remove('selected'));
                        swatch.classList.add('selected');
                    };
                    container.appendChild(swatch);
                });
                wrapper.appendChild(container);
                if (colorCtrl.domElement) {
                    colorCtrl.domElement.parentNode.insertBefore(wrapper, colorCtrl.domElement);
                    colorCtrl._swatchWrapper = wrapper;
                }
                this.dynamicControllers.push(colorCtrl);

                if (i > 0 && i < count - 1) {
                    const stopCtrl = gradFolder.add(params.gradientStops, i, 0, 1).name(`Color ${i + 1} Pos`).onChange(() => this.updateTexture());
                    this.dynamicControllers.push(stopCtrl);
                }
            }
            this.updateTexture();
        };

        this.rebuildDynamicControls = rebuildDynamicControls;

        gradFolder.add(params, 'gradientColorCount', 2, 5, 1).name('Number of Colors').onChange(() => rebuildDynamicControls(true));
        rebuildDynamicControls();

        const centerXController = gradFolder.add(params, 'centerX', -0.5, 1.5).name('Center X').onChange((v) => uniforms.uCenter.value.x = v).listen();
        const centerYController = gradFolder.add(params, 'centerY', -0.5, 1.5).name('Center Y').onChange((v) => uniforms.uCenter.value.y = v).listen();
        const radiusController = gradFolder.add(params, 'radius', 0.1, 3.0).name('Radius').onChange((v) => uniforms.uRadius.value = v).listen();
        const mid2Controller = gradFolder.add(params, 'gradientMidpoint', 0.1, 0.9).name('Midpoint').onChange((v) => uniforms.uGradientMidpoint.value = v).listen();

        this.controllers = {
            centerXController,
            centerYController,
            radiusController,
            mid2Controller,
            linearDirectionController,
            linearRotationController,
            linearScaleXController,
            linearScaleYController,
            linearCenterXController,
            linearCenterYController,
            linearWrapModeController
        };

        this.updateVisibility(params.gradientType || 'Noise Based Gradient');

        return gradFolder;
    }

    updateVisibility(type) {
        if (!this.controllers) return;
        const isCircular = type === 'Noise Based Gradient';
        const isLinear = type === 'Linear Gradient';

        this.controllers.centerXController.show(isCircular);
        this.controllers.centerYController.show(isCircular);
        this.controllers.radiusController.show(isCircular);
        this.controllers.linearDirectionController.show(isLinear);
    }

    updateUniforms(params) {
        if (this.uniforms.uGradientIGNDither) this.uniforms.uGradientIGNDither.value = params.gradientIGNDither ? 1 : 0;
        if (this.uniforms.uGradientDitherStrength) this.uniforms.uGradientDitherStrength.value = params.gradientDitherStrength;
    }
}

/**
 * TSL Gradient Implementation
 * Returns a color node based on gradient uniforms and distorted UVs
 */
export const getGradientColorNode = (uvNode, uniforms, params) => {
    const {
        uGradientMap,
        uGradientType,
        uLinearDirection,
        uLinearRotation,
        uLinearScale,
        uLinearCenter,
        uLinearWrapMode,
        uGradientMidpoint,
        uRadius
    } = uniforms;

    // Use current type from params for selection logic if needed, but TSL should use uniforms
    const finalAngle = uLinearDirection.equal(0).select(float(0),
        uLinearDirection.equal(1).select(float(Math.PI),
            uLinearDirection.equal(2).select(float(Math.PI * 0.5),
                float(Math.PI * 1.5)
            )
        )
    ).add(uLinearRotation);

    const centeredUv = uvNode.sub(uLinearCenter);
    const s = sin(finalAngle);
    const c = cos(finalAngle);

    const rotatedUv = vec2(
        centeredUv.x.mul(c).sub(centeredUv.y.mul(s)),
        centeredUv.x.mul(s).add(centeredUv.y.mul(c))
    );

    const transformedUv = rotatedUv.div(uLinearScale);
    const linearGradRaw = transformedUv.x.add(0.5);
    const circularGradRaw = smoothstep(0.0, uRadius, transformedUv.length());

    const t = uGradientType.equal(0).select(circularGradRaw, linearGradRaw).toVar();

    // Wrap Mode
    const wrapMode = uLinearWrapMode;
    t.assign(wrapMode.equal(0).select(
        t,
        wrapMode.equal(1).select(
            t.fract(),
            t.mul(0.5).fract().mul(2.0).sub(1.0).abs()
        )
    ));

    // Midpoint bias
    const mid = uGradientMidpoint;
    const p = float(0.5).log().div(mid.clamp(0.01, 0.99).log());
    t.assign(t.pow(p));

    // Official sRGB to Linear for LUT bypass or high-precision math
    const sRGBToLinear = (col) => {
        const cond = step(0.04045, col);
        const low = col.div(12.92);
        const high = col.add(0.055).div(1.055).pow(2.4);
        return mix(low, high, cond);
    };

    const linearToSRGB = (col) => {
        const cond = step(0.0031308, col);
        const low = col.mul(12.92);
        const high = col.pow(1.0 / 2.4).mul(1.055).sub(0.055);
        return mix(low, high, cond);
    };

    const ign = (pixelPos) => {
        const magic = float(0.06711056).mul(pixelPos.x).add(float(0.00583715).mul(pixelPos.y));
        return fract(float(52.9829189).mul(fract(magic)));
    };

    const finalColor = texture(uGradientMap, vec2(t, 0.5)).rgb.toVar();

    // Apply IGN Dithering if enabled
    const { uGradientIGNDither, uGradientDitherStrength, uResolution, uDpr } = uniforms;
    If(uGradientIGNDither.greaterThan(0.5), () => {
        const pixelPos = uv().mul(uResolution);
        const noise = ign(pixelPos).sub(0.5);
        finalColor.addAssign(noise.mul(uGradientDitherStrength.mul(2.0 / 255.0)));
    });

    return finalColor;
};

/**
 * Updates animation speeds based on perfect loop settings
 * Placeholder for future animated parameters.
 * Core animation logic for the gradient is handled in the main material based on uAnimationSpeed.
 */
GradientEffect.prototype.updateSpeeds = function (isPerfectLoop, duration, quantizeFn) {
    // Gradient animation speeds are currently handled by index.js via uAnimationSpeed
};
