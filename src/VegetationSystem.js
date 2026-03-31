import * as THREE from 'three';
import { Tree } from '@dgreenheck/ez-tree';
import { SimplexNoise } from './utils/SimplexNoise.js';

export class VegetationSystem {
    constructor(terrain, options = {}) {
        this.terrain = terrain;
        this.options = {
            grassCount: options.grassCount ?? 18000,
            shrubCount: options.shrubCount ?? 420,
            lowPlantCount: options.lowPlantCount ?? 260,
            treeCount: options.treeCount ?? 120,
            terrainSize: options.terrainSize ?? 1000,
            waterLevel: options.waterLevel ?? 0,
            treePlacements: options.treePlacements ?? [],
            shrubPlacements: options.shrubPlacements ?? [],
            lowPlantPlacements: options.lowPlantPlacements ?? [],
            grassAreas: options.grassAreas ?? []
        };

        this.noise = new SimplexNoise(12345);
        this.group = new THREE.Group();
        this.grass = null;
        this.plants = [];
        this.animatedPlants = [];
        this.treePositions = [];
        this.occupiedPlantPositions = [];
    }

    generate() {
        this.group.clear();
        this.plants = [];
        this.animatedPlants = [];
        this.treePositions = [];
        this.occupiedPlantPositions = [];

        this.generateGrass();
        this.generateTrees();
        this.generateShrubs();
        this.generateLowPlants();

        if (this.grass) {
            this.group.add(this.grass);
        }

        this.plants.forEach((plant) => this.group.add(plant));

        return this.group;
    }

    generateGrass() {
        const placements = [];

        if (this.options.grassAreas.length > 0) {
            this.options.grassAreas.forEach((area, areaIndex) => {
                const areaCount = area.count ?? 2400;
                placements.push(...this.collectAreaPlacements(areaCount, {
                    centerX: area.centerX ?? 0,
                    centerZ: area.centerZ ?? 0,
                    width: area.width ?? 120,
                    depth: area.depth ?? 120,
                    minHeight: area.minHeight ?? this.options.waterLevel + 1.2,
                    maxHeight: area.maxHeight ?? this.options.waterLevel + 12,
                    maxSlope: area.maxSlope ?? 1.35,
                    densityScale: area.densityScale ?? 0.02,
                    densityThreshold: area.densityThreshold ?? -0.18,
                    jitterSeed: areaIndex * 13.17
                }));
            });
        }

        if (this.options.grassCount > 0) {
            placements.push(...this.collectPlacements(this.options.grassCount, {
                areaRatio: 0.78,
                minHeight: this.options.waterLevel + 1.2,
                maxHeight: this.options.waterLevel + 12,
                maxSlope: 1.35,
                densityScale: 0.02,
                densityThreshold: -0.18
            }));
        }

        if (placements.length === 0) {
            this.grass = null;
            return;
        }

        const grassGeometries = [
            this.createGrassBladeGeometry(0),
            this.createGrassBladeGeometry(Math.PI / 3),
            this.createGrassBladeGeometry(-Math.PI / 3)
        ];

        const material = new THREE.MeshStandardMaterial({
            color: 0x7aa35a,
            roughness: 0.96,
            metalness: 0,
            side: THREE.DoubleSide
        });

        const grassGroup = new THREE.Group();
        const dummy = new THREE.Object3D();

        grassGeometries.forEach((geometry, layerIndex) => {
            const mesh = new THREE.InstancedMesh(geometry, material, placements.length);
            mesh.castShadow = false;
            mesh.receiveShadow = true;

            placements.forEach((placement, index) => {
                dummy.position.set(placement.x, placement.y, placement.z);
                dummy.rotation.set(0, placement.rotation + layerIndex * 0.35, placement.tilt);
                dummy.scale.setScalar(placement.scale);
                dummy.updateMatrix();
                mesh.setMatrixAt(index, dummy.matrix);

                const color = new THREE.Color().setHSL(
                    THREE.MathUtils.lerp(0.22, 0.31, placement.colorMix),
                    THREE.MathUtils.lerp(0.34, 0.52, placement.colorMix),
                    THREE.MathUtils.lerp(0.24, 0.4, placement.colorMix)
                );
                mesh.setColorAt(index, color);
            });

            mesh.instanceMatrix.needsUpdate = true;
            if (mesh.instanceColor) {
                mesh.instanceColor.needsUpdate = true;
            }
            grassGroup.add(mesh);
        });

        this.grass = grassGroup;
    }

    generateTrees() {
        const prototypes = [
            this.createPlantPrototype('Pine Small', 3001, 1.05),
            this.createPlantPrototype('Aspen Small', 3002, 1.0),
            this.createPlantPrototype('Oak Small', 3003, 1.15),
            this.createPlantPrototype('Pine Medium', 3004, 1.25)
        ];

        const placements = [
            ...this.normalizeManualPlacements(this.options.treePlacements, {
                defaultScaleRange: [1.15, 1.85]
            }),
            ...this.collectPlacements(this.options.treeCount, {
                areaRatio: 0.66,
                minHeight: this.options.waterLevel + 2.5,
                maxHeight: this.options.waterLevel + 18,
                maxSlope: 0.95,
                minSpacing: 15,
                densityScale: 0.0042,
                densityThreshold: 0.14
            })
        ];

        placements.forEach((placement, index) => {
            const tree = this.instantiatePlant(prototypes[index % prototypes.length], placement, 1.15, 1.9);
            this.plants.push(tree);
            this.animatedPlants.push(tree);
            this.treePositions.push({ x: placement.x, z: placement.z });
            this.occupiedPlantPositions.push({ x: placement.x, z: placement.z });
        });
    }

