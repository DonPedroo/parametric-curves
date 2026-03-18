import { uniform, vec4, vec3, Fn, vec2, float, fract, dot, cos, sin, cross, mix, step, abs, clamp, int, Loop, If, color } from 'three/tsl';

export class PostProcessingEffect {
    static type = 'post';
    static order = 20;
    static id = 'PostProcessingEffect';
    static getDefaults() {
        return {
            colorCorrectionEnabled: true,
            hue: 0,
            saturation: 1,
            exposure: 0,
            gamma: 1,
            vibrance: 0,
            lift: '#000000',
            gammaColor: '#ffffff',
            gain: '#ffffff'
        };
    }

    constructor(sketch) {
        this.sketch = sketch;
        this.params = sketch.params;
        this.uniforms = {};
    }

    setupUniforms() {
        this.uniforms = {
            uColorCorrectionEnabled: uniform(this.params.colorCorrectionEnabled ? 1 : 0),
            uHue: uniform(this.params.hue),
            uSaturation: uniform(this.params.saturation),
            uExposure: uniform(this.params.exposure),
            uGamma: uniform(this.params.gamma),
            uVibrance: uniform(this.params.vibrance),
            uLift: uniform(color(this.params.lift)),
            uGammaColor: uniform(color(this.params.gammaColor)),
            uGain: uniform(color(this.params.gain)),
            uTime: uniform(0)
        };
        return this.uniforms;
    }

    hueShift = Fn(([col, hue]) => {
        const k = vec3(0.57735);
        const cosAngle = cos(hue);
        const sinAngle = sin(hue);
        return col.mul(cosAngle)
            .add(cross(k, col)
                .mul(sinAngle))
            .add(k.mul(dot(k, col)).mul(float(1.0).sub(cosAngle)));
    });

    applyVibrance = Fn(([col, vibrance]) => {
        const average = col.r.add(col.g).add(col.b).div(3.0);
        const mx = col.r.max(col.g).max(col.b);
        const amt = mx.sub(average).mul(vibrance).mul(-3.0);
        return mix(col, vec3(mx), amt);
    });

    buildColorCorrectionNode(inputColorNode) {
        const {
            uHue, uSaturation, uExposure, uGamma, uVibrance,
            uLift, uGammaColor, uGain
        } = this.uniforms;

        return Fn(() => {
            const color = vec4(inputColorNode).toVar();
            const rgb = color.rgb.toVar();

            rgb.assign(rgb.mul(uExposure.exp2()));
            rgb.assign(rgb.pow(float(1.0).div(uGamma)));

            // Lift / GammaColor / Gain
            rgb.assign(rgb.mul(uGain).add(uLift).max(0.0));
            rgb.assign(rgb.pow(vec3(1.0).div(uGammaColor.rgb)));

            // Hue & Vibrance
            rgb.assign(this.hueShift(rgb, uHue));
            rgb.assign(this.applyVibrance(rgb, uVibrance));

            // Saturation
            const luma = dot(rgb, vec3(0.2126, 0.7152, 0.0722));
            rgb.assign(mix(vec3(luma), rgb, uSaturation));

            return vec4(rgb, color.a);
        })();
    }



    setupGUI(parentFolder) {
        const ccFolder = parentFolder.addFolder('Color Correction');
        ccFolder.add(this.params, 'colorCorrectionEnabled').name('Enabled').onChange(v => {
            this.uniforms.uColorCorrectionEnabled.value = v ? 1 : 0;
            if (this.sketch.updatePostProcessing) this.sketch.updatePostProcessing();
        }).listen();
        ccFolder.add(this.params, 'exposure', -2, 2).name('Exposure').onChange(v => this.uniforms.uExposure.value = v).listen();
        ccFolder.add(this.params, 'gamma', 0.1, 3).name('Gamma').onChange(v => this.uniforms.uGamma.value = v).listen();
        ccFolder.add(this.params, 'vibrance', -1, 1).name('Vibrance').onChange(v => this.uniforms.uVibrance.value = v).listen();

        const cdlFolder = ccFolder.addFolder('Lift / Gamma / Gain');
        cdlFolder.addColor(this.params, 'lift').name('Lift (Shadows)').onChange(v => this.uniforms.uLift.value.set(v)).listen();
        cdlFolder.addColor(this.params, 'gammaColor').name('Gamma (Midtones)').onChange(v => this.uniforms.uGammaColor.value.set(v)).listen();
        cdlFolder.addColor(this.params, 'gain').name('Gain (Highlights)').onChange(v => this.uniforms.uGain.value.set(v)).listen();

        const hslFolder = ccFolder.addFolder('Hue & Saturation');
        hslFolder.add(this.params, 'hue', -Math.PI, Math.PI).name('Hue').onChange(v => this.uniforms.uHue.value = v).listen();
        hslFolder.add(this.params, 'saturation', 0, 4).name('Saturation').onChange(v => this.uniforms.uSaturation.value = v).listen();

        return ccFolder;
    }

    updateUniforms(params) {
        if (this.uniforms.uColorCorrectionEnabled) this.uniforms.uColorCorrectionEnabled.value = params.colorCorrectionEnabled ? 1 : 0;

        if (this.uniforms.uHue) this.uniforms.uHue.value = params.hue;
        if (this.uniforms.uSaturation) this.uniforms.uSaturation.value = params.saturation;
        if (this.uniforms.uExposure) this.uniforms.uExposure.value = params.exposure;
        if (this.uniforms.uGamma) this.uniforms.uGamma.value = params.gamma;
        if (this.uniforms.uVibrance) this.uniforms.uVibrance.value = params.vibrance;
        if (this.uniforms.uLift) this.uniforms.uLift.value.set(params.lift);
        if (this.uniforms.uGammaColor) this.uniforms.uGammaColor.value.set(params.gammaColor);
        if (this.uniforms.uGain) this.uniforms.uGain.value.set(params.gain);
    }
}
