import { uniform, vec2, Fn, float, step, abs, length, clamp, int, If, sin, cos } from 'three/tsl';

/**
 * Reusable Masking Component
 * Extracts the Masking logic (Linear, 3-Way Linear, Radial) for reuse across effects.
 */
export class MaskEffect {
    static getDefaults(prefix = 'mask') {
        return {
            [`${prefix}Masked`]: false,
            [`${prefix}MaskType`]: 'Linear',
            [`${prefix}MaskCenter`]: 0.5,
            [`${prefix}MaskSpread`]: 0.2,
            [`${prefix}MaskRotation`]: 0.0,
            [`${prefix}Mask3WayCenter`]: 0.5,
            [`${prefix}Mask3WaySpread`]: 0.2,
            [`${prefix}MaskRadialCenterX`]: 0.5,
            [`${prefix}MaskRadialCenterY`]: 0.5,
            [`${prefix}MaskRadialRadiusX`]: 0.5,
            [`${prefix}MaskRadialRadiusY`]: 0.5,
            [`${prefix}MaskRadialSoftness`]: 0.2,
            [`${prefix}MaskInvert`]: false
        };
    }

    constructor(sketch, prefix = 'mask') {
        this.sketch = sketch;
        this.prefix = prefix;
        this.uniforms = {};
    }

    _getParam(params, key, defaultValue) {
        const fullKey = this.prefix + key;
        return params[fullKey] !== undefined ? params[fullKey] : defaultValue;
    }

    setupUniforms(params) {
        Object.assign(this.uniforms, {
            uMasked: uniform(this._getParam(params, 'Masked', false) ? 1 : 0),
            uMaskType: uniform(int(['Linear', '3-Way Linear', 'Radial'].indexOf(this._getParam(params, 'MaskType', 'Linear')))),
            uMaskCenter: uniform(this._getParam(params, 'MaskCenter', 0.5)),
            uMaskSpread: uniform(this._getParam(params, 'MaskSpread', 0.2)),
            uMaskRotation: uniform(this._getParam(params, 'MaskRotation', 0.0)),
            uMaskRadialCenter: uniform(vec2(
                this._getParam(params, 'MaskRadialCenterX', 0.5),
                this._getParam(params, 'MaskRadialCenterY', 0.5)
            )),
            uMaskRadialRadius: uniform(vec2(
                this._getParam(params, 'MaskRadialRadiusX', 0.5),
                this._getParam(params, 'MaskRadialRadiusY', 0.5)
            )),
            uMaskRadialSoftness: uniform(this._getParam(params, 'MaskRadialSoftness', 0.2)),
            uMask3WayCenter: uniform(this._getParam(params, 'Mask3WayCenter', 0.5)),
            uMask3WaySpread: uniform(this._getParam(params, 'Mask3WaySpread', 0.2)),
            uMaskInvert: uniform(this._getParam(params, 'MaskInvert', false) ? 1 : 0)
        });
        return this.uniforms;
    }

    smoothstepTSL = Fn(([edge0, edge1, x]) => {
        const t = clamp(x.sub(edge0).div(edge1.sub(edge0)), 0.0, 1.0);
        return t.mul(t).mul(float(3.0).sub(float(2.0).mul(t)));
    });

