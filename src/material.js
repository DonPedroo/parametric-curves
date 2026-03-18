import { Fn, uv, time, sin, cos, vec2, smoothstep, vec4 } from 'three/tsl';
import { getGradientColorNode } from './effects/gradient.js';

export const createMainMaterial = (uniforms, params) => {
    const {
        uResolution,
        uAnimationSpeed,
        uDistortionFrequency,
        uDistortionAmplitude,
        uCenter,
        uGlobalTime
    } = uniforms;

    return Fn(() => {
        const vUv = uv();
        const aspect = uResolution.x.div(uResolution.y);
        const uvAspect = vUv.mul(vec2(aspect, 1.0));
        const centerAspect = uCenter.mul(vec2(aspect, 1.0));

        // Animation time scaled globally based on the deterministic clock
        const t_timeX = uGlobalTime.mul(uAnimationSpeed.x);
        const t_timeY = uGlobalTime.mul(uAnimationSpeed.y);

        // Edge Distortion logic
        const distortion = vec2(
            sin(vUv.y.mul(uDistortionFrequency).add(t_timeX)),
            cos(vUv.x.mul(uDistortionFrequency).sub(t_timeY))
        ).mul(uDistortionAmplitude);

        const distToCenter = uvAspect.distance(centerAspect);
        const distortionWeight = smoothstep(0.0, 0.5, distToCenter);

        const distortedUv = vUv.add(distortion.mul(distortionWeight));

        // Background Gradient using reusable effect
        const finalColor = getGradientColorNode(distortedUv, uniforms, params);

        return vec4(finalColor, 1.0);
    });
};
