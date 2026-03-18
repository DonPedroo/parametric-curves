import { deepMerge } from './utils/deepMerge.js';

export class EffectManager {
    constructor(sketch) {
        this.sketch = sketch;
        this.effects = [];
        this.effectMap = new Map();

        // Dynamically discover all effects in the ./effects/ directory
        // We look for files that export an effect class
        const modules = import.meta.glob('./effects/*.js', { eager: true });

        for (const path in modules) {
            const module = modules[path];
            // Get the first exported class from the module
            const exportedClasses = Object.values(module).filter(v => typeof v === 'function' && v.name && v.name.endsWith('Effect'));
            const EffectClass = exportedClasses[0];

            // Only instantiate if it's a valid effect plugin (has static type)
            if (EffectClass && EffectClass.type) {
                const instance = new EffectClass(this.sketch);
                this.effects.push(instance);
                this.effectMap.set(EffectClass.name, instance);
            }
        }
    }

    /**
     * Collects all default parameters from all discovered effects.
     */
    gatherDefaults() {
        const defaults = {};
        for (const effect of this.effects) {
            if (typeof effect.constructor.getDefaults === 'function') {
                Object.assign(defaults, effect.constructor.getDefaults());
            }
        }
        return defaults;
    }

    /**
     * Initializes uniforms for all effects and returns a merged uniforms object.
     */
    setupUniforms() {
        const allUniforms = {};
        for (const effect of this.effects) {
            if (typeof effect.setupUniforms === 'function') {
                const effectUniforms = effect.setupUniforms();
                Object.assign(allUniforms, effectUniforms);
            }
        }
        return allUniforms;
    }

    /**
     * Updates uniforms for all effects based on current parameters.
     */
    updateUniforms(params) {
        for (const effect of this.effects) {
            if (typeof effect.updateUniforms === 'function') {
                effect.updateUniforms(params);
            }
        }
    }

    /**
     * Propagates speed updates to all effects.
     */
    updateSpeeds(isLoop, duration, quantizeFn) {
        for (const effect of this.effects) {
            if (typeof effect.updateSpeeds === 'function') {
                effect.updateSpeeds(isLoop, duration, quantizeFn);
            }
        }
    }

    /**
     * Propagates frame updates to all effects.
     */
    update(deltaTime, timeSeconds) {
        for (const effect of this.effects) {
            if (typeof effect.update === 'function') {
                effect.update(deltaTime, timeSeconds);
            }
        }
    }

    /**
     * Iteratively chains 'standard' effects sorted by their order property.
     */
    buildStandardNodes(inputNode, vUv) {
        let currentNode = inputNode;

        const standardEffects = this.effects
            .filter(e => e.constructor.type === 'standard')
            .sort((a, b) => (a.constructor.order || 0) - (b.constructor.order || 0));

        for (const effect of standardEffects) {
            const enabledKey = this._getEnabledKey(effect.constructor.name);
            if (this.sketch.params[enabledKey] !== false) {
                currentNode = effect.buildNode(currentNode, vUv);
            }
        }

        return currentNode;
    }

    /**
     * Gets a specific effect instance by class name.
     */
    getEffect(name) {
        return this.effectMap.get(name);
    }

    /**
     * Disposes all effects.
     */
    dispose() {
        for (const effect of this.effects) {
            if (typeof effect.dispose === 'function') {
                effect.dispose();
            }
        }
    }

    /**
     * Internal helper to guess the 'enabled' parameter name (e.g., CirclesEffect -> circlesEnabled)
     */
    _getEnabledKey(className) {
        const base = className.replace('Effect', '');
        return base.charAt(0).toLowerCase() + base.slice(1) + 'Enabled';
    }
}
