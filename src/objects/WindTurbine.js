import * as THREE from 'three';

export class WindTurbine {
    constructor({
        position = new THREE.Vector3(360, 0, -260),
        yaw = -Math.PI * 0.18,
        rotorSpeed = 0.34
    } = {}) {
        this.group = new THREE.Group();
        this.group.position.copy(position);
        this.group.rotation.y = yaw;

        this.rotors = [];
        this.rotorSpeed = rotorSpeed;

        this.init();
    }

    init() {
        const towerMaterial = new THREE.MeshStandardMaterial({
            color: 0xe7edf2,
            metalness: 0.28,
            roughness: 0.55
        });
        const accentMaterial = new THREE.MeshStandardMaterial({
            color: 0xc4d0da,
            metalness: 0.35,
            roughness: 0.48
        });
        const bladeMaterial = new THREE.MeshStandardMaterial({
            color: 0xf7fafc,
            metalness: 0.16,
            roughness: 0.62
        });
        const foundationMaterial = new THREE.MeshStandardMaterial({
            color: 0x71808f,
            metalness: 0.24,
            roughness: 0.82
        });
        const platformMaterial = new THREE.MeshStandardMaterial({
            color: 0xffffff,
            transparent: true,
            opacity: 0.16,
            roughness: 0.95,
            metalness: 0
        });
        const ringMaterial = new THREE.MeshStandardMaterial({
            color: 0x91a1ae,
            metalness: 0.38,
            roughness: 0.42
        });

        const foundation = new THREE.Mesh(
            new THREE.CylinderGeometry(8.2, 10.6, 36, 24),
            foundationMaterial
        );
        foundation.position.y = -17.8;
        this.group.add(foundation);

        const transition = new THREE.Mesh(
            new THREE.CylinderGeometry(5.2, 6.8, 9, 24),
            accentMaterial
        );
        transition.position.y = 4.2;
        this.group.add(transition);

        const tower = new THREE.Mesh(
            new THREE.CylinderGeometry(2.9, 4.8, 92, 28),
            towerMaterial
        );
        tower.position.y = 54;
        this.group.add(tower);

        const nacelle = new THREE.Mesh(
            new THREE.CapsuleGeometry(3.2, 11, 8, 16),
            towerMaterial
        );
        nacelle.rotation.z = Math.PI / 2;
        nacelle.position.set(0, 102, 0);
        this.group.add(nacelle);

        const tailFin = new THREE.Mesh(
            new THREE.BoxGeometry(1.1, 5.5, 2.8),
            accentMaterial
        );
        tailFin.position.set(-8.5, 102.5, 0);
        this.group.add(tailFin);

        const rotor = this.createRotor(bladeMaterial, accentMaterial, ringMaterial);
        rotor.position.set(6.8, 102, 0);
        rotor.userData.rotationSpeed = this.rotorSpeed;
        this.group.add(rotor);
        this.rotors.push(rotor);

        const platform = new THREE.Mesh(
            new THREE.CylinderGeometry(7.6, 9.2, 0.5, 32),
            platformMaterial
        );
        platform.position.y = 0.12;
        this.group.add(platform);

        this.group.traverse((child) => {
            if (!child.isMesh) return;
            child.castShadow = true;
            child.receiveShadow = true;
        });
    }

    createRotor(bladeMaterial, hubMaterial, ringMaterial) {
        const rotor = new THREE.Group();

        const hub = new THREE.Mesh(
            new THREE.SphereGeometry(2.2, 20, 20),
            hubMaterial
        );
        rotor.add(hub);

        const bladeShape = new THREE.Shape();
        bladeShape.moveTo(-0.3, 0);
        bladeShape.quadraticCurveTo(1.2, 2.6, 0.7, 22);
        bladeShape.quadraticCurveTo(0.2, 31.5, -0.55, 38.5);
        bladeShape.quadraticCurveTo(-1.0, 31, -0.9, 21);
        bladeShape.quadraticCurveTo(-0.82, 6.8, -0.3, 0);

        const bladeGeometry = new THREE.ExtrudeGeometry(bladeShape, {
            depth: 0.22,
            bevelEnabled: false,
            curveSegments: 20,
            steps: 1
        });
        bladeGeometry.translate(0, -2.2, -0.11);

        for (let i = 0; i < 3; i++) {
            const blade = new THREE.Mesh(bladeGeometry, bladeMaterial);
            blade.rotation.x = Math.PI / 2;
            blade.rotation.z = (i / 3) * Math.PI * 2;
            blade.position.x = 0.55;
            rotor.add(blade);
        }

        const ring = new THREE.Mesh(
            new THREE.TorusGeometry(2.65, 0.16, 10, 40),
            ringMaterial
        );
        ring.rotation.y = Math.PI / 2;
        rotor.add(ring);

        return rotor;
    }

    addToScene(scene) {
        scene.add(this.group);
    }

    update(time, delta = 1 / 60) {
        this.rotors.forEach((rotor, index) => {
            const gust = 1.0 + Math.sin(time * 0.28 + index * 1.7) * 0.08;
            rotor.rotation.x += rotor.userData.rotationSpeed * gust * delta;
        });
    }
}
