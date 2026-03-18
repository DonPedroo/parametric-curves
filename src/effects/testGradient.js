import { uniform, Fn, color, mix, vec4, vec3, float, step, fract, dot, If } from 'three/tsl';

/**
 * TestGradient
 * A mathematical linear gradient effect with advanced banding mitigation.
 */
export class TestGradient {
    static type = 'standard';
    static order = 100;

    static getDefaults() {
        return {
            testGradientEnabled: false,
            testGradientLinearTransfer: true,
            testGradientIGNDither: true,
            testGradientDitherStrength: 1.0,
            testGradientColorA: '#ff0000',
            testGradientColorB: '#0000ff'
        };
    }

    constructor(sketch) {
        this.sketch = sketch;
        this.params = sketch.params;
        this.uniforms = {};
    }

    /**
     * Official sRGB to Linear helper
     * Using the industry standard segmented transfer function
     */
    sRGBToLinear = Fn(([col]) => {
        const cond = step(0.04045, col);
        const low = col.div(12.92);
        const high = col.add(0.055).div(1.055).pow(2.4);
        return mix(low, high, cond);
    });

    /**
     * Official Linear to sRGB helper
     */
    linearToSRGB = Fn(([col]) => {
        const cond = step(0.0031308, col);
        const low = col.mul(12.92);
        const high = col.pow(1.0 / 2.4).mul(1.055).sub(0.055);
        return mix(low, high, cond);
    });

    /**
     * Interleaved Gradient Noise (IGN)
     * From: http://www.iryoku.com/next-generation-post-processing-in-call-of-duty-advanced-warfare
     */
    ign = Fn(([pixelPos]) => {
        const magic = float(0.06711056).mul(pixelPos.x).add(float(0.00583715).mul(pixelPos.y));
        return fract(float(52.9829189).mul(fract(magic)));
    });

    /**
     * Initializes uniforms.
     */
    setupUniforms() {
        this.uniforms = {
            uEnabled: uniform(this.params.testGradientEnabled ? 1 : 0),
            uLinearTransfer: uniform(this.params.testGradientLinearTransfer ? 1 : 0),
            uIGNDither: uniform(this.params.testGradientIGNDither ? 1 : 0),
            uDitherStrength: uniform(this.params.testGradientDitherStrength),
            uColorA: uniform(color(this.params.testGradientColorA)),
            uColorB: uniform(color(this.params.testGradientColorB)),
            uResolution: this.sketch.uResolution
        };
        return this.uniforms;
    }

    /**
     * Updates uniforms when params change.
     */
    updateUniforms(params) {
        this.uniforms.uEnabled.value = params.testGradientEnabled ? 1 : 0;
        this.uniforms.uLinearTransfer.value = params.testGradientLinearTransfer ? 1 : 0;
        this.uniforms.uIGNDither.value = params.testGradientIGNDither ? 1 : 0;
        this.uniforms.uDitherStrength.value = params.testGradientDitherStrength;
        if (this.uniforms.uColorA) this.uniforms.uColorA.value.set(params.testGradientColorA);
        if (this.uniforms.uColorB) this.uniforms.uColorB.value.set(params.testGradientColorB);
    }

    /**
     * Injects GUI controls.
     */
    setupGUI(parentFolder) {
        const folder = parentFolder.addFolder('Test Gradient');
        const p = this.params;
        const u = this.uniforms;

        folder.add(p, 'testGradientEnabled').name('Enabled').onChange(v => {
            u.uEnabled.value = v ? 1 : 0;
            if (this.sketch.updatePostProcessing) this.sketch.updatePostProcessing();
        }).listen();

        folder.add(p, 'testGradientLinearTransfer').name('Official sRGB Transform').onChange(v => {
            u.uLinearTransfer.value = v ? 1 : 0;
        }).listen();

        folder.add(p, 'testGradientIGNDither').name('IGN Dithering').onChange(v => {
            u.uIGNDither.value = v ? 1 : 0;
        }).listen();

        folder.add(p, 'testGradientDitherStrength', 0, 5).name('Dither Strength').onChange(v => {
            u.uDitherStrength.value = v;
        }).listen();

        folder.addColor(p, 'testGradientColorA').name('Color A (Left)').onChange(v => u.uColorA.value.set(v)).listen();
        folder.addColor(p, 'testGradientColorB').name('Color B (Right)').onChange(v => u.uColorB.value.set(v)).listen();

        return folder;
    }

    /**
     * Returns the TSL function that implements the effect.
     */
    buildNode(inputColorNode, uvNode) {
        if (!this.params.testGradientEnabled) return inputColorNode;

        return Fn(() => {
            const isOfficial = this.uniforms.uLinearTransfer;
            const useDither = this.uniforms.uIGNDither;
            const colA = this.uniforms.uColorA.rgb;
            const colB = this.uniforms.uColorB.rgb;

            // Always blend in linear space for maximum quality now that precision is fixed
            const finalRGB = this.linearToSRGB(mix(this.sRGBToLinear(colA), this.sRGBToLinear(colB), uvNode.x)).toVar();

            // Apply IGN Dithering
            If(useDither.equal(1), () => {
                const pixelPos = uvNode.mul(this.uniforms.uResolution);
                const noise = this.ign(pixelPos).sub(0.5);
                finalRGB.addAssign(noise.mul(this.uniforms.uDitherStrength.div(255.0)));
            });

            return vec4(finalRGB, 1.0);
        })();
    }
}