    generateShrubs() {
        this.generateBushLayer({
            placements: this.options.shrubPlacements,
            count: this.options.shrubCount,
            placementScaleRange: [0.85, 1.35],
            instantiateScaleRange: [0.75, 1.35],
            config: {
                areaRatio: 0.72,
                minHeight: this.options.waterLevel + 1.5,
                maxHeight: this.options.waterLevel + 13,
                maxSlope: 1.1,
                minSpacing: 6,
                densityScale: 0.006,
                densityThreshold: 0.05
            },
            seedBase: 2001,
            tintJitterBase: 0.85
        });
    }

    generateLowPlants() {
        this.generateBushLayer({
            placements: this.options.lowPlantPlacements,
            count: this.options.lowPlantCount,
            placementScaleRange: [0.42, 0.7],
            instantiateScaleRange: [0.42, 0.72],
            config: {
                areaRatio: 0.74,
                minHeight: this.options.waterLevel + 1.3,
                maxHeight: this.options.waterLevel + 10,
                maxSlope: 1.2,
                minSpacing: 4,
                densityScale: 0.008,
                densityThreshold: -0.02
            },
            seedBase: 4001,
            tintJitterBase: 0.7
        });
    }

    generateBushLayer(layerOptions) {
        const prototypes = [
            this.createPlantPrototype('Bush 1', layerOptions.seedBase, layerOptions.tintJitterBase),
            this.createPlantPrototype('Bush 2', layerOptions.seedBase + 1, layerOptions.tintJitterBase + 0.08),
            this.createPlantPrototype('Bush 3', layerOptions.seedBase + 2, layerOptions.tintJitterBase + 0.02)
        ];

        const placements = [
            ...this.normalizeManualPlacements(layerOptions.placements, {
                defaultScaleRange: layerOptions.placementScaleRange
            }),
            ...this.collectPlacements(layerOptions.count, layerOptions.config)
        ];

        placements.forEach((placement, index) => {
            const plant = this.instantiatePlant(
                prototypes[index % prototypes.length],
                placement,
                layerOptions.instantiateScaleRange[0],
                layerOptions.instantiateScaleRange[1]
            );
            this.plants.push(plant);
            this.animatedPlants.push(plant);
            this.occupiedPlantPositions.push({ x: placement.x, z: placement.z });
        });
    }

    instantiatePlant(prototype, placement, minScale, maxScale) {
        const plant = prototype.clone(true);
        plant.position.set(placement.x, placement.y, placement.z);
        plant.rotation.y = placement.rotation;
        plant.scale.setScalar(placement.scale ?? THREE.MathUtils.lerp(minScale, maxScale, placement.scaleMix ?? Math.random()));
        plant.traverse((child) => {
            child.castShadow = true;
            child.receiveShadow = true;
        });
        return plant;
    }

    normalizeManualPlacements(placements, config = {}) {
        return placements.map((placement, index) => {
            const y = placement.y ?? this.terrain.getHeightAt(placement.x, placement.z);
            const randomScale = THREE.MathUtils.lerp(
                config.defaultScaleRange?.[0] ?? 1,
                config.defaultScaleRange?.[1] ?? 1,
                ((index * 37) % 100) / 100
            );

            return {
                x: placement.x,
                y,
                z: placement.z,
                rotation: placement.rotation ?? (index * Math.PI * 0.37) % (Math.PI * 2),
                tilt: placement.tilt ?? 0,
                scale: placement.scale ?? randomScale,
                scaleMix: placement.scaleMix ?? (((index * 53) % 100) / 100),
                colorMix: placement.colorMix ?? 0.6
            };
        });
    }

    createPlantPrototype(presetName, seed, tintJitter) {
        const plant = new Tree();
        plant.loadPreset(presetName);
        plant.options.seed = seed;
        plant.options.bark.tint = this.jitterColor(plant.options.bark.tint, tintJitter * 0.04);
        plant.options.leaves.tint = this.jitterColor(plant.options.leaves.tint, tintJitter * 0.08);
        plant.generate();
        this.tunePlantMaterials(plant);
        return plant;
    }

    tunePlantMaterials(plant) {
        plant.traverse((child) => {
            if (!child.isMesh || !child.material) return;

            const materials = Array.isArray(child.material) ? child.material : [child.material];

            materials.forEach((material) => {
                if (material.name === 'branches') {
                    material.color.multiplyScalar(1.6);
                    material.emissive = new THREE.Color(0x6a4a34);
                    material.emissiveIntensity = 0.38;
                    material.shininess = 26;
                }

                if (material.name === 'leaves') {
                    material.color.multiplyScalar(1.2);
                    material.emissive = new THREE.Color(0x355326);
                    material.emissiveIntensity = 0.18;
                    material.alphaTest = 0.42;
                }

                material.needsUpdate = true;
            });

            if (child.material?.name === 'branches') {
                child.receiveShadow = false;
            }
        });
    }

