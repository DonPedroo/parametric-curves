import { uniform, vec2, vec3, vec4, Fn, float, mix, step, smoothstep, If, clamp, abs, color, atan, sin, pow, min, sqrt, sign, dot, acos, cos, floor, fract, max } from 'three/tsl';
import * as THREE from 'three/webgpu';

const sdBezier = Fn(([pos, A, B, C]) => {
    const a = B.sub(A);
    const b = A.sub(B.mul(2.0)).add(C);
    const c = a.mul(2.0);
    const d = A.sub(pos);

    // Instead of evaluating mathematically fragile cubic roots that cause NaN squiggles,
    // we use a rock-solid, 5-step unrolled iterative Newton-Raphson solver.
    // This perfectly evaluates "division-by-zero" flat-curve arches without snapping to horizontal lines!
    const K0 = A;
    const K1 = B.sub(A).mul(2.0);
    const K2 = C.sub(B.mul(2.0)).add(A);

    // Initial guess based on X projection onto the horizontal anchor line
    // C.x - A.x is always exactly the arch width, which is > 0
    const t = clamp(pos.x.sub(A.x).div(C.x.sub(A.x).max(0.0001)), 0.0, 1.0).toVar();

    // 2nd derivative of quadratic curve is constant
    const ddpt = K2.mul(2.0);

    // 3 iterations of Newton-Raphson manually unrolled for TSL tracking limits
    for (let i = 0; i < 3; i++) {
        const pt = K0.add(K1.mul(t)).add(K2.mul(t).mul(t));
        const dpt = K1.add(K2.mul(t).mul(2.0));

        const D = pt.sub(pos);
        const f = dot(D, dpt);
        const df = dot(dpt, dpt).add(dot(D, ddpt));

        // abs(df).max(1e-4) gracefully guarantees we never divide by zero even if exactly at evolute center
        t.assign(clamp(t.sub(f.div(abs(df).max(1e-4))), 0.0, 1.0));
    }

    const closestPt = K0.add(K1.mul(t)).add(K2.mul(t).mul(t));
    return sqrt(dot(closestPt.sub(pos), closestPt.sub(pos)));
});

export class ArchesEffect {
    static type = 'standard';
    static order = 40;
    static id = 'ArchesEffect';
    static getDefaults() {
        return {
            archesEnabled: false,
            archesCircular: false,
            archesGroups: 1,
            archesX: 0.5,
            archesY: 0.5,
            archesRotation: 0,
            archesWidth: 0.5,
            archesHeight: 0.3,
            archesCount: 3,
            archesThickness: 0.01,
            archesSpacingPower: 1.0,
            archesColor: '#ffffff',
            archesOpacity: 1.0,
            archesGradualOpacity: false,
            archesRadiateSpeed: 0.0,
            archesWobbleSpeed: 0.0,
            archesWobbleAmp: 0.0,
            archesWobbleFreq: 1.0,
            archesRotationSpeed: 0.0,
            archesBlendMode: 'mix',
            archesShadingEnabled: false,
            archesShadingIntensity: 0.5,
            archesShadingSharpness: 4.0,
            archesShadingAngle: 0.0,
            archesShadingAngleSpeed: 0.0,
            archesShadingColor: '#ffffff',
            archesMouseEnabled: false,
            archesMouseStrength: 0.5,
            archesMouseRadius: 0.3,
            archesMouseSmoothing: 0.5,
            archesMouseFalloffPower: 1.0
        };
    }

    constructor(sketch) {
        this.sketch = sketch;
        this.params = sketch.params;
        this.uniforms = {};
    }

