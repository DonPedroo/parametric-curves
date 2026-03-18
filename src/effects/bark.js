import { uniform, vec2, vec3, vec4, Fn, float, mix, step, smoothstep, If, clamp, abs, color, atan, sin, cos, floor, fract, dot, max, fwidth, pow, length } from 'three/tsl';
import * as THREE from 'three/webgpu';

const hash = Fn(([p_in]) => {
    let p = fract(p_in.mul(vec2(123.34, 456.21))).toVar();
    p.addAssign(dot(p, p.add(45.32)));
    return fract(p.x.mul(p.y));
});

const noise = Fn(([p_in]) => {
    const i = floor(p_in);
    let f = fract(p_in).toVar();
    f.assign(f.mul(f).mul(vec2(3.0).sub(f.mul(2.0))));

    const a = hash(i);
    const b = hash(i.add(vec2(1.0, 0.0)));
    const c = hash(i.add(vec2(0.0, 1.0)));
    const d = hash(i.add(vec2(1.0, 1.0)));

    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
});

const fbm = Fn(([p_in]) => {
    let value = float(0.0).toVar();
    let amplitude = float(0.5).toVar();
    let frequency = float(1.0).toVar();
    let p = vec2(p_in).toVar();

    for (let i = 0; i < 3; i++) {
        value.addAssign(amplitude.mul(noise(p.mul(frequency))));
        p.mulAssign(2.0);
        amplitude.mulAssign(0.5);
    }
    return value;
});

export class BarkEffect {
    static type = 'standard';
    static order = 60;
    constructor(sketch) {
        this.sketch = sketch;
        this.params = sketch.params;
        this.uniforms = {};
    }

    static getDefaults() {
        return {
            barkEnabled: false,
            barkX: 0.5,
            barkY: 0.5,
            barkZoom: 1.5,
            barkSpacing: 0.045,
            barkSpacingExp: 0.0,
            barkLineWidth: 1.2,
            barkWarpStrength: 0.25,
            barkWarpFreq: 2.5,
            barkFieldFreq: 3.5,
            barkStrength: 0.12,
            barkRingCount: 15.0,
            barkSeed: 42.0,
            barkColor: '#ffffff',
            barkOpacity: 1.0,
            barkBlendMode: 'overlay',
            barkTimeSpeed: 0.1
        };
    }

    setupUniforms() {
        this.uniforms = {
            uResolution: this.sketch.uResolution,
            uBarkCenter: uniform(vec2(this.params.barkX, this.params.barkY)),
            uZoom: uniform(this.params.barkZoom),
            uSpacing: uniform(this.params.barkSpacing),
            uSpacingExp: uniform(this.params.barkSpacingExp),
            uLineWidthPx: uniform(this.params.barkLineWidth),
            uWarpStrength: uniform(this.params.barkWarpStrength),
            uWarpFreq: uniform(this.params.barkWarpFreq),
            uFieldFreq: uniform(this.params.barkFieldFreq),
            uBarkStrength: uniform(this.params.barkStrength),
            uRingCount: uniform(this.params.barkRingCount),
            uSeed: uniform(this.params.barkSeed),
            uColor: uniform(color(this.params.barkColor)),
            uOpacity: uniform(this.params.barkOpacity),
            uBlendMode: uniform(['mix', 'add', 'screen', 'multiply', 'overlay'].indexOf(this.params.barkBlendMode)),
            uTimeSpeed: uniform(this.params.barkTimeSpeed)
        };

        return this.uniforms;
    }

    buildNode(inputColorNode, uvNode) {
        if (!this.params.barkEnabled) return inputColorNode;
        return this._buildNodeTSL(inputColorNode, uvNode);
    }