    /**
     * Apply masking math based on uniforms.
     * Takes an aspect corrected UV or raw UV depending on usage context.
     * For Rings it might be aspect corrected. For Pixelate it's just raw UV.
     */
    applyMasking = Fn(([dUv]) => {
        const {
            uMaskType, uMaskCenter, uMaskSpread, uMaskRotation,
            uMaskRadialCenter, uMaskRadialRadius, uMaskRadialSoftness,
            uMask3WayCenter, uMask3WaySpread, uMaskInvert,
            uMasked
        } = this.uniforms;

        const maskValue = float(1.0).toVar();

        If(uMasked.equal(1), () => {
            const primaryMask = float(1.0).toVar();

            // Apply rotation for Linear and 3-Way Linear
            const s = sin(uMaskRotation);
            const c = cos(uMaskRotation);
            // Translate UV to center (0.5, 0.5), rotate, then translate back
            const centeredUv = dUv.sub(0.5);
            const rotatedX = centeredUv.x.mul(c).sub(centeredUv.y.mul(s)).add(0.5);

            If(uMaskType.equal(0), () => {
                primaryMask.assign(this.smoothstepTSL(uMaskCenter.sub(uMaskSpread), uMaskCenter.add(uMaskSpread), rotatedX));
            }).ElseIf(uMaskType.equal(1), () => {
                const dist3 = abs(rotatedX.sub(uMask3WayCenter));
                primaryMask.assign(float(1.0).sub(this.smoothstepTSL(uMask3WaySpread.sub(float(0.1)), uMask3WaySpread.add(float(0.1)), dist3)));
            }).ElseIf(uMaskType.equal(2), () => {
                const distR = length(dUv.sub(uMaskRadialCenter).div(uMaskRadialRadius));
                primaryMask.assign(float(1.0).sub(this.smoothstepTSL(float(1.0).sub(uMaskRadialSoftness), 1.0, distR)));
            });

            const invertMask = uMaskInvert.equal(1);
            primaryMask.assign(invertMask.select(float(1.0).sub(primaryMask), primaryMask));
            maskValue.assign(primaryMask);
        });

        return maskValue;
    });

    /**
     * Injects GUI controls into a Lil-GUI folder
     */
    setupGUI(parentFolder, params) {
        const maskFolder = parentFolder.addFolder('Mask');
        const uniforms = this.uniforms;

        const key = (k) => this.prefix + k;

        // initialize default values if not present
        if (params[key('Masked')] === undefined) params[key('Masked')] = false;
        if (params[key('MaskType')] === undefined) params[key('MaskType')] = 'Linear';
        if (params[key('MaskCenter')] === undefined) params[key('MaskCenter')] = 0.5;
        if (params[key('MaskSpread')] === undefined) params[key('MaskSpread')] = 0.2;
        if (params[key('MaskRotation')] === undefined) params[key('MaskRotation')] = 0.0;
        if (params[key('Mask3WayCenter')] === undefined) params[key('Mask3WayCenter')] = 0.5;
        if (params[key('Mask3WaySpread')] === undefined) params[key('Mask3WaySpread')] = 0.2;
        if (params[key('MaskRadialCenterX')] === undefined) params[key('MaskRadialCenterX')] = 0.5;
        if (params[key('MaskRadialCenterY')] === undefined) params[key('MaskRadialCenterY')] = 0.5;
        if (params[key('MaskRadialRadiusX')] === undefined) params[key('MaskRadialRadiusX')] = 0.5;
        if (params[key('MaskRadialRadiusY')] === undefined) params[key('MaskRadialRadiusY')] = 0.5;
        if (params[key('MaskRadialSoftness')] === undefined) params[key('MaskRadialSoftness')] = 0.2;
        if (params[key('MaskInvert')] === undefined) params[key('MaskInvert')] = false;

        maskFolder.add(params, key('Masked')).name('Masked').onChange(v => {
            uniforms.uMasked.value = v ? 1 : 0;
            if (this.sketch.updatePostProcessing) this.sketch.updatePostProcessing();
        }).listen();

        const maskTypes = ['Linear', '3-Way Linear', 'Radial'];
        const updateMaskGui = (type) => {
            const isLinear = type === 'Linear';
            const is3Way = type === '3-Way Linear';
            const isRadial = type === 'Radial';

            linearCenter.show(isLinear);
            linearSpread.show(isLinear);
            maskRotation.show(isLinear || is3Way);
            way3Center.show(is3Way);
            way3Spread.show(is3Way);
            radialCenterX.show(isRadial);
            radialCenterY.show(isRadial);
            radialRadiusX.show(isRadial);
            radialRadiusY.show(isRadial);
            radialSoftness.show(isRadial);

            invertController.show(isLinear || is3Way || isRadial);
        };

        maskFolder.add(params, key('MaskType'), maskTypes).name('Mask Type').onChange(v => {
            uniforms.uMaskType.value = maskTypes.indexOf(v);
            updateMaskGui(v);
            if (this.sketch.updatePostProcessing) this.sketch.updatePostProcessing();
        }).listen();

        const linearCenter = maskFolder.add(params, key('MaskCenter'), 0, 1).name('Linear Center').onChange(v => { uniforms.uMaskCenter.value = v; }).listen();
        const linearSpread = maskFolder.add(params, key('MaskSpread'), 0, 1).name('Linear Spread').onChange(v => { uniforms.uMaskSpread.value = v; }).listen();
        const maskRotation = maskFolder.add(params, key('MaskRotation'), -Math.PI, Math.PI).name('Rotation').onChange(v => { uniforms.uMaskRotation.value = v; }).listen();

        const way3Center = maskFolder.add(params, key('Mask3WayCenter'), 0, 1).name('3-Way Center').onChange(v => { uniforms.uMask3WayCenter.value = v; }).listen();
        const way3Spread = maskFolder.add(params, key('Mask3WaySpread'), 0, 1).name('3-Way Spread').onChange(v => { uniforms.uMask3WaySpread.value = v; }).listen();

        const radialCenterX = maskFolder.add(params, key('MaskRadialCenterX'), 0, 1).name('Radial Center X').onChange(v => { uniforms.uMaskRadialCenter.value.x = v; }).listen();
        const radialCenterY = maskFolder.add(params, key('MaskRadialCenterY'), 0, 1).name('Radial Center Y').onChange(v => { uniforms.uMaskRadialCenter.value.y = v; }).listen();
        const radialRadiusX = maskFolder.add(params, key('MaskRadialRadiusX'), 0, 1.5).name('Radial Radius X').onChange(v => { uniforms.uMaskRadialRadius.value.x = v; }).listen();
        const radialRadiusY = maskFolder.add(params, key('MaskRadialRadiusY'), 0, 1.5).name('Radial Radius Y').onChange(v => { uniforms.uMaskRadialRadius.value.y = v; }).listen();
        const radialSoftness = maskFolder.add(params, key('MaskRadialSoftness'), 0, 1).name('Radial Softness').onChange(v => { uniforms.uMaskRadialSoftness.value = v; }).listen();

        const invertController = maskFolder.add(params, key('MaskInvert')).name('Invert Mask').onChange(v => {
            uniforms.uMaskInvert.value = v ? 1 : 0;
            if (this.sketch.updatePostProcessing) this.sketch.updatePostProcessing();
        }).listen();

        updateMaskGui(params[key('MaskType')]);

        this.updateMaskGui = updateMaskGui;

        return maskFolder;
    }

