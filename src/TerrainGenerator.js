import * as THREE from 'three';
import { SimplexNoise } from './utils/SimplexNoise.js';
import { createSatelliteTileTexture } from './utils/satelliteTileTexture.js';

export class TerrainGenerator {
    constructor(options = {}) {
        this.size = options.size || 1000;
        this.segments = options.segments || 256;
        this.maxHeight = options.maxHeight || 50;
        this.waterLevel = options.waterLevel || 0;
        this.beachWidth = options.beachWidth || 20;
        this.shoreWidth = options.shoreWidth || 3.5;
        this.shoreDepth = options.shoreDepth || 1.5;
        this.underwaterDepthBias = options.underwaterDepthBias || 3.5;
        this.underwaterBiasFadeWidth = options.underwaterBiasFadeWidth || 6;
        this.landBias = options.landBias ?? 0.18;
        this.falloffStartRatio = options.falloffStartRatio || 0.24;
        this.maxLandRatio = options.maxLandRatio || 0.48;
        this.edgeDepth = options.edgeDepth || 10;
        this.coreRadiusRatio = options.coreRadiusRatio || 0.2;
        this.continentLift = options.continentLift || 0.35;
        this.coastVariance = options.coastVariance || 0.08;
        this.outerShelfDepth = options.outerShelfDepth || 2.5;
        this.coastlineBlendWidth = options.coastlineBlendWidth || 32;
        this.seed = options.seed || 42;
        this.satellite = {
            enabled: options.satellite?.enabled ?? true,
            centerLon: options.satellite?.centerLon ?? 121.4737,
            centerLat: options.satellite?.centerLat ?? 31.2304,
            zoom: options.satellite?.zoom ?? 15,
            grid: options.satellite?.grid ?? 5
        };

        this.noise = new SimplexNoise(this.seed);
        this.terrain = null;
        this.terrainMesh = null;
    }

    generate() {
        const terrainFactory = globalThis.THREE?.Terrain;
        if (typeof terrainFactory !== 'function') {
            throw new Error('THREE.Terrain is unavailable. Ensure loadThreeTerrain() runs before scene init.');
        }

        const material = new THREE.MeshStandardMaterial({
            vertexColors: true,
            roughness: 0.85,
            metalness: 0.0,
            flatShading: false
        });

        const minHeight = this.waterLevel - Math.max(this.maxHeight * 0.9, this.edgeDepth + this.outerShelfDepth + 6);
        const maxHeight = this.waterLevel + this.maxHeight;

        this.terrain = terrainFactory({
            easing: terrainFactory.EaseInOut,
            frequency: 2.2,
            heightmap: terrainFactory.PerlinDiamond,
            material,
            maxHeight,
            minHeight,
            steps: 1,
            stretch: true,
            turbulent: false,
            xSegments: this.segments,
            xSize: this.size,
            ySegments: this.segments,
            ySize: this.size,
            after: (zs) => this.applyIslandShaping(zs)
        });

        this.terrainMesh = this.terrain.children?.[0] || null;
        if (!this.terrainMesh?.geometry?.attributes?.position) {
            throw new Error('THREE.Terrain generated an unexpected mesh structure.');
        }

        this.terrainMesh.receiveShadow = true;
        this.terrainMesh.castShadow = true;
        this.applyVertexColors(this.terrainMesh.geometry);
        this.applySatelliteTexture(material);

        return this.terrain;
    }

    async applySatelliteTexture(material) {
        if (!this.satellite.enabled) return;
        try {
            const satelliteMap = await createSatelliteTileTexture({
                centerLon: this.satellite.centerLon,
                centerLat: this.satellite.centerLat,
                zoom: this.satellite.zoom,
                grid: this.satellite.grid
            });
            material.map = satelliteMap;
            material.vertexColors = false;
            material.color.set(0xffffff);
            material.needsUpdate = true;
        } catch (error) {
            console.warn('Satellite tiles unavailable, keep vertex-color terrain.', error);
        }
    }

    applyIslandShaping(zs) {
        const segments = this.segments;
        const vertexPerRow = segments + 1;

        for (let row = 0; row <= segments; row++) {
            for (let col = 0; col <= segments; col++) {
                const index = row * vertexPerRow + col;
                const x = (col / segments - 0.5) * this.size;
                const y = (row / segments - 0.5) * this.size;
                zs[index] = this.applyCoastProfile(x, y, zs[index]);
            }
        }
    }