    setupUniforms() {
        this.uniforms = {
            uEnabled: uniform(this.params.archesEnabled ? 1 : 0),
            uCircular: uniform(this.params.archesCircular ? 1 : 0),
            uGroups: uniform(this.params.archesGroups),
            uResolution: this.sketch.uResolution,
            uPos: uniform(vec2(this.params.archesX, this.params.archesY)),
            uWidth: uniform(this.params.archesWidth),
            uHeight: uniform(this.params.archesHeight),
            uCount: uniform(this.params.archesCount),
            uThickness: uniform(this.params.archesThickness),
            uSpacingPower: uniform(this.params.archesSpacingPower),
            uColor: uniform(color(this.params.archesColor)),
            uOpacity: uniform(this.params.archesOpacity),
            uBlendMode: uniform(['mix', 'add', 'screen', 'multiply', 'overlay'].indexOf(this.params.archesBlendMode)),
            uGradualOpacity: uniform(this.params.archesGradualOpacity ? 1 : 0),
            uShadingEnabled: uniform(this.params.archesShadingEnabled ? 1 : 0),
            uShadingIntensity: uniform(this.params.archesShadingIntensity),
            uShadingSharpness: uniform(this.params.archesShadingSharpness),
            uShadingAngle: uniform(this.params.archesShadingAngle),
            uShadingAngleSpeed: uniform(this.params.archesShadingAngleSpeed),
            uShadingColor: uniform(color(this.params.archesShadingColor)),
            uRotation: uniform(this.params.archesRotation),
            uRadiateSpeed: uniform(this.params.archesRadiateSpeed),
            uWobbleSpeed: uniform(this.params.archesWobbleSpeed),
            uWobbleAmp: uniform(this.params.archesWobbleAmp),
            uWobbleFreq: uniform(this.params.archesWobbleFreq),
            uRotationSpeed: uniform(this.params.archesRotationSpeed),
            uMousePos: this.sketch.uMousePos,
            uMouseEnabled: uniform(this.params.archesMouseEnabled ? 1 : 0),
            uMouseStrength: uniform(this.params.archesMouseStrength),
            uMouseRadius: uniform(this.params.archesMouseRadius),
            uMouseFalloffPower: uniform(this.params.archesMouseFalloffPower),
        };

        return this.uniforms;
    }

    buildNode(inputColorNode, uvNode) {
        if (!this.params.archesEnabled) return inputColorNode;
        return this._buildNodeTSL(inputColorNode, uvNode);
    }

