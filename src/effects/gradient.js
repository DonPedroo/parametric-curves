import * as THREE from 'three/webgpu';
import { Fn, float, int, sin, cos, vec2, vec3, color, uniform, smoothstep, mix, step, fract, If, uv } from 'three/tsl';
import { BRAND_COLORS } from '../settings.js';

/**
 * Gradient Effect Module
 * Provides reusable logic for N-color gradients with TSL integration and Lil-GUI support.
 */
export class GradientEffect {
    static type = 'generator';
    static order = 10;
    static id = 'GradientEffect';

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
        this.dynamicControllers = [];
    }

    /**
     * Initializes uniforms required for the gradient shader
     */
    setupUniforms() {
        this.uniforms = {
            uCenter: uniform(vec2(this.params.centerX, this.params.centerY)),
            uRadius: uniform(this.params.radius),
            uGradientMidpoint: uniform(this.params.gradientMidpoint),
            uGradientType: uniform(this.params.gradientType === 'Noise Based Gradient' ? 0 : 1),
            uLinearDirection: uniform(['Left to Right', 'Right to Left', 'Top to Bottom', 'Bottom to Top'].indexOf(this.params.linearDirection)),
            uLinearRotation: uniform(this.params.linearRotation),
            uLinearScale: uniform(vec2(this.params.linearScaleX, this.params.linearScaleY)),
            uLinearWrapMode: uniform(['Clamp', 'Repeat', 'Mirror'].indexOf(this.params.linearWrapMode)),
            uGradientIGNDither: uniform(this.params.gradientIGNDither ? 1 : 0),
            uGradientDitherStrength: uniform(this.params.gradientDitherStrength),
            uResolution: this.sketch.uResolution,
            uDpr: this.sketch.uDpr
        };

        // Initialize 5 color and stop uniforms
        for (let i = 0; i < 5; i++) {
            const colorHex = this.params.gradientColors && this.params.gradientColors[i] ? this.params.gradientColors[i] : '#ffffff';
            const stopVal = this.params.gradientStops && this.params.gradientStops[i] !== undefined ? this.params.gradientStops[i] : (i / 4);
            this.uniforms[`uColor${i}`] = uniform(color(colorHex));
            this.uniforms[`uStop${i}`] = uniform(float(stopVal));
        }

        return this.uniforms;
    }

    /**
     * Updates the gradient uniforms based on current params
     */
    updateTexture() {
        const colors = this.params.gradientColors || [];
        const stops = this.params.gradientStops || [];

        for (let i = 0; i < 5; i++) {
            if (this.uniforms[`uColor${i}`] && colors[i]) {
                this.uniforms[`uColor${i}`].value.set(colors[i]);
            }
            if (this.uniforms[`uStop${i}`] && stops[i] !== undefined) {
                this.uniforms[`uStop${i}`].value = stops[i];
            }
        }
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

        const linearScaleXController = gradFolder.add(params, 'linearScaleX', 0.01, 10).name('Scale X').onChange((v) => {
            uniforms.uLinearScale.value.x = v;
        }).listen();

        const linearScaleYController = gradFolder.add(params, 'linearScaleY', 0.01, 10).name('Scale Y').onChange((v) => {
            uniforms.uLinearScale.value.y = v;
        }).listen();

        const linearWrapModeController = gradFolder.add(params, 'linearWrapMode', ['Clamp', 'Repeat', 'Mirror']).name('Wrap Mode').onChange((v) => {
            uniforms.uLinearWrapMode.value = ['Clamp', 'Repeat', 'Mirror'].indexOf(v);
        }).listen();

        const centerXController = gradFolder.add(params, 'centerX', -1, 2).name('Gradient Center X').onChange((v) => uniforms.uCenter.value.x = v).listen();
        const centerYController = gradFolder.add(params, 'centerY', -1, 2).name('Gradient Center Y').onChange((v) => uniforms.uCenter.value.y = v).listen();
        const radiusController = gradFolder.add(params, 'radius', 0.1, 5.0).name('Radius').onChange((v) => uniforms.uRadius.value = v).listen();
        const mid2Controller = gradFolder.add(params, 'gradientMidpoint', 0.1, 0.9).name('Midpoint').onChange((v) => uniforms.uGradientMidpoint.value = v).listen();

        this.controllers = {
            typeController,
            linearDirectionController,
            linearRotationController,
            linearScaleXController,
            linearScaleYController,
            centerXController,
            centerYController,
            radiusController,
            linearWrapModeController,
            mid2Controller
        };

        gradFolder.add(params, 'gradientIGNDither').name('IGN Dithering').onChange(v => {
            uniforms.uGradientIGNDither.value = v ? 1 : 0;
            if (this.sketch.updateMaterial) this.sketch.updateMaterial();
        }).listen();

        gradFolder.add(params, 'gradientDitherStrength', 0, 2).name('Dither Strength').onChange(v => {
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

            // Colors and stops already update via their existing uniforms in updateTexture()
            this.updateTexture();
        };

        this.rebuildDynamicControls = rebuildDynamicControls;

        gradFolder.add(params, 'gradientColorCount', 2, 5, 1).name('Number of Colors').onChange(() => {
            rebuildDynamicControls(true);
            if (this.sketch.updateMaterial) this.sketch.updateMaterial();
        });
        rebuildDynamicControls();


        this.updateVisibility(params.gradientType || 'Noise Based Gradient');

        return gradFolder;
    }

    updateVisibility(type) {
        if (!this.controllers) return;
        const isCircular = type === 'Noise Based Gradient';
        const isLinear = type === 'Linear Gradient';

        // Circular specific
        this.controllers.centerXController.show(isCircular);
        this.controllers.centerYController.show(isCircular);
        this.controllers.radiusController.show(isCircular);

        // Linear specific
        this.controllers.linearDirectionController.show(isLinear);
        this.controllers.linearRotationController.show(isLinear);
        this.controllers.linearScaleXController.show(true); // Now used by both for elliptical/scale
        this.controllers.linearScaleYController.show(true);
        this.controllers.centerXController.show(true); // Unified Offset
        this.controllers.centerYController.show(true);
        this.controllers.linearWrapModeController.show(isLinear);
        this.controllers.radiusController.show(isCircular);
    }

    updateUniforms(params) {
        if (this.uniforms.uGradientIGNDither) this.uniforms.uGradientIGNDither.value = params.gradientIGNDither ? 1 : 0;
        if (this.uniforms.uGradientDitherStrength) this.uniforms.uGradientDitherStrength.value = params.gradientDitherStrength;
        this.updateTexture(); // Sync colors and stops
    }
}