    updateUniforms(params) {
        const uniforms = this.uniforms;

        uniforms.uMasked.value = this._getParam(params, 'Masked', false) ? 1 : 0;
        uniforms.uMaskType.value = ['Linear', '3-Way Linear', 'Radial'].indexOf(this._getParam(params, 'MaskType', 'Linear'));
        uniforms.uMaskCenter.value = this._getParam(params, 'MaskCenter', 0.5);
        uniforms.uMaskSpread.value = this._getParam(params, 'MaskSpread', 0.2);
        uniforms.uMaskRotation.value = this._getParam(params, 'MaskRotation', 0.0);
        uniforms.uMaskRadialCenter.value.set(
            this._getParam(params, 'MaskRadialCenterX', 0.5),
            this._getParam(params, 'MaskRadialCenterY', 0.5)
        );
        uniforms.uMaskRadialRadius.value.set(
            this._getParam(params, 'MaskRadialRadiusX', 0.5),
            this._getParam(params, 'MaskRadialRadiusY', 0.5)
        );
        uniforms.uMaskRadialSoftness.value = this._getParam(params, 'MaskRadialSoftness', 0.2);
        uniforms.uMask3WayCenter.value = this._getParam(params, 'Mask3WayCenter', 0.5);
        uniforms.uMask3WaySpread.value = this._getParam(params, 'Mask3WaySpread', 0.2);
        uniforms.uMaskInvert.value = this._getParam(params, 'MaskInvert', false) ? 1 : 0;

        if (this.updateMaskGui) {
            this.updateMaskGui(this._getParam(params, 'MaskType', 'Linear'));
        }
    }
}