    _buildNodeTSL = Fn(([inputColorNode, uvNode]) => {
        const finalColor = inputColorNode.toVar();
        const u = this.uniforms;

        If(u.uEnabled.equal(1), () => {
            const screenAspect = u.uResolution.x.div(u.uResolution.y);

            const aspectCorrectedUv = uvNode.toVar();
            aspectCorrectedUv.x.assign(aspectCorrectedUv.x.mul(screenAspect));

            If(u.uMouseEnabled.equal(1), () => {
                const correctedMousePos = u.uMousePos.toVar();
                correctedMousePos.x.assign(correctedMousePos.x.mul(screenAspect));

                const distToMouse = aspectCorrectedUv.distance(correctedMousePos);
                const mouseFalloff = smoothstep(u.uMouseRadius, 0.0, distToMouse).pow(u.uMouseFalloffPower);
                
                // Displace UVs towards the mouse (magnet effect)
                const displacement = correctedMousePos.sub(aspectCorrectedUv).mul(u.uMouseStrength).mul(mouseFalloff);
                aspectCorrectedUv.subAssign(displacement);
            });

            const correctedPos = u.uPos.toVar();
            correctedPos.x.assign(correctedPos.x.mul(screenAspect));

            // To map visual standard width to aspect-corrected width
            const w_total = u.uWidth.mul(screenAspect);
            const h = u.uHeight;

            // Rotate UVs in the opposite direction
            const centeredUv = aspectCorrectedUv.sub(correctedPos);
            const rotAngle = u.uRotation.add(this.sketch.uGlobalTime.mul(u.uRotationSpeed));
            const rotCos = cos(rotAngle.negate());
            const rotSin = sin(rotAngle.negate());
            const rotatedUv = vec2(
                centeredUv.x.mul(rotCos).sub(centeredUv.y.mul(rotSin)),
                centeredUv.x.mul(rotSin).add(centeredUv.y.mul(rotCos))
            ).add(correctedPos);

            const pxBase = rotatedUv.x.sub(correctedPos.x);
            const pyBase = rotatedUv.y.sub(correctedPos.y);

            const isCircular = u.uCircular.equal(1);
            const uGroups = u.uGroups.max(1.0);

            const W = w_total.div(2.0);

            // Polar math for Circular mode
            // Radius is W (half the width)
            const polarRadius = sqrt(pxBase.mul(pxBase).add(pyBase.mul(pyBase)));
            const polarAngle = atan(pyBase, pxBase);
            const anglePerGroup = float(Math.PI * 2).div(uGroups);

            // Offset angle so group 0 is centered on the X axis
            const shiftedAngle = polarAngle.add(anglePerGroup.div(2.0));
            // Wrap angle from 0 to 2PI
            const wrappedAngle = shiftedAngle.sub(floor(shiftedAngle.div(Math.PI * 2)).mul(Math.PI * 2));

            const groupFloatPolar = wrappedAngle.div(anglePerGroup);
            const groupIndexPolar = clamp(floor(groupFloatPolar), 0.0, uGroups.sub(1.0));
            const angleLocal = wrappedAngle.sub(groupIndexPolar.mul(anglePerGroup)).sub(anglePerGroup.div(2.0));

            // Flatten the coordinate system around the perimeter of the circle
            // X becomes the arc length, Y becomes the distance from circumference
            const arcLengthXY = angleLocal.mul(W);
            const pyPolar = polarRadius.sub(W);

            const groupCenterX_Polar = 0.0; // Local center is 0
            const localW_Polar = anglePerGroup.mul(W).div(2.0); // W mapped to arc length

            // Linear math
            const w_group = w_total.div(uGroups);
            const localW_Linear = w_group.div(2.0);

            const px_shifted = pxBase.add(w_total.div(2.0));
            const groupFloatLinear = px_shifted.div(w_group);
            const groupIndexLinear = clamp(floor(groupFloatLinear), 0.0, uGroups.sub(1.0));

            const groupCenterX_Linear = groupIndexLinear.mul(w_group).add(localW_Linear).sub(w_total.div(2.0));
            const localPx_Linear = pxBase.sub(groupCenterX_Linear);

            // Route Math based on checkbox
            const groupIndex = isCircular.select(groupIndexPolar, groupIndexLinear);
            const localPx = isCircular.select(arcLengthXY, localPx_Linear);
            const pyBaseRouted = isCircular.select(pyPolar, pyBase);
            const localW = isCircular.select(localW_Polar, localW_Linear);
            const groupCenterX = isCircular.select(0.0, groupCenterX_Linear); // Polar centers at local 0

            const isOdd = groupIndex.sub(floor(groupIndex.div(2.0)).mul(2.0));
            const signY = float(1.0).sub(isOdd.mul(2.0)); // 1 or -1

            const py = pyBaseRouted.mul(signY);

            const pxRatio = localPx.div(localW);
            const denom = float(1.0).sub(pxRatio.mul(pxRatio)).max(0.001);
            const y_req = py.div(denom);

            // y_req / h = 1 - prog^p -> prog^p = 1 - y_req / h
            const v = clamp(float(1.0).sub(y_req.div(h)), 0.0, 1.0);

            // To prevent NaN from pow(0, power), we add an epsilon to v if power < 1, 
            // but TSL usually handles pow() safely. Adding a tiny epsilon to v just in case.
            const prog_c = pow(v.add(0.00001), float(1.0).div(u.uSpacingPower));

            const isRadiating = abs(u.uRadiateSpeed).greaterThan(0.001);
            const isWobbling = abs(u.uWobbleAmp).greaterThan(0.001);

            // To find which arch index actually passes through this pixel after animations are applied,
            // we must invert the oscillation function. We use 5-step damped fixed-point iteration.
            const p_true = prog_c.toVar();

            for (let i = 0; i < 5; i++) {
                const envelope = sin(p_true.mul(Math.PI));
                const radiatePhase = this.sketch.uGlobalTime.mul(u.uRadiateSpeed).mul(Math.PI * 2.0).add(p_true.mul(Math.PI));
                const radOsc = isRadiating.select(sin(radiatePhase).mul(0.25).mul(envelope), 0.0);

                const wobbleTime = this.sketch.uGlobalTime.mul(u.uWobbleSpeed);
                const wobblePhase = p_true.mul(u.uCount).mul(u.uWobbleFreq).add(wobbleTime);
                const wobOsc = isWobbling.select(sin(wobblePhase).mul(u.uWobbleAmp.mul(0.5)).mul(envelope), 0.0);

                const targetP = clamp(prog_c.sub(radOsc.add(wobOsc)), 0.0, 1.0);
                p_true.assign(mix(p_true, targetP, 0.6));
            }

            const maxFloatIdx = u.uCount.sub(0.001).max(0.0);
            const baseFloatCoord = clamp(p_true.mul(u.uCount), 0.0, maxFloatIdx);

            const idx0Raw = floor(baseFloatCoord);

            // Expand the evaluation window to 4 nearest arches to prevent fast wobbles from crossing beyond the search distance 
            // and disappearing (clipping) when there are many dense arches!
            const idxM1 = max(idx0Raw.sub(1.0), 0.0);
            const idx0 = idx0Raw;
            const idx1 = min(idx0Raw.add(1.0), u.uCount.sub(1.0).max(0.0));
            const idx2 = min(idx0Raw.add(2.0), u.uCount.sub(1.0).max(0.0));

            const posLocal = vec2(localPx.add(groupCenterX), pyBaseRouted);

            // Evaluates the curve based on the continuous floating index
            const evalCurve = (idxRaw) => {
                // prog is strictly bound to spatial geometry index, leaving bases stationary
                const rawProg = idxRaw.div(u.uCount.max(1.0));

                // Envelope perfectly anchors the inner-most and outer-most arches so they never cross bounds and hit clamp limits
                const envelope = sin(rawProg.mul(Math.PI));

                // Animate the progression scaling continuously up and down
                const radiatePhase = this.sketch.uGlobalTime.mul(u.uRadiateSpeed).mul(Math.PI * 2.0).add(rawProg.mul(Math.PI));
                const radiateOscillation = sin(radiatePhase).mul(0.25).mul(envelope);
                const flowProg = isRadiating.select(rawProg.add(radiateOscillation), rawProg);

                // Re-route wobble to modulate progression (so it perfectly anchors) rather than linearly shifting world height
                const wobbleTime = this.sketch.uGlobalTime.mul(u.uWobbleSpeed);
                const wobblePhase = idxRaw.mul(u.uWobbleFreq).add(wobbleTime);
                // Reduce multiplier for better visual scaling vs old world units
                const wobbleOscillation = isWobbling.select(sin(wobblePhase).mul(u.uWobbleAmp.mul(0.5)).mul(envelope), 0.0);

                const finalProg = clamp(flowProg.add(wobbleOscillation), 0.0, 1.0);
                const adjustedProg = pow(finalProg, u.uSpacingPower);

                let controlDistY = h.mul(float(2.0)).mul(float(1.0).sub(adjustedProg));
                controlDistY = controlDistY.mul(signY);

                const A_pt = vec2(groupCenterX.sub(localW), 0.0);
                const C_pt = vec2(groupCenterX.add(localW), 0.0);
                const B_pt = vec2(groupCenterX, controlDistY);

                return sdBezier(posLocal, A_pt, B_pt, C_pt);
            };

            const dist0 = evalCurve(idx0);
            const dist1 = evalCurve(idx1);

            const minDist = dist0.toVar();
            minDist.assign(min(minDist, dist1));

            If(isWobbling, () => {
                const distM1 = evalCurve(idxM1);
                const dist2 = evalCurve(idx2);
                minDist.assign(min(minDist, min(distM1, dist2)));
            });

            // Using the base spatial guess for the smooth fade allows it to remain a unified gradient
            // without flickering when crossing arches trade positions over the min distance arg.
            const gradualFade = idx0Raw.div(u.uCount.sub(1.0).max(1.0));
            const archOpacity = u.uGradualOpacity.equal(1).select(gradualFade, float(1.0));

            const halfThickness = u.uThickness.div(2.0);
            const aa = float(1.5).div(u.uResolution.y);
            // No custom mask here to simplify
            const finalAlpha = float(1.0).sub(smoothstep(halfThickness, halfThickness.add(aa), minDist)).mul(u.uOpacity).mul(archOpacity);

            // Geometric Shading ("Vinyl/CD" reflection) - re-used from Rings Math
            const ringColorOutput = u.uColor.toVar();

            If(u.uShadingEnabled.equal(1), () => {
                const dir = rotatedUv.sub(correctedPos);
                const angle = atan(dir.y, dir.x);
                const animatedAngle = u.uShadingAngle.add(this.sketch.uGlobalTime.mul(u.uShadingAngleSpeed));
                const reflectionT = sin(angle.mul(2.0).add(animatedAngle));
                const normalizedT = reflectionT.mul(0.5).add(0.5);
                const specularPower = pow(normalizedT, u.uShadingSharpness);
                const shine = specularPower.mul(u.uShadingIntensity);

                ringColorOutput.assign(
                    clamp(ringColorOutput.add(u.uShadingColor.mul(shine)), 0.0, 1.0)
                );
            });

            // Blend Modes
            const isAdd = u.uBlendMode.equal(1);
            const isScreen = u.uBlendMode.equal(2);
            const isMultiply = u.uBlendMode.equal(3);
            const isOverlay = u.uBlendMode.equal(4);

            const baseColor = finalColor.rgb;
            const c = ringColorOutput;

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
                finalAlpha
            );

            finalColor.assign(vec4(blendedCol, finalColor.a));
        });

        return finalColor;
    });

    setupGUI(parentFolder) {
        const folder = parentFolder.addFolder('Arches Effect');
        const p = this.params;
        const u = this.uniforms;

        // Fallbacks for dirty or old local storage states
        if (p.archesEnabled === undefined) p.archesEnabled = false;
        if (p.archesX === undefined) p.archesX = 0.5;
        if (p.archesY === undefined) p.archesY = 0.5;
        if (p.archesRotation === undefined) p.archesRotation = 0.0;
        if (p.archesWidth === undefined) p.archesWidth = 0.5;
        if (p.archesHeight === undefined) p.archesHeight = 0.3;
        if (p.archesCount === undefined) p.archesCount = 3;
        if (p.archesGradualOpacity === undefined) p.archesGradualOpacity = false;
        if (p.archesThickness === undefined) p.archesThickness = 0.01;
        if (p.archesSpacingPower === undefined) p.archesSpacingPower = 1.0;
        if (p.archesColor === undefined) p.archesColor = '#ffffff';
        if (p.archesOpacity === undefined) p.archesOpacity = 1.0;
        if (p.archesBlendMode === undefined) p.archesBlendMode = 'mix';
        if (p.archesShadingEnabled === undefined) p.archesShadingEnabled = false;
        if (p.archesShadingIntensity === undefined) p.archesShadingIntensity = 0.5;
        if (p.archesShadingSharpness === undefined) p.archesShadingSharpness = 4.0;
        if (p.archesShadingAngle === undefined) p.archesShadingAngle = 0.0;
        if (p.archesShadingAngleSpeed === undefined) p.archesShadingAngleSpeed = 0.0;
        if (p.archesShadingColor === undefined) p.archesShadingColor = '#ffffff';

        folder.add(p, 'archesEnabled').name('Enabled').onChange(v => {
            u.uEnabled.value = v ? 1 : 0;
            if (this.sketch.updatePostProcessing) this.sketch.updatePostProcessing();
        }).listen();

        if (p.archesCircular === undefined) p.archesCircular = false;
        folder.add(p, 'archesCircular').name('Circular').onChange(v => {
            u.uCircular.value = v ? 1 : 0;
            if (this.sketch.updatePostProcessing) this.sketch.updatePostProcessing();
        }).listen();

        if (p.archesGroups === undefined) p.archesGroups = 1;
        folder.add(p, 'archesGroups', 1, 20, 1).name('Groups').onChange(v => {
            u.uGroups.value = v;
            if (this.sketch.updatePostProcessing) this.sketch.updatePostProcessing();
        }).listen();

        folder.add(p, 'archesX', -1, 2).name('Pos X').onChange(v => u.uPos.value.x = v).listen();
        folder.add(p, 'archesY', -1, 2).name('Pos Y').onChange(v => u.uPos.value.y = v).listen();
        folder.add(p, 'archesRotation', -Math.PI, Math.PI).name('Rotation').onChange(v => u.uRotation.value = v).listen();

        folder.add(p, 'archesWidth', 0.01, 2).name('Width').onChange(v => u.uWidth.value = v).listen();
        folder.add(p, 'archesHeight', -2, 2).name('Height').onChange(v => u.uHeight.value = v).listen();
        folder.add(p, 'archesCount', 1, 100, 1).name('Arches Count').onChange(v => u.uCount.value = v).listen();
        folder.add(p, 'archesThickness', 0.0001, 0.1, 0.0001).name('Thickness').onChange(v => u.uThickness.value = v).listen();
        folder.add(p, 'archesSpacingPower', 0.1, 5).name('Spacing Curve').onChange(v => u.uSpacingPower.value = v).listen();

        folder.addColor(p, 'archesColor').name('Color').onChange(v => u.uColor.value.set(v)).listen();
        folder.add(p, 'archesOpacity', 0, 1).name('Opacity').onChange(v => u.uOpacity.value = v).listen();
        folder.add(p, 'archesGradualOpacity').name('Gradual Opacity').onChange(v => {
            u.uGradualOpacity.value = v ? 1 : 0;
            if (this.sketch.updatePostProcessing) this.sketch.updatePostProcessing();
        }).listen();

        const animFolder = folder.addFolder('Animation');

        if (p.archesRadiateSpeed === undefined) p.archesRadiateSpeed = 0.0;
        animFolder.add(p, 'archesRadiateSpeed', -5, 5).name('Radiate Speed').onChange(v => {
            if (this.sketch.updateAnimationSpeeds) this.sketch.updateAnimationSpeeds();
        }).listen();

        if (p.archesWobbleSpeed === undefined) p.archesWobbleSpeed = 0.0;
        animFolder.add(p, 'archesWobbleSpeed', -10, 10).name('Wobble Speed').onChange(v => {
            if (this.sketch.updateAnimationSpeeds) this.sketch.updateAnimationSpeeds();
        }).listen();

        if (p.archesWobbleAmp === undefined) p.archesWobbleAmp = 0.0;
        animFolder.add(p, 'archesWobbleAmp', 0, 1).name('Wobble Amp').onChange(v => u.uWobbleAmp.value = v).listen();

        if (p.archesWobbleFreq === undefined) p.archesWobbleFreq = 1.0;
        animFolder.add(p, 'archesWobbleFreq', 0, 10).name('Wobble Freq').onChange(v => u.uWobbleFreq.value = v).listen();

        if (p.archesRotationSpeed === undefined) p.archesRotationSpeed = 0.0;
        animFolder.add(p, 'archesRotationSpeed', -5, 5).name('Rotation Speed').onChange(v => {
            if (this.sketch.updateAnimationSpeeds) this.sketch.updateAnimationSpeeds();
        }).listen();

        const blendModes = ['mix', 'add', 'screen', 'multiply', 'overlay'];
        if (p.archesBlendMode === undefined) p.archesBlendMode = 'mix';
        folder.add(p, 'archesBlendMode', blendModes).name('Blend Mode').onChange(v => u.uBlendMode.value = blendModes.indexOf(v)).listen();

        folder.add(p, 'archesShadingEnabled').name('CD Shading').onChange(v => {
            u.uShadingEnabled.value = v ? 1 : 0;
            if (this.sketch.updatePostProcessing) this.sketch.updatePostProcessing();
        }).listen();
        folder.addColor(p, 'archesShadingColor').name('Shine Color').onChange(v => u.uShadingColor.value.set(v)).listen();
        folder.add(p, 'archesShadingIntensity', 0, 2).name('Shine Intensity').onChange(v => u.uShadingIntensity.value = v).listen();
        folder.add(p, 'archesShadingSharpness', 0.5, 20).name('Shine Sharpness').onChange(v => u.uShadingSharpness.value = v).listen();
        folder.add(p, 'archesShadingAngle', -Math.PI, Math.PI).name('Shine Angle').onChange(v => u.uShadingAngle.value = v).listen();
        folder.add(p, 'archesShadingAngleSpeed', -10, 10).name('Shine Speed').onChange(v => {
            if (this.sketch.updateAnimationSpeeds) this.sketch.updateAnimationSpeeds();
        }).listen();

        const mouseFolder = folder.addFolder('Mouse Interaction');
        if (p.archesMouseEnabled === undefined) p.archesMouseEnabled = false;
        if (p.archesMouseStrength === undefined) p.archesMouseStrength = 0.5;
        if (p.archesMouseRadius === undefined) p.archesMouseRadius = 0.3;
        if (p.archesMouseSmoothing === undefined) p.archesMouseSmoothing = 0.5;
        if (p.archesMouseFalloffPower === undefined) p.archesMouseFalloffPower = 1.0;

        mouseFolder.add(p, 'archesMouseEnabled').name('Enabled').onChange(v => {
            u.uMouseEnabled.value = v ? 1 : 0;
            if (this.sketch.updatePostProcessing) this.sketch.updatePostProcessing();
        }).listen();
        mouseFolder.add(p, 'archesMouseStrength', -1, 1).name('Strength').onChange(v => u.uMouseStrength.value = v).listen();
        mouseFolder.add(p, 'archesMouseRadius', 0.01, 1.0).name('Radius').onChange(v => u.uMouseRadius.value = v).listen();
        mouseFolder.add(p, 'archesMouseFalloffPower', 0.1, 5.0).name('Falloff Shape').onChange(v => u.uMouseFalloffPower.value = v).listen();
        mouseFolder.add(p, 'archesMouseSmoothing', 0, 0.99).name('Momentum').listen();

        return folder;
    }

    refreshArchesGUI() {
        // Obsolete in flat logic, maintained for duck-typing backward compatibility if needed in index.js
    }

    updateUniforms(params) {
        this.uniforms.uEnabled.value = params.archesEnabled ? 1 : 0;
        this.uniforms.uCircular.value = params.archesCircular ? 1 : 0;
        this.uniforms.uGroups.value = params.archesGroups;
        this.uniforms.uPos.value.set(params.archesX, params.archesY);
        this.uniforms.uWidth.value = params.archesWidth;
        this.uniforms.uHeight.value = params.archesHeight;
        this.uniforms.uCount.value = params.archesCount;
        this.uniforms.uGradualOpacity.value = params.archesGradualOpacity ? 1 : 0;
        this.uniforms.uThickness.value = params.archesThickness;
        this.uniforms.uSpacingPower.value = params.archesSpacingPower;
        this.uniforms.uColor.value.set(params.archesColor);
        this.uniforms.uOpacity.value = params.archesOpacity;
        const blendModes = ['mix', 'add', 'screen', 'multiply', 'overlay'];
        this.uniforms.uBlendMode.value = blendModes.indexOf(params.archesBlendMode);
        this.uniforms.uShadingEnabled.value = params.archesShadingEnabled ? 1 : 0;
        this.uniforms.uShadingColor.value.set(params.archesShadingColor);
        this.uniforms.uShadingIntensity.value = params.archesShadingIntensity;
        this.uniforms.uShadingSharpness.value = params.archesShadingSharpness;
        this.uniforms.uShadingAngle.value = params.archesShadingAngle;
        this.uniforms.uShadingAngleSpeed.value = params.archesShadingAngleSpeed;

        this.uniforms.uRadiateSpeed.value = params.archesRadiateSpeed;
        this.uniforms.uWobbleSpeed.value = params.archesWobbleSpeed;
        this.uniforms.uWobbleAmp.value = params.archesWobbleAmp;
        this.uniforms.uWobbleFreq.value = params.archesWobbleFreq;
        this.uniforms.uRotationSpeed.value = params.archesRotationSpeed;
        this.uniforms.uRotation.value = params.archesRotation;

        this.uniforms.uMouseEnabled.value = params.archesMouseEnabled ? 1 : 0;
        this.uniforms.uMouseStrength.value = params.archesMouseStrength;
        this.uniforms.uMouseRadius.value = params.archesMouseRadius;
        this.uniforms.uMouseFalloffPower.value = params.archesMouseFalloffPower;
    }

    updateSpeeds(isPerfectLoop, duration, quantizeFn) {
        const p = this.params;
        const u = this.uniforms;
        if (p.archesEnabled === undefined) return;

        if (u.uRadiateSpeed) {
            u.uRadiateSpeed.value = isPerfectLoop
                ? quantizeFn(p.archesRadiateSpeed || 0, duration)
                : (p.archesRadiateSpeed || 0);
        }
        if (u.uWobbleSpeed) {
            u.uWobbleSpeed.value = isPerfectLoop
                ? quantizeFn(p.archesWobbleSpeed || 0, duration)
                : (p.archesWobbleSpeed || 0);
        }
        if (u.uRotationSpeed) {
            u.uRotationSpeed.value = isPerfectLoop
                ? quantizeFn(p.archesRotationSpeed || 0, duration)
                : (p.archesRotationSpeed || 0);
        }
        if (u.uShadingAngleSpeed) {
            u.uShadingAngleSpeed.value = isPerfectLoop
                ? quantizeFn(p.archesShadingAngleSpeed || 0, duration)
                : (p.archesShadingAngleSpeed || 0);
        }
    }
}
