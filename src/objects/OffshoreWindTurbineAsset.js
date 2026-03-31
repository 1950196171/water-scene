import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { WindTurbine } from './WindTurbine.js';

const DEFAULT_MODEL_URL = '/models/offshore-wind-turbine.glb';

export class OffshoreWindTurbineAsset {
    constructor({
        modelUrl = DEFAULT_MODEL_URL,
        position = new THREE.Vector3(360, 0, -260),
        yaw = -Math.PI * 0.18,
        scale = 1,
        rotorSpeed = 0.34
    } = {}) {
        this.modelUrl = modelUrl;
        this.position = position.clone();
        this.yaw = yaw;
        this.scale = scale;
        this.rotorSpeed = rotorSpeed;

        this.group = new THREE.Group();
        this.group.position.copy(this.position);
        this.group.rotation.y = this.yaw;
        this.group.scale.setScalar(this.scale);

        this.rotors = [];
        this.mixer = null;
        this.model = null;
        this.usingFallback = false;
    }

    async load() {
        try {
            const gltf = await this.loadGltf(this.modelUrl);
            this.attachModel(gltf);
        } catch (error) {
            console.warn(`风机资产加载失败，回退到程序化风机: ${this.modelUrl}`, error);
            this.attachFallback();
        }

        return this;
    }

    loadGltf(url) {
        const loader = new GLTFLoader();
        return new Promise((resolve, reject) => {
            loader.load(url, resolve, undefined, reject);
        });
    }

    attachModel(gltf) {
        const model = gltf.scene;
        this.fitModelToTargetHeight(model);
        this.prepareModel(model);
        this.alignModelToWaterline(model);
        this.group.add(model);
        this.model = model;

        if (gltf.animations?.length) {
            this.mixer = new THREE.AnimationMixer(model);
            gltf.animations.forEach((clip) => {
                this.mixer.clipAction(clip).play();
            });
        }
    }

    attachFallback() {
        const fallback = new WindTurbine({
            position: new THREE.Vector3(0, 0, 0),
            yaw: 0,
            rotorSpeed: this.rotorSpeed
        });
        this.group.add(fallback.group);
        this.rotors = fallback.rotors;
        this.usingFallback = true;
    }

    prepareModel(model) {
        model.traverse((child) => {
            if (!child.isMesh) return;
            child.castShadow = true;
            child.receiveShadow = true;

            const materials = Array.isArray(child.material) ? child.material : [child.material];
            materials.forEach((material) => {
                if (!material) return;
                if ('color' in material) {
                    material.color.set(0xe8edf3);
                }
                if ('metalness' in material && material.metalness < 0.05) {
                    material.metalness = 0.18;
                }
                if ('roughness' in material && material.roughness > 0.92) {
                    material.roughness = 0.82;
                }
            });
        });

    }

    fitModelToTargetHeight(model, targetHeight = 340) {
        const box = new THREE.Box3().setFromObject(model);
        const size = box.getSize(new THREE.Vector3());
        if (size.y <= 0.0001) return;

        const scaleFactor = targetHeight / size.y;
        model.scale.multiplyScalar(scaleFactor);
    }

    alignModelToWaterline(model) {
        const box = new THREE.Box3().setFromObject(model);
        model.position.y -= box.min.y;
    }

    addToScene(scene) {
        scene.add(this.group);
    }

    faceDirection(direction) {
        const flatDirection = new THREE.Vector3(direction.x, 0, direction.z);
        if (flatDirection.lengthSq() < 0.0001) return;

        flatDirection.normalize();
        const yaw = Math.atan2(flatDirection.x, flatDirection.z);
        this.group.rotation.y = yaw;
    }

    update(time, delta = 1 / 60) {
        if (this.mixer) {
            this.mixer.update(delta);
        }
    }
}