    applyCoastProfile(x, y, baseHeight) {
        let height = baseHeight + this.landBias * this.maxHeight * 0.25;

        const distFromCenter = Math.hypot(x, y);
        const angle = Math.atan2(y, x);
        const coastNoise = this.noise.fbm(
            Math.cos(angle) * 1.7 + 11.3,
            Math.sin(angle) * 1.7 - 4.8,
            3,
            2.0,
            0.5
        );

        const coastlineRadius = this.size * this.maxLandRatio * (1 + coastNoise * this.coastVariance);
        const falloffStart = coastlineRadius * (this.falloffStartRatio / this.maxLandRatio);
        const coreRadius = this.size * this.coreRadiusRatio;

        if (distFromCenter < coreRadius) {
            const t = distFromCenter / coreRadius;
            height += (1 - t * t) * this.continentLift * this.maxHeight * 0.35;
        }

        if (distFromCenter > falloffStart) {
            const t = (distFromCenter - falloffStart) / Math.max(0.0001, coastlineRadius - falloffStart);
            const eased = THREE.MathUtils.smoothstep(t, 0, 1);
            const continentMask = Math.max(0, 1 - Math.pow(eased, 1.05));
            const edgeDrop = -this.edgeDepth * Math.pow(Math.max(0, t), 2);
            height = (height - this.waterLevel) * continentMask + this.waterLevel + edgeDrop;
        }

        if (distFromCenter > coastlineRadius) {
            const t = THREE.MathUtils.clamp(
                (distFromCenter - coastlineRadius) / this.coastlineBlendWidth,
                0,
                1
            );
            const forcedSeaFloor = this.waterLevel - this.outerShelfDepth * THREE.MathUtils.smoothstep(t, 0, 1);
            height = THREE.MathUtils.lerp(height, Math.min(height, forcedSeaFloor), THREE.MathUtils.smootherstep(t, 0, 1));
        }

        const shoreMin = this.waterLevel - this.shoreWidth;
        const shoreMax = this.waterLevel + this.shoreWidth;
        if (height > shoreMin && height < shoreMax) {
            if (height < this.waterLevel) {
                const t = (height - shoreMin) / (this.waterLevel - shoreMin);
                height = this.waterLevel - this.shoreDepth * Math.pow(1 - t, 1.35);
            } else {
                const t = (height - this.waterLevel) / (shoreMax - this.waterLevel);
                height = this.waterLevel + Math.pow(t, 0.75) * this.shoreWidth;
            }
        }

        if (height < this.waterLevel) {
            const underwaterDepth = THREE.MathUtils.clamp(this.waterLevel - height, 0, this.underwaterBiasFadeWidth);
            const biasStrength = THREE.MathUtils.smootherstep(
                underwaterDepth / this.underwaterBiasFadeWidth,
                0,
                1
            );
            height -= this.underwaterDepthBias * biasStrength;
        }

        if (Math.abs(height - this.waterLevel) < 0.06) {
            height = this.waterLevel - 0.06;
        }

        return height;
    }

    applyVertexColors(geometry) {
        const positions = geometry.attributes.position.array;
        const colors = new Float32Array(positions.length);

        for (let i = 0; i < positions.length; i += 3) {
            const x = positions[i];
            const localY = positions[i + 1];
            const height = positions[i + 2];
            const color = this.getTerrainColor(x, localY, height);
            colors[i] = color.r;
            colors[i + 1] = color.g;
            colors[i + 2] = color.b;
        }

        geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        geometry.computeVertexNormals();
    }

    getTerrainColor(x, y, height) {
        const normalizedHeight = (height - this.waterLevel) / this.maxHeight;

        const deepWater = new THREE.Color(0x1a3d5c);
        const shallowWater = new THREE.Color(0x2d6b8a);
        const beach = new THREE.Color(0xc2b280);
        const grass = new THREE.Color(0x3d6b3d);
        const darkGrass = new THREE.Color(0x2d4a2d);
        const rock = new THREE.Color(0x5a5a5a);
        const snow = new THREE.Color(0xe8e8e8);

        const color = new THREE.Color();

        if (height < this.waterLevel - 1.5) {
            color.copy(deepWater);
        } else if (height < this.waterLevel) {
            const shallowBlend = (height - (this.waterLevel - 1.5)) / 1.5;
            color.lerpColors(deepWater, shallowWater, THREE.MathUtils.clamp(shallowBlend, 0, 1));
        } else if (normalizedHeight < 0.08) {
            color.copy(beach);
        } else if (normalizedHeight < 0.18) {
            const sandToGrass = (normalizedHeight - 0.08) / 0.1;
            color.lerpColors(beach, grass, sandToGrass);
        } else if (normalizedHeight < 0.4) {
            const grassBlend = (normalizedHeight - 0.18) / 0.22;
            color.lerpColors(grass, darkGrass, grassBlend);
        } else if (normalizedHeight < 0.6) {
            const rockBlend = (normalizedHeight - 0.4) / 0.2;
            color.lerpColors(darkGrass, rock, rockBlend);
        } else if (normalizedHeight < 0.8) {
            color.copy(rock);
        } else {
            const snowBlend = (normalizedHeight - 0.8) / 0.2;
            color.lerpColors(rock, snow, snowBlend);
        }

        const noiseVariation = this.noise.noise2D(x * 0.05, y * 0.05) * 0.1;
        color.r = THREE.MathUtils.clamp(color.r + noiseVariation, 0, 1);
        color.g = THREE.MathUtils.clamp(color.g + noiseVariation, 0, 1);
        color.b = THREE.MathUtils.clamp(color.b + noiseVariation, 0, 1);

        return color;
    }

    getTerrain() {
        return this.terrain;
    }

    getHeightAt(x, z) {
        if (!this.terrainMesh?.geometry?.attributes?.position) {
            return this.waterLevel;
        }

        const positions = this.terrainMesh.geometry.attributes.position.array;
        const segments = this.segments;
        const stride = segments + 1;

        const localY = -z;
        const fx = THREE.MathUtils.clamp(((x / this.size) + 0.5) * segments, 0, segments);
        const fy = THREE.MathUtils.clamp(((localY / this.size) + 0.5) * segments, 0, segments);

        const x0 = Math.floor(fx);
        const y0 = Math.floor(fy);
        const x1 = Math.min(x0 + 1, segments);
        const y1 = Math.min(y0 + 1, segments);
        const tx = fx - x0;
        const ty = fy - y0;

        const sample = (ix, iy) => {
            const index = iy * stride + ix;
            return positions[index * 3 + 2];
        };

        const h00 = sample(x0, y0);
        const h10 = sample(x1, y0);
        const h01 = sample(x0, y1);
        const h11 = sample(x1, y1);

        const hx0 = THREE.MathUtils.lerp(h00, h10, tx);
        const hx1 = THREE.MathUtils.lerp(h01, h11, tx);
        return THREE.MathUtils.lerp(hx0, hx1, ty);
    }

    isLand(x, z) {
        return this.getHeightAt(x, z) > this.waterLevel;
    }
}