/**
 * TSL Gradient Implementation
 * Returns a color node based on gradient uniforms and distorted UVs
 */
export const getGradientColorNode = (uvNode, uniforms, params) => {
    const {
        uGradientType,
        uLinearDirection,
        uLinearRotation,
        uLinearScale,
        uCenter,
        uLinearWrapMode,
        uGradientMidpoint,
        uRadius
    } = uniforms;


    const ign = Fn(([pixelPos]) => {
        const magic = float(0.06711056).mul(pixelPos.x).add(float(0.00583715).mul(pixelPos.y));
        return fract(float(52.9829189).mul(fract(magic)));
    });

    const finalAngle = uLinearDirection.equal(0).select(float(0),
        uLinearDirection.equal(1).select(float(Math.PI),
            uLinearDirection.equal(2).select(float(Math.PI * 0.5),
                float(Math.PI * 1.5)
            )
        )
    ).add(uLinearRotation);

    const centeredUv = uvNode.sub(uCenter);
    const s = sin(finalAngle);
    const c = cos(finalAngle);

    const rotatedUv = vec2(
        centeredUv.x.mul(c).sub(centeredUv.y.mul(s)),
        centeredUv.x.mul(s).add(centeredUv.y.mul(c))
    );

    const transformedUv = rotatedUv.div(uLinearScale);
    const linearGradRaw = transformedUv.x.add(0.5);
    const circularGradRaw = transformedUv.length().div(uRadius.clamp(0.001, 10.0));

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

    // Clamp and apply Midpoint bias
    const mid = uGradientMidpoint;
    const p = float(0.5).log().div(mid.clamp(0.01, 0.99).log());
    t.assign(t.clamp(0.0, 1.0).pow(p));

    // Mathematical Gradient Calculation (Multi-Stop)
    const finalColor = vec3(0, 0, 0).toVar();
    const count = params.gradientColorCount;

    // Collect uniforms into JS arrays for easy loop unrolling
    const uColors = [];
    const uStops = [];
    for (let i = 0; i < 5; i++) {
        uColors.push(uniforms[`uColor${i}`]);
        uStops.push(uniforms[`uStop${i}`]);
    }

    // We blend stops directly - Three.js Color objects are already in linear space in TSL uniforms
    const linearColors = uColors.map(c => c.rgb);

    for (let i = 0; i < 4; i++) {
        // Only process segments up to count-1
        if (i < count - 1) {
            const colorA = linearColors[i];
            const colorB = linearColors[i + 1];
            const stopA = uStops[i];
            const stopB = uStops[i + 1];

            const isCurrentSegment = t.greaterThanEqual(stopA).and(t.lessThan(stopB));
            const localT = t.sub(stopA).div(stopB.sub(stopA).clamp(0.0001, 1.0));

            If(isCurrentSegment, () => {
                finalColor.assign(mix(colorA, colorB, localT));
            });
        }
    }

    // Handle edges
    If(t.lessThan(uStops[0]), () => {
        finalColor.assign(linearColors[0]);
    });
    If(t.greaterThanEqual(uStops[count - 1]), () => {
        finalColor.assign(linearColors[count - 1]);
    });

    // Convert back to sRGB
    const finalRGB = finalColor.toVar();

    // Apply IGN Dithering if enabled
    const { uGradientIGNDither, uGradientDitherStrength, uResolution, uDpr } = uniforms;
    If(uGradientIGNDither.greaterThan(0.5), () => {
        // Use uv() instead of uvNode (which might be distorted) to match screen-space dithering in testGradient.js
        // Multiply by uDpr to ensure pixel-space resolution on high-DPI screens
        const pixelPos = uv().mul(uResolution.mul(uDpr));

        const noise = ign(pixelPos).sub(0.5);
        // 8-bit style dither amplitude
        finalRGB.addAssign(noise.mul(uGradientDitherStrength.div(255.0)));

        // Clamp to prevent values going out of [0, 1] range after dither
        finalRGB.assign(finalRGB.clamp(0.0, 1.0));
    });

    return finalRGB;
};

/**
 * Updates animation speeds based on perfect loop settings
 * Placeholder for future animated parameters.
 * Core animation logic for the gradient is handled in the main material based on uAnimationSpeed.
 */
GradientEffect.prototype.updateSpeeds = function (isPerfectLoop, duration, quantizeFn) {
    // Gradient animation speeds are currently handled by index.js via uAnimationSpeed
};