    createGrassBladeGeometry(rotationY) {
        const width = 0.24;
        const height = 1.4;
        const lean = 0.18;
        const geometry = new THREE.PlaneGeometry(width, height, 1, 3);
        geometry.translate(0, height * 0.5, 0);

        const position = geometry.attributes.position;
        for (let i = 0; i < position.count; i++) {
            const y = position.getY(i);
            const bend = (y / height) ** 1.8;
            const taper = THREE.MathUtils.lerp(1, 0.18, y / height);
            position.setX(i, position.getX(i) * taper + lean * bend);
            position.setZ(i, 0.06 * bend);
        }
        position.needsUpdate = true;
        geometry.computeVertexNormals();
        geometry.rotateY(rotationY);

        return geometry;
    }

    collectPlacements(targetCount, config) {
        if (!targetCount) return [];

        const placements = [];
        const maxAttempts = targetCount * 14;

        for (let i = 0; i < maxAttempts && placements.length < targetCount; i++) {
            const x = (Math.random() - 0.5) * this.options.terrainSize * config.areaRatio;
            const z = (Math.random() - 0.5) * this.options.terrainSize * config.areaRatio;
            const placement = this.buildPlacementFromPoint(x, z, config);

            if (!placement) continue;
            if (config.minSpacing && !this.isFarEnoughFromPlants(placements, x, z, config.minSpacing)) continue;
            if (config.minSpacing && !this.isFarEnoughFromPlants(this.treePositions, x, z, config.minSpacing * 0.8)) continue;
            if (config.minSpacing && !this.isFarEnoughFromPlants(this.occupiedPlantPositions, x, z, config.minSpacing * 0.7)) continue;

            placements.push(placement);
        }

        return placements;
    }

    collectAreaPlacements(targetCount, config) {
        const placements = [];
        const maxAttempts = targetCount * 10;

        for (let i = 0; i < maxAttempts && placements.length < targetCount; i++) {
            const x = config.centerX + (Math.random() - 0.5) * config.width;
            const z = config.centerZ + (Math.random() - 0.5) * config.depth;
            const placement = this.buildPlacementFromPoint(x, z, config, config.jitterSeed);

            if (placement) {
                placements.push(placement);
            }
        }

        return placements;
    }

    buildPlacementFromPoint(x, z, config, jitterSeed = 0) {
        const y = this.terrain.getHeightAt(x, z);
        if (y < config.minHeight || y > config.maxHeight) return null;

        const slope = this.getSlopeAt(x, z);
        if (slope > config.maxSlope) return null;

        const densityNoise = this.noise.noise2D(x * config.densityScale + jitterSeed, z * config.densityScale - jitterSeed);
        if (densityNoise < config.densityThreshold) return null;

        const colorMix = THREE.MathUtils.clamp((densityNoise + 1) * 0.5, 0, 1);
        return {
            x,
            y,
            z,
            rotation: Math.random() * Math.PI * 2,
            tilt: this.noise.noise2D(x * 0.03, z * 0.03) * 0.08,
            scale: THREE.MathUtils.lerp(0.75, 1.45, Math.random()),
            scaleMix: Math.random(),
            colorMix
        };
    }

    getSlopeAt(x, z) {
        const sample = 2.5;
        const left = this.terrain.getHeightAt(x - sample, z);
        const right = this.terrain.getHeightAt(x + sample, z);
        const down = this.terrain.getHeightAt(x, z - sample);
        const up = this.terrain.getHeightAt(x, z + sample);

        return Math.hypot((right - left) / (sample * 2), (up - down) / (sample * 2));
    }

    isFarEnoughFromPlants(positions, x, z, minSpacing) {
        const minSpacingSq = minSpacing * minSpacing;

        for (const pos of positions) {
            const dx = pos.x - x;
            const dz = pos.z - z;
            if (dx * dx + dz * dz < minSpacingSq) {
                return false;
            }
        }

        return true;
    }

    jitterColor(hex, amount) {
        const color = new THREE.Color(hex);
        const hsl = {};
        color.getHSL(hsl);
        hsl.h = (hsl.h + this.noise.noise2D(hex * 0.0001, amount * 100) * amount + 1) % 1;
        hsl.s = THREE.MathUtils.clamp(hsl.s + amount * 0.6, 0, 1);
        hsl.l = THREE.MathUtils.clamp(hsl.l + amount * 0.3, 0, 1);
        color.setHSL(hsl.h, hsl.s, hsl.l);
        return color.getHex();
    }

    update(elapsedTime) {
        this.animatedPlants.forEach((plant) => {
            if (typeof plant.update === 'function') {
                plant.update(elapsedTime);
            }
        });
    }

    addToScene(scene) {
        scene.add(this.group);
    }
}