    _buildNodeTSL = Fn(([inputColorNode, uvNode]) => {
        const finalColor = inputColorNode.toVar();
        const u = this.uniforms;

        const aspect = u.uResolution.y.greaterThan(0.0).select(u.uResolution.x.div(u.uResolution.y), 1.0);

        let p = uvNode.sub(u.uBarkCenter).mul(2.0).toVar();
        p.x.mulAssign(aspect);
        p.mulAssign(u.uZoom);

        const pSeed = p.add(vec2(u.uSeed.mul(1.5), u.uSeed.mul(-1.2)));

        const timeOff = this.sketch.uGlobalTime.mul(u.uTimeSpeed).toVar();

        const pw = p.toVar();
        If(u.uWarpStrength.greaterThan(0.0), () => {
            const w = vec2(
                fbm(pSeed.mul(u.uWarpFreq).add(vec2(13.1, 7.7)).add(timeOff.mul(0.5))),
                fbm(pSeed.mul(u.uWarpFreq).add(vec2(5.2, 19.3)).add(timeOff.mul(0.5)))
            ).sub(0.5).mul(2.0);
            pw.addAssign(w.mul(u.uWarpStrength));
        });

        let d = length(pw).toVar();
        If(u.uBarkStrength.greaterThan(0.0), () => {
            const drift = fbm(pSeed.mul(u.uFieldFreq).add(timeOff)).sub(0.5).mul(2.0).mul(u.uBarkStrength);
            d.addAssign(drift);
        });

        const expo = float(1.0).add(u.uSpacingExp.mul(2.0));
        const dExp = pow(max(d, 0.0), expo);

        const t = dExp.div(u.uSpacing);
        const f = abs(fract(t).sub(0.5));

        const unitPerPixel = fwidth(t);
        const halfWidth = u.uLineWidthPx.mul(unitPerPixel).mul(0.5);
        const aa = unitPerPixel.mul(1.0);

        let line = float(1.0).sub(smoothstep(halfWidth, halfWidth.add(aa), f)).toVar();

        const ringMask = step(t, u.uRingCount);
        line.mulAssign(ringMask);

        // Opacity
        line.mulAssign(u.uOpacity);

        const isAdd = u.uBlendMode.equal(1);
        const isScreen = u.uBlendMode.equal(2);
        const isMultiply = u.uBlendMode.equal(3);
        const isOverlay = u.uBlendMode.equal(4);

        const baseColor = finalColor.rgb;
        const c = u.uColor.rgb;

        const cAdd = baseColor.add(c);
        const cScreen = vec3(1.0).sub(vec3(1.0).sub(baseColor).mul(vec3(1.0).sub(c)));
        const cMultiply = baseColor.mul(c);
        const cOverlay = mix(
            baseColor.mul(c).mul(2.0),
            vec3(1.0).sub(vec3(1.0).sub(baseColor).mul(vec3(1.0).sub(c)).mul(2.0)),
            step(0.5, baseColor)
        );

        const blendResult = isAdd.select(
            cAdd,
            isScreen.select(
                cScreen,
                isMultiply.select(
                    cMultiply,
                    isOverlay.select(
                        cOverlay,
                        c
                    )
                )
            )
        );

        const blendedCol = mix(
            baseColor,
            blendResult,
            line
        );

        finalColor.assign(vec4(blendedCol, finalColor.a));

        return finalColor;
    });

