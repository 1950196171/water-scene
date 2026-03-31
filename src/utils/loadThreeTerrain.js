import * as THREE from 'three';

let terrainScriptPromise = null;

function ensureMutableGlobalThree() {
    const existing = globalThis.THREE;
    if (existing && existing.__terrainMutableBridge) {
        return existing;
    }

    // ESM 命名空间对象不可扩展，而 THREE.Terrain 会直接改写 `THREE`。
    // 这里暴露一个可扩展的镜像对象，同时复用同一套 Three 构造器。
    const bridge = { ...THREE };
    if (!bridge.Math && bridge.MathUtils) {
        bridge.Math = bridge.MathUtils;
    }
    if (!bridge.Math?.ceilPowerOfTwo && bridge.MathUtils?.ceilPowerOfTwo) {
        bridge.Math = { ...(bridge.Math || {}), ceilPowerOfTwo: bridge.MathUtils.ceilPowerOfTwo };
    }
    Object.defineProperty(bridge, '__terrainMutableBridge', {
        value: true,
        enumerable: false
    });
    globalThis.THREE = bridge;
    return bridge;
}

export function loadThreeTerrain() {
    if (globalThis.THREE?.Terrain) {
        return Promise.resolve(globalThis.THREE.Terrain);
    }

    if (terrainScriptPromise) {
        return terrainScriptPromise;
    }

    if (!THREE.BufferGeometry.prototype.computeFaceNormals) {
        // THREE.Terrain 仍会调用旧版 API，这里补一个兼容空实现。
        THREE.BufferGeometry.prototype.computeFaceNormals = function computeFaceNormals() {
            return this;
        };
    }

    ensureMutableGlobalThree();

    terrainScriptPromise = new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = '/vendor/THREE.Terrain.js';
        script.async = true;
        script.onload = () => {
            if (!globalThis.THREE?.Terrain) {
                reject(new Error('THREE.Terrain loaded but global API is missing.'));
                return;
            }
            resolve(globalThis.THREE.Terrain);
        };
        script.onerror = () => reject(new Error('Failed to load THREE.Terrain.js'));
        document.head.appendChild(script);
    });

    return terrainScriptPromise;
}