    setupGUI(parentFolder) {
        const folder = parentFolder.addFolder('Bark / Topography Effect');
        const p = this.params;
        const u = this.uniforms;

        folder.add(p, 'barkEnabled').name('Enabled').onChange(v => {
            if (this.sketch.updatePostProcessing) this.sketch.updatePostProcessing();
        }).listen();

        folder.add(p, 'barkX', -1, 2).name('Pos X').onChange(v => u.uBarkCenter.value.x = v).listen();
        folder.add(p, 'barkY', -1, 2).name('Pos Y').onChange(v => u.uBarkCenter.value.y = v).listen();
        folder.add(p, 'barkZoom', 0.1, 10).name('Zoom').onChange(v => u.uZoom.value = v).listen();
        folder.add(p, 'barkSpacing', 0.001, 0.5).name('Spacing').onChange(v => u.uSpacing.value = v).listen();
        folder.add(p, 'barkSpacingExp', 0.0, 2.0).name('Spacing Curve').onChange(v => u.uSpacingExp.value = v).listen();
        folder.add(p, 'barkLineWidth', 0.1, 10.0).name('Line Width (px)').onChange(v => u.uLineWidthPx.value = v).listen();

        const warpFolder = folder.addFolder('Warping');
        warpFolder.add(p, 'barkWarpStrength', 0.0, 2.0).name('Warp Strength').onChange(v => u.uWarpStrength.value = v).listen();
        warpFolder.add(p, 'barkWarpFreq', 0.1, 10.0).name('Warp Freq').onChange(v => u.uWarpFreq.value = v).listen();
        warpFolder.add(p, 'barkFieldFreq', 0.1, 15.0).name('Field Freq').onChange(v => u.uFieldFreq.value = v).listen();
        warpFolder.add(p, 'barkStrength', 0.0, 1.0).name('Noise Strength').onChange(v => u.uBarkStrength.value = v).listen();

        folder.add(p, 'barkRingCount', 1.0, 100.0).name('Ring Count').onChange(v => u.uRingCount.value = v).listen();
        folder.add(p, 'barkSeed', 0.0, 1000.0).name('Random Seed').onChange(v => u.uSeed.value = v).listen();

        folder.addColor(p, 'barkColor').name('Color').onChange(v => u.uColor.value.set(v)).listen();
        folder.add(p, 'barkOpacity', 0.0, 1.0).name('Opacity').onChange(v => u.uOpacity.value = v).listen();

        const blendModes = ['mix', 'add', 'screen', 'multiply', 'overlay'];
        folder.add(p, 'barkBlendMode', blendModes).name('Blend Mode').onChange(v => u.uBlendMode.value = blendModes.indexOf(v)).listen();

        const animFolder = folder.addFolder('Animation');
        animFolder.add(p, 'barkTimeSpeed', -2.0, 2.0).name('Time Speed').onChange(() => {
            if (this.sketch.updateAnimationSpeeds) this.sketch.updateAnimationSpeeds();
        }).listen();

        return folder;
    }

    refreshBarkGUI() {
        // Obsolete in flat logic, maintained for duck-typing backward compatibility if needed in index.js
    }

    updateUniforms(params) {
        this.uniforms.uBarkCenter.value.set(params.barkX, params.barkY);
        this.uniforms.uZoom.value = params.barkZoom;
        this.uniforms.uSpacing.value = params.barkSpacing;
        this.uniforms.uSpacingExp.value = params.barkSpacingExp;
        this.uniforms.uLineWidthPx.value = params.barkLineWidth;
        this.uniforms.uWarpStrength.value = params.barkWarpStrength;
        this.uniforms.uWarpFreq.value = params.barkWarpFreq;
        this.uniforms.uFieldFreq.value = params.barkFieldFreq;
        this.uniforms.uBarkStrength.value = params.barkStrength;
        this.uniforms.uRingCount.value = params.barkRingCount;
        this.uniforms.uSeed.value = params.barkSeed;
        this.uniforms.uColor.value.set(params.barkColor);
        this.uniforms.uOpacity.value = params.barkOpacity;
        const blendModes = ['mix', 'add', 'screen', 'multiply', 'overlay'];
        this.uniforms.uBlendMode.value = blendModes.indexOf(params.barkBlendMode);
    }

    updateSpeeds(isPerfectLoop, duration, quantizeFn) {
        const p = this.params;
        const u = this.uniforms;
        if (p.barkEnabled === undefined) return;

        if (u.uTimeSpeed) {
            u.uTimeSpeed.value = isPerfectLoop
                ? quantizeFn(p.barkTimeSpeed || 0, duration)
                : (p.barkTimeSpeed || 0);
        }
    }
}
