import * as THREE from 'three';
import { Water } from 'three/addons/objects/Water.js';
import { Sky } from 'three/addons/objects/Sky.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import Stats from 'three/addons/libs/stats.module.js';
import { TerrainGenerator } from './TerrainGenerator.js';
import { VegetationSystem } from './VegetationSystem.js';
import { DEFAULT_SCENE_PARAMS } from './weatherPresets.js';
import { OffshoreWindTurbineAsset } from './objects/OffshoreWindTurbineAsset.js';

const RAIN_AUDIO_URL = '/audio/rain-calming.mp3';
const THUNDER_AUDIO_URL = '/audio/thunder-close.mp3';

export class OceanScene {
    constructor(container) {
        this.container = container;
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.controls = null;
        this.water = null;
        this.sky = null;
        this.starField = null;
        this.moonSprite = null;
        this.moonGlowSprite = null;
        this.galaxyBand = null;
        this.sun = new THREE.Vector3();
        this.initialSun = new THREE.Vector3();
        this.terrain = null;
        this.vegetation = null;
        this.vegetationSystem = null;
        this.pmremGenerator = null;
        this.renderTarget = null;
        this.ambientLight = null;
        this.sunLight = null;
        this.moonLight = null;
        this.vegetationFillLight = null;
        this.lightningLight = null;
        this.lightningCloudGlow = null;
        this.composer = null;
        this.bloomPass = null;
        this.fogPass = null;
        this.rainPass = null;
        this.snowPass = null;
        this.underwaterPass = null;
        this.depthTarget = null;
        this.stats = null;
        this.cloudGroup = null;
        this.cloudMaterials = [];
        this.cloudLayers = [];
        this.fogGroup = null;
        this.fogLayers = [];
        this.horizonFog = null;
        this.skyHazeBand = null;
        this.windTurbine = null;
        this.rainAudioPool = [];
        this.rainAudioActiveIndex = 0;
        this.rainAudioIsPlaying = false;
        this.rainAudioCrossfading = false;
        this.rainAudioCrossfadeDuration = 1.6;
        this.thunderAudioPool = [];
        this.thunderAudioIndex = 0;
        this.thunderVolume = DEFAULT_SCENE_PARAMS.thunderVolume;
        this.scheduledThunder = [];
        
        this.params = { ...DEFAULT_SCENE_PARAMS };
        
        this.clock = new THREE.Clock();
        this.lightningFlash = 0;
        this.lightningLocalFlash = 0;
        this.lightningBurstEnd = 0;
        this.nextLightningAt = 0;
        this.lightningPulseSchedule = [];
    }
    
    async init() {
        this.initRenderer();
        this.initStats();
        this.initScene();
        this.initCamera();
        this.initControls();
        this.initLighting();
        this.initPostProcessing();
        this.initAudio();
        await this.initSky();
        this.initStars();
        this.initNightSky();
        this.initClouds();
        await this.initWater();
        await this.initTerrain();
        await this.initWindTurbine();
        await this.initVegetation();
        this.initSunPosition();
        this.initEventListeners();
    }
    
    initRenderer() {
        this.renderer = new THREE.WebGLRenderer({
            antialias: true,
            powerPreference: 'high-performance'
        });
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = this.params.exposure;
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        this.container.appendChild(this.renderer.domElement);
    }

    initStats() {
        this.stats = new Stats();
        this.stats.showPanel(0);
        this.stats.dom.style.position = 'fixed';
        this.stats.dom.style.left = '0';
        this.stats.dom.style.top = '0';
        this.stats.dom.style.bottom = 'auto';
        this.stats.dom.style.margin = '0';
        this.stats.dom.style.zIndex = '120';
        this.container.appendChild(this.stats.dom);
    }
    
    initScene() {
        this.scene = new THREE.Scene();
    }
    
    initCamera() {
        this.camera = new THREE.PerspectiveCamera(
            60,
            window.innerWidth / window.innerHeight,
            1,
            20000
        );
        this.camera.position.set(100, 50, 200);
    }
    
    initControls() {
        this.controls = new OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.05;
        this.controls.maxPolarAngle = Math.PI * 0.48;
        this.controls.minDistance = 30;
        this.controls.maxDistance = 1000;
        this.controls.target.set(0, 10, 0);
        this.controls.update();
    }
    
    initLighting() {
        this.ambientLight = new THREE.AmbientLight(0x8ea0b7, 0.58);
        this.scene.add(this.ambientLight);
        
        this.sunLight = new THREE.DirectionalLight(0xffffff, 1.5);
        this.sunLight.castShadow = true;
        this.sunLight.shadow.mapSize.width = 2048;
        this.sunLight.shadow.mapSize.height = 2048;
        this.sunLight.shadow.camera.near = 0.5;
        this.sunLight.shadow.camera.far = 500;
        this.sunLight.shadow.camera.left = -100;
        this.sunLight.shadow.camera.right = 100;
        this.sunLight.shadow.camera.top = 100;
        this.sunLight.shadow.camera.bottom = -100;
        this.scene.add(this.sunLight);

        this.moonLight = new THREE.DirectionalLight(0xa9c7ff, 0);
        this.moonLight.castShadow = false;
        this.scene.add(this.moonLight);

        this.vegetationFillLight = new THREE.DirectionalLight(0xffb06a, 0.95);
        this.vegetationFillLight.castShadow = false;
        this.scene.add(this.vegetationFillLight);

        this.lightningLight = new THREE.DirectionalLight(0xddeeff, 0);
        this.lightningLight.castShadow = false;
        this.lightningLight.position.set(-120, 180, 40);
        this.scene.add(this.lightningLight);
    }

    initPostProcessing() {
        this.depthTarget = new THREE.WebGLRenderTarget(window.innerWidth, window.innerHeight);
        this.depthTarget.depthTexture = new THREE.DepthTexture(window.innerWidth, window.innerHeight, THREE.UnsignedIntType);
        this.depthTarget.depthTexture.format = THREE.DepthFormat;
        this.depthTarget.texture.minFilter = THREE.NearestFilter;
        this.depthTarget.texture.magFilter = THREE.NearestFilter;
        this.depthTarget.texture.generateMipmaps = false;

        this.composer = new EffectComposer(this.renderer);
        this.composer.addPass(new RenderPass(this.scene, this.camera));

        this.bloomPass = new UnrealBloomPass(
            new THREE.Vector2(window.innerWidth, window.innerHeight),
            this.params.bloomStrength,
            this.params.bloomRadius,
            this.params.bloomThreshold
        );
        this.composer.addPass(this.bloomPass);

        this.fogPass = new ShaderPass(this.createVolumetricFogShader());
        this.fogPass.material.uniforms.resolution.value.set(window.innerWidth, window.innerHeight);
        this.fogPass.material.uniforms.tDepth.value = this.depthTarget.depthTexture;
        this.fogPass.material.uniforms.cameraNear.value = this.camera.near;
        this.fogPass.material.uniforms.cameraFar.value = this.camera.far;
        this.composer.addPass(this.fogPass);

        this.rainPass = new ShaderPass(this.createRainShader());
        this.rainPass.enabled = this.params.rainEnabled;
        this.rainPass.material.uniforms.resolution.value.set(window.innerWidth, window.innerHeight);
        this.rainPass.material.uniforms.screenIntensity.value = this.params.rainScreenIntensity;
        this.rainPass.material.uniforms.veilIntensity.value = this.params.rainVeilIntensity;
        this.rainPass.material.uniforms.dropSize.value = this.params.rainDropSize;
        this.rainPass.material.uniforms.rainSpeed.value = this.params.rainSpeed;
        this.composer.addPass(this.rainPass);

        this.snowPass = new ShaderPass(this.createSnowShader());
        this.snowPass.enabled = this.params.snowEnabled;
        this.snowPass.material.uniforms.resolution.value.set(window.innerWidth, window.innerHeight);
        this.snowPass.material.uniforms.intensity.value = this.params.snowIntensity;
        this.snowPass.material.uniforms.snowSpeed.value = this.params.snowSpeed;
        this.composer.addPass(this.snowPass);

        this.underwaterPass = new ShaderPass(this.createUnderwaterShader());
        this.underwaterPass.material.uniforms.resolution.value.set(window.innerWidth, window.innerHeight);
        this.composer.addPass(this.underwaterPass);

        this.composer.addPass(new OutputPass());
    }

    initAudio() {
        this.rainAudioPool = Array.from({ length: 2 }, () => {
            const audio = new Audio(RAIN_AUDIO_URL);
            audio.loop = false;
            audio.preload = 'auto';
            audio.volume = 0;
            audio.crossOrigin = 'anonymous';
            return audio;
        });

        this.thunderAudioPool = Array.from({ length: 3 }, () => {
            const audio = new Audio(THUNDER_AUDIO_URL);
            audio.preload = 'auto';
            audio.crossOrigin = 'anonymous';
            return audio;
        });
    }

    createRainShader() {
        return {
            uniforms: {
                tDiffuse: { value: null },
                time: { value: 0 },
                screenIntensity: { value: this.params.rainScreenIntensity },
                veilIntensity: { value: this.params.rainVeilIntensity },
                dropSize: { value: this.params.rainDropSize },
                rainSpeed: { value: this.params.rainSpeed },
                resolution: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) }
            },
            vertexShader: `
                varying vec2 vUv;

                void main() {
                    vUv = uv;
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }
            `,
            fragmentShader: `
                uniform sampler2D tDiffuse;
                uniform float time;
                uniform float screenIntensity;
                uniform float veilIntensity;
                uniform float dropSize;
                uniform float rainSpeed;
                uniform vec2 resolution;

                varying vec2 vUv;

                float hash11(float p) {
                    p = fract(p * 0.1031);
                    p *= p + 33.33;
                    p *= p + p;
                    return fract(p);
                }

                float hash21(vec2 p) {
                    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
                    p3 += dot(p3, p3.yzx + 33.33);
                    return fract((p3.x + p3.y) * p3.z);
                }

                vec3 hash31(float p) {
                    vec3 p3 = fract(vec3(p) * vec3(0.1031, 0.11369, 0.13787));
                    p3 += dot(p3, p3.yzx + 19.19);
                    return fract(vec3(
                        (p3.x + p3.y) * p3.z,
                        (p3.x + p3.z) * p3.y,
                        (p3.y + p3.z) * p3.x
                    ));
                }

                float easeOutCubic(float x) {
                    float inv = 1.0 - clamp(x, 0.0, 1.0);
                    return 1.0 - inv * inv * inv;
                }

                vec2 dropLayer(vec2 uv, float t, float sizeFactor) {
                    vec2 grid = vec2(9.0, 4.0) / mix(0.7, 1.45, sizeFactor);
                    vec2 p = uv * grid;
                    vec2 cell = floor(p);
                    vec2 local = fract(p) - 0.5;
                    vec3 n = hash31(cell.x * 53.17 + cell.y * 417.43);

                    float rate = (0.45 + n.z * 0.95) * mix(0.82, 1.45, sizeFactor);
                    float cycle = t * rate + n.z * 11.0;
                    float phase = fract(cycle);

                    vec2 spawn = (n.xy - 0.5) * vec2(0.72, 0.28);
                    float onset = smoothstep(0.0, 0.07, phase);
                    float lifeFade = 1.0 - smoothstep(0.52, 0.82, phase);
                    float fall = easeOutCubic(smoothstep(0.02, 0.58, phase));
                    float fallDistance = mix(0.9, 2.15, n.y) * mix(0.85, 1.4, sizeFactor) * fall;
                    vec2 center = vec2(spawn.x, 0.62 + spawn.y - fallDistance);

                    vec2 delta = local - center;
                    float aspect = mix(0.8, 1.45, n.x);
                    float bodyRadius = mix(0.18, 0.3, sizeFactor);
                    float body = smoothstep(bodyRadius, 0.03, length(delta * vec2(aspect, 1.0)));

                    float tail = smoothstep(mix(0.06, 0.095, sizeFactor), 0.0, abs(delta.x)) *
                        smoothstep(0.04, -0.12, delta.y) *
                        smoothstep(-0.72, -0.04, delta.y) *
                        smoothstep(0.04, 0.18, phase);

                    float spitSeed = hash21(cell + floor(cycle) + 3.7);
                    float spitY = center.y + 0.18 + fract(local.y * 3.7 + spitSeed) * 0.42;
                    float spit = smoothstep(mix(0.06, 0.11, sizeFactor), 0.0, length(local - vec2(center.x + (spitSeed - 0.5) * 0.14, spitY)));
                    spit *= smoothstep(0.02, 0.14, phase) * (1.0 - smoothstep(0.18, 0.34, phase));

                    float impactFlash = smoothstep(0.14, 0.0, phase) * smoothstep(0.24, 0.02, length(local - vec2(spawn.x, 0.58 + spawn.y)));
                    float mask = (max(body, tail * 0.9) * onset + spit * 0.55 + impactFlash * 0.7) * lifeFade;
                    float trail = tail * onset * lifeFade;
                    return vec2(mask, trail);
                }

                vec2 drops(vec2 uv, float t, float l0, float l1, float l2, float sizeFactor) {
                    vec2 m1 = dropLayer(uv, t, sizeFactor) * l1;
                    vec2 m2 = dropLayer(uv * 1.85, t, sizeFactor * 0.82) * l2;

                    float c = m1.x + m2.x;
                    c = smoothstep(0.3, 1.0, c);

                    float trail = max(m1.y * l1, m2.y * l2);
                    return vec2(c, trail);
                }

                vec3 impactLayer(vec2 uv, float t, float rainAmount, float sizeFactor) {
                    vec2 grid = vec2(11.0, 6.0) / mix(0.75, 1.35, sizeFactor);
                    vec2 p = uv * grid;
                    vec2 cell = floor(p);
                    vec2 local = fract(p) - 0.5;
                    vec3 n = hash31(cell.x * 97.13 + cell.y * 413.71);

                    float rate = (1.3 + n.z * 2.4) * mix(0.95, 1.55, sizeFactor);
                    float cycle = t * rate + n.x * 7.13 + n.y * 3.17;
                    float phase = fract(cycle);
                    vec2 center = (n.xy - 0.5) * vec2(0.72, 0.36);
                    float lifeFade = 1.0 - smoothstep(0.28, 0.56, phase);
                    center.y += easeOutCubic(smoothstep(0.01, 0.36, phase)) * mix(0.9, 1.45, sizeFactor);
                    vec2 d = local - center;
                    float radius = mix(0.012, mix(0.18, 0.32, sizeFactor), smoothstep(0.0, 0.22, phase));

                    float flash = smoothstep(0.09, 0.0, phase) * smoothstep(0.18, 0.015, length(d));
                    float ring = smoothstep(0.025, 0.0, abs(length(d) - radius)) * (1.0 - smoothstep(0.05, 0.24, phase));
                    float tail = smoothstep(0.055, 0.0, abs(d.x)) *
                        smoothstep(0.02, -0.12, d.y) *
                        smoothstep(-0.6, -0.04, d.y) *
                        smoothstep(0.02, 0.18, phase);
                    float sideSplash = smoothstep(0.055, 0.0, abs(d.y + 0.02)) *
                        smoothstep(0.16, 0.02, abs(abs(d.x) - mix(0.06, 0.22, phase))) *
                        (1.0 - smoothstep(0.06, 0.2, phase));

                    float mask = (flash + ring * 0.55 + tail * 0.65 + sideSplash * 0.4) * step(0.64, n.z) * rainAmount * lifeFade;
                    vec2 dir = normalize(d + vec2(0.0001));
                    return vec3(mask, dir * mask * (0.018 + flash * 0.028));
                }

                float rainVeil(vec2 uv, float t, float rainAmount) {
                    float accum = 0.0;
                    for (int i = 0; i < 4; i++) {
                        float fi = float(i);
                        float scale = 18.0 + fi * 11.0;
                        float speed = 2.0 + fi * 0.9;
                        float slant = 0.16 + fi * 0.07;
                        vec2 p = uv;
                        p.x += p.y * slant;
                        p.y += t * speed;
                        p.x += sin(p.y * (7.0 + fi * 2.3) + fi * 11.7) * (0.015 + fi * 0.004);

                        vec2 layerUv = p * scale;
                        vec2 cell = floor(layerUv);
                        vec2 local = fract(layerUv) - 0.5;
                        vec3 n = hash31(cell.x * (41.0 + fi * 13.0) + cell.y * (289.0 + fi * 71.0) + fi * 19.0);

                        float lane = (n.x - 0.5) * 0.62;
                        float width = mix(0.01, 0.045, n.y * n.y);
                        float length = mix(0.24, 0.95, n.x);
                        float bend = sin((cell.y + t * speed * 8.0) * (0.9 + n.z * 1.6) + n.x * 6.2831) * 0.18;
                        float dx = local.x - lane - bend * (0.15 + fi * 0.05);
                        float dy = local.y + (n.z - 0.5) * 0.3;

                        float streak = smoothstep(width, width * 0.15, abs(dx));
                        streak *= smoothstep(length, length * 0.12, abs(dy) * 2.0);

                        float breakup = smoothstep(0.2, 0.85, sin((dy + n.y * 2.0) * 18.0 + n.z * 12.0) * 0.5 + 0.5);
                        float flicker = 0.35 + 0.65 * fract(n.z * 31.7 + t * (4.0 + n.x * 3.0) + fi * 2.1);
                        float density = step(0.34 - fi * 0.05, n.y);
                        streak *= mix(1.0, breakup, 0.55) * flicker * density;

                        accum += streak * (0.52 - fi * 0.08);
                    }

                    return accum * smoothstep(0.08, 0.95, rainAmount);
                }

                void main() {
                    vec2 uv = vUv;
                    vec2 centeredUv = (uv - 0.5) * vec2(resolution.x / max(resolution.y, 1.0), 1.0);
                    float screenAmount = clamp(screenIntensity / 1.5, 0.0, 1.0);
                    float veilAmount = clamp(veilIntensity / 1.5, 0.0, 1.0);
                    float sizeFactor = clamp((dropSize - 0.4) / 1.4, 0.0, 1.0);
                    float rainAmount = max(screenAmount, veilAmount);
                    float t = time * rainSpeed * 0.18;

                    float staticLayer = 0.0;
                    float densityScale = mix(1.2, 0.55, sizeFactor);
                    float layer1 = smoothstep(0.08, 0.55, screenAmount) * densityScale;
                    float layer2 = smoothstep(0.25, 0.95, screenAmount) * densityScale;

                    vec2 c = drops(centeredUv * 0.9, t, staticLayer, layer1, layer2, sizeFactor);
                    vec3 impact = impactLayer(centeredUv * vec2(1.0, 1.2), t * 2.2, screenAmount, sizeFactor);
                    float veil = rainVeil(centeredUv * vec2(1.0, 1.4), time * rainSpeed * 0.55, veilAmount);
                    vec2 e = vec2(0.0015, 0.0);
                    float cx = drops(centeredUv + e, t, staticLayer, layer1, layer2, sizeFactor).x;
                    float cy = drops(centeredUv + e.yx, t, staticLayer, layer1, layer2, sizeFactor).x;
                    vec2 normal = vec2(cx - c.x, cy - c.x) + impact.yz;

                    float maxBlur = mix(0.002, 0.009, rainAmount);
                    float minBlur = 0.001;
                    float focus = mix(maxBlur - c.y * 0.5, minBlur, smoothstep(0.05, 0.2, c.x + impact.x * 0.5));

                    vec2 texel = 1.0 / max(resolution, vec2(1.0));
                    vec2 distortion = normal * (0.35 + focus * 48.0 + impact.x * 1.6);

                    vec3 base =
                        texture2D(tDiffuse, uv + distortion).rgb * 0.4 +
                        texture2D(tDiffuse, uv + distortion + vec2(texel.x * focus * 24.0, 0.0)).rgb * 0.15 +
                        texture2D(tDiffuse, uv + distortion - vec2(texel.x * focus * 24.0, 0.0)).rgb * 0.15 +
                        texture2D(tDiffuse, uv + distortion + vec2(0.0, texel.y * focus * 24.0)).rgb * 0.15 +
                        texture2D(tDiffuse, uv + distortion - vec2(0.0, texel.y * focus * 24.0)).rgb * 0.15;

                    vec3 sharp = texture2D(tDiffuse, uv + distortion * 0.6).rgb;
                    vec3 col = mix(base, sharp, smoothstep(0.04, 0.22, c.x));

                    vec3 rainTint = vec3(0.86, 0.91, 0.95);
                    col = mix(col, col * 0.88 + rainTint * 0.12, clamp(c.x * 0.65 + c.y * 0.3 + impact.x * 0.4, 0.0, 1.0));
                    col += c.y * rainTint * 0.08 * screenAmount;
                    col += impact.x * rainTint * 0.18 * screenAmount;
                    col += veil * rainTint * (0.12 + veilAmount * 0.18);
                    col = mix(col, col * 0.94 + rainTint * 0.06, veil * 0.18);
                    col = mix(texture2D(tDiffuse, uv).rgb, col, clamp(rainAmount * 1.1, 0.0, 1.0));

                    gl_FragColor = vec4(col, 1.0);
                }
            `
        };
    }

    createVolumetricFogShader() {
        return {
            uniforms: {
                tDiffuse: { value: null },
                tDepth: { value: null },
                resolution: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) },
                cameraNear: { value: this.camera?.near ?? 1 },
                cameraFar: { value: this.camera?.far ?? 20000 },
                projectionMatrixInverse: { value: new THREE.Matrix4() },
                viewMatrixInverse: { value: new THREE.Matrix4() },
                cameraWorldPosition: { value: new THREE.Vector3() },
                fogColor: { value: new THREE.Color(0x9ec5db) },
                horizonColor: { value: new THREE.Color(0xcfe0ee) },
                fogDensity: { value: 0.0 },
                fogHeight: { value: this.params.fogHeight },
                fogRange: { value: this.params.fogRange },
                time: { value: 0 }
            },
            vertexShader: `
                varying vec2 vUv;

                void main() {
                    vUv = uv;
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }
            `,
            fragmentShader: `
                uniform sampler2D tDiffuse;
                uniform sampler2D tDepth;
                uniform vec2 resolution;
                uniform mat4 projectionMatrixInverse;
                uniform mat4 viewMatrixInverse;
                uniform vec3 cameraWorldPosition;
                uniform vec3 fogColor;
                uniform vec3 horizonColor;
                uniform float fogDensity;
                uniform float fogHeight;
                uniform float fogRange;
                uniform float time;

                varying vec2 vUv;

                float hash21(vec2 p) {
                    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
                    p3 += dot(p3, p3.yzx + 33.33);
                    return fract((p3.x + p3.y) * p3.z);
                }

                vec3 reconstructWorldPosition(vec2 uv, float depth) {
                    float z = depth * 2.0 - 1.0;
                    vec4 clipPosition = vec4(uv * 2.0 - 1.0, z, 1.0);
                    vec4 viewPosition = projectionMatrixInverse * clipPosition;
                    viewPosition /= max(viewPosition.w, 0.0001);
                    vec4 worldPosition = viewMatrixInverse * viewPosition;
                    return worldPosition.xyz;
                }

                float sampleMediumDensity(vec3 samplePosition, float traveledDistance) {
                    float seaLevel = 2.0;
                    float verticalOffset = max(samplePosition.y - seaLevel, 0.0);
                    float heightFalloff = mix(0.08, 0.02, fogHeight);
                    float heightMask = exp(-verticalOffset * heightFalloff);

                    float seaMask = smoothstep(210.0, -12.0, samplePosition.y);
                    float distanceMask = smoothstep(120.0, mix(900.0, 5400.0, fogRange), traveledDistance);
                    float upperFade = 1.0 - smoothstep(
                        mix(120.0, 260.0, fogHeight),
                        mix(360.0, 760.0, fogHeight),
                        samplePosition.y
                    );

                    float windNoise = hash21(samplePosition.xz * 0.0008 + vec2(time * 0.012, -time * 0.008));
                    float breakup = mix(0.82, 1.14, windNoise);

                    return fogDensity * heightMask * seaMask * distanceMask * upperFade * breakup;
                }

                void main() {
                    vec3 base = texture2D(tDiffuse, vUv).rgb;
                    float depth = texture2D(tDepth, vUv).x;

                    if (fogDensity <= 0.00001) {
                        gl_FragColor = vec4(base, 1.0);
                        return;
                    }

                    float sceneDepth = depth < 0.99999 ? depth : 0.99999;
                    vec3 endPosition = reconstructWorldPosition(vUv, sceneDepth);
                    vec3 ray = endPosition - cameraWorldPosition;
                    float rayLength = length(ray);

                    if (depth >= 0.99999) {
                        vec3 farPosition = reconstructWorldPosition(vUv, 0.99999);
                        ray = farPosition - cameraWorldPosition;
                        rayLength = min(length(ray), mix(2200.0, 6400.0, fogRange));
                    }

                    if (rayLength <= 0.0001) {
                        gl_FragColor = vec4(base, 1.0);
                        return;
                    }

                    vec3 rayDirection = ray / rayLength;
                    const int STEP_COUNT = 12;
                    float stepLength = rayLength / float(STEP_COUNT);
                    float transmittance = 1.0;
                    vec3 inscattering = vec3(0.0);

                    for (int i = 0; i < STEP_COUNT; i++) {
                        float jitter = hash21(gl_FragCoord.xy + float(i) * 13.37 + time * 24.0);
                        float traveled = (float(i) + 0.35 + jitter * 0.45) * stepLength;
                        vec3 samplePosition = cameraWorldPosition + rayDirection * traveled;
                        float localDensity = sampleMediumDensity(samplePosition, traveled);

                        vec3 localTint = mix(horizonColor, fogColor, smoothstep(-8.0, 140.0, samplePosition.y));
                        float extinction = 1.0 - exp(-localDensity * stepLength);
                        inscattering += transmittance * localTint * extinction;
                        transmittance *= exp(-localDensity * stepLength);
                    }

                    vec3 color = base * transmittance + inscattering;

                    gl_FragColor = vec4(color, 1.0);
                }
            `
        };
    }

    createSnowShader() {
        return {
            uniforms: {
                tDiffuse: { value: null },
                time: { value: 0 },
                intensity: { value: this.params.snowIntensity },
                snowSpeed: { value: this.params.snowSpeed },
                resolution: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) }
            },
            vertexShader: `
                varying vec2 vUv;

                void main() {
                    vUv = uv;
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }
            `,
            fragmentShader: `
                uniform sampler2D tDiffuse;
                uniform float time;
                uniform float intensity;
                uniform float snowSpeed;
                uniform vec2 resolution;

                varying vec2 vUv;

                float rnd(float x) {
                    return fract(sin(dot(vec2(x + 47.49, 38.2467 / (x + 2.3)), vec2(12.9898, 78.233))) * 43758.5453);
                }

                float drawCircle(vec2 uv, vec2 center, float radius) {
                    return 1.0 - smoothstep(0.0, radius, length(uv - center));
                }

                float snowField(vec2 uv, float t, float amount, float aspect) {
                    float snow = 0.0;
                    float blizzardFactor = mix(0.08, 0.3, amount);
                    int flakeCount = 220;

                    for (int i = 0; i < 220; i++) {
                        if (i >= flakeCount) break;
                        float j = float(i);
                        float baseRnd = rnd(cos(j));
                        float speed = (0.3 + baseRnd * (0.7 + 0.5 * cos(j / 55.0))) * mix(0.7, 1.65, amount);
                        float radius = (0.001 + speed * 0.012) * mix(0.7, 1.18, amount);
                        vec2 center = vec2(
                            ((0.25 - uv.y) * blizzardFactor + rnd(j) + 0.08 * cos(t * 0.7 + sin(j))) * aspect,
                            mod(sin(j) - speed * (t * 1.5 * (0.1 + blizzardFactor)), 1.35) - 0.25
                        );

                        float flake = drawCircle(uv, center, radius);
                        snow += flake * (0.035 + speed * 0.04);
                    }

                    return snow;
                }

                void main() {
                    vec2 uv = vUv;
                    float aspect = resolution.x / max(resolution.y, 1.0);
                    vec2 snowUv = vec2(vUv.x * aspect, vUv.y);
                    float snowAmount = clamp(intensity / 1.5, 0.0, 1.0);
                    float t = time * snowSpeed;
                    float snow = snowField(snowUv, t, snowAmount, aspect);
                    float snowMask = clamp(snow * mix(0.45, 1.15, snowAmount), 0.0, 1.0);
                    float atmosphere = (1.0 - vUv.y) * 0.12 * snowAmount;

                    vec3 base = texture2D(tDiffuse, vUv).rgb;
                    vec3 snowTint = vec3(0.92, 0.95, 1.0);
                    base = mix(base, base * 0.96 + snowTint * 0.04, snowAmount * 0.1);
                    base += snowTint * snowMask;
                    base += vec3(0.16, 0.28, 0.4) * atmosphere;

                    gl_FragColor = vec4(base, 1.0);
                }
            `
        };
    }

    createUnderwaterShader() {
        return {
            uniforms: {
                tDiffuse: { value: null },
                time: { value: 0 },
                underwaterAmount: { value: 0 },
                underwaterDepth: { value: 0 },
                resolution: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) },
                waterTint: { value: new THREE.Color(0x2a7698) }
            },
            vertexShader: `
                varying vec2 vUv;

                void main() {
                    vUv = uv;
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }
            `,
            fragmentShader: `
                uniform sampler2D tDiffuse;
                uniform float time;
                uniform float underwaterAmount;
                uniform float underwaterDepth;
                uniform vec2 resolution;
                uniform vec3 waterTint;

                varying vec2 vUv;

                float hash21(vec2 p) {
                    p = fract(p * vec2(123.34, 456.21));
                    p += dot(p, p + 78.233);
                    return fract(p.x * p.y);
                }

                void main() {
                    vec2 uv = vUv;
                    vec2 centeredUv = uv - 0.5;
                    float aspect = resolution.x / max(resolution.y, 1.0);
                    vec2 radialUv = vec2(centeredUv.x * aspect, centeredUv.y);

                    float wave = sin(uv.y * 46.0 + time * 1.6) * 0.0017 +
                        sin(uv.x * 62.0 - time * 1.1) * 0.0013;
                    float wobble = sin((uv.x + uv.y) * 18.0 + time * 1.9) * 0.0016;
                    vec2 distortedUv = uv + vec2(wave, wobble) * underwaterAmount;
                    vec4 base = texture2D(tDiffuse, distortedUv);

                    float depthMix = clamp(underwaterDepth / 9.0, 0.0, 1.0);
                    float tintStrength = underwaterAmount * mix(0.18, 0.55, depthMix);
                    vec3 color = mix(base.rgb, waterTint, tintStrength);

                    float vignette = smoothstep(0.92, 0.28, dot(radialUv, radialUv));
                    color *= mix(1.0, vignette, underwaterAmount * 0.42);

                    float grain = (hash21(uv * resolution + time * 7.0) - 0.5) * 0.05;
                    color += grain * underwaterAmount * (0.35 + depthMix * 0.35);

                    gl_FragColor = vec4(color, base.a);
                }
            `
        };
    }
    
    async initSky() {
        this.sky = new Sky();
        this.sky.scale.setScalar(10000);
        this.sky.rotation.y = Math.PI;
        this.scene.add(this.sky);
        
        const skyUniforms = this.sky.material.uniforms;
        skyUniforms['turbidity'].value = this.params.turbidity;
        skyUniforms['rayleigh'].value = this.params.rayleigh;
        skyUniforms['mieCoefficient'].value = this.params.mieCoefficient;
        skyUniforms['mieDirectionalG'].value = this.params.mieDirectionalG;
        
        this.pmremGenerator = new THREE.PMREMGenerator(this.renderer);
    }

    initStars() {
        const starCount = 8000;
        const positions = new Float32Array(starCount * 3);
        const colors = new Float32Array(starCount * 3);
        const sizes = new Float32Array(starCount);
        const color = new THREE.Color();

        for (let i = 0; i < starCount; i++) {
            const radius = THREE.MathUtils.randFloat(2200, 4200);
            const theta = Math.random() * Math.PI * 2.0;
            const phi = THREE.MathUtils.randFloat(0.015, Math.PI * 0.49);
            const sinPhi = Math.sin(phi);
            const x = radius * sinPhi * Math.cos(theta);
            const y = radius * Math.cos(phi);
            const z = radius * sinPhi * Math.sin(theta);

            positions[i * 3] = x;
            positions[i * 3 + 1] = y;
            positions[i * 3 + 2] = z;

            color.setHSL(
                THREE.MathUtils.randFloat(0.52, 0.64),
                THREE.MathUtils.randFloat(0.15, 0.45),
                THREE.MathUtils.randFloat(0.72, 0.96)
            );
            colors[i * 3] = color.r;
            colors[i * 3 + 1] = color.g;
            colors[i * 3 + 2] = color.b;
            sizes[i] = Math.pow(Math.random(), 1.9);
        }

        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        geometry.setAttribute('sizeNoise', new THREE.BufferAttribute(sizes, 1));

        const material = new THREE.ShaderMaterial({
            uniforms: {
                time: { value: 0 },
                intensity: { value: this.params.starIntensity }
            },
            vertexShader: `
                attribute float sizeNoise;
                varying vec3 vColor;
                varying float vPulse;
                uniform float time;
                uniform float intensity;

                void main() {
                    vColor = color;
                    vPulse = fract(sizeNoise * 17.0 + time * (0.015 + sizeNoise * 0.035));
                    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
                    gl_Position = projectionMatrix * mvPosition;
                    float starSize = 2.8 + sizeNoise * 6.4;
                    float projectedSize = starSize * (6500.0 / -mvPosition.z) * (0.65 + intensity * 0.55);
                    gl_PointSize = max(1.6, projectedSize);
                }
            `,
            fragmentShader: `
                varying vec3 vColor;
                varying float vPulse;
                uniform float intensity;

                void main() {
                    vec2 p = gl_PointCoord - vec2(0.5);
                    float d = length(p);
                    float core = smoothstep(0.26, 0.0, d);
                    float glow = smoothstep(0.58, 0.06, d);
                    float halo = smoothstep(0.82, 0.16, d);
                    float twinkle = 0.8 + 0.2 * sin(vPulse * 6.2831);
                    float alpha = (core * 1.2 + glow * 0.65 + halo * 0.18) * twinkle * intensity;
                    if (alpha <= 0.001) discard;
                    gl_FragColor = vec4(vColor, alpha);
                }
            `,
            transparent: true,
            depthTest: true,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
            vertexColors: true
        });

        this.starField = new THREE.Points(geometry, material);
        this.starField.frustumCulled = false;
        this.scene.add(this.starField);
        this.updateStars();
    }

    initNightSky() {
        const moonTexture = this.createMoonTexture();
        const moonMaterial = new THREE.SpriteMaterial({
            map: moonTexture,
            color: 0xe9f0ff,
            transparent: true,
            depthWrite: false,
            depthTest: true,
            blending: THREE.NormalBlending
        });
        this.moonSprite = new THREE.Sprite(moonMaterial);
        this.moonSprite.scale.setScalar(490);
        this.scene.add(this.moonSprite);

        const moonGlowTexture = this.createMoonGlowTexture();
        const moonGlowMaterial = new THREE.SpriteMaterial({
            map: moonGlowTexture,
            color: 0xc6dbff,
            transparent: true,
            opacity: 0,
            depthWrite: false,
            depthTest: true,
            blending: THREE.AdditiveBlending
        });
        this.moonGlowSprite = new THREE.Sprite(moonGlowMaterial);
        this.moonGlowSprite.scale.setScalar(980);
        this.scene.add(this.moonGlowSprite);

        const galaxyTexture = this.createGalaxyTexture();
        const galaxyMaterial = new THREE.SpriteMaterial({
            map: galaxyTexture,
            color: 0xa7bedf,
            transparent: true,
            opacity: 0,
            depthWrite: false,
            depthTest: true,
            blending: THREE.AdditiveBlending
        });
        this.galaxyBand = new THREE.Sprite(galaxyMaterial);
        this.galaxyBand.scale.set(2600, 760, 1);
        this.scene.add(this.galaxyBand);
    }

    createMoonTexture() {
        const canvas = document.createElement('canvas');
        canvas.width = 256;
        canvas.height = 256;
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        ctx.save();
        ctx.translate(128, 128);

        ctx.beginPath();
        ctx.arc(-8, 0, 76, 0, Math.PI * 2);
        ctx.closePath();
        ctx.clip();

        const moonFill = ctx.createLinearGradient(-76, -48, 26, 44);
        moonFill.addColorStop(0, 'rgba(250,252,255,1)');
        moonFill.addColorStop(0.55, 'rgba(232,239,250,1)');
        moonFill.addColorStop(1, 'rgba(198,212,232,1)');
        ctx.fillStyle = moonFill;
        ctx.beginPath();
        ctx.arc(-8, 0, 76, 0, Math.PI * 2);
        ctx.fill();

        ctx.globalCompositeOperation = 'destination-out';
        ctx.beginPath();
        ctx.arc(42, 0, 76, 0, Math.PI * 2);
        ctx.fill();

        ctx.globalCompositeOperation = 'multiply';
        ctx.fillStyle = 'rgba(138,152,182,0.12)';
        ctx.beginPath();
        ctx.arc(-40, -18, 7, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(-34, 20, 9, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        const texture = new THREE.CanvasTexture(canvas);
        texture.colorSpace = THREE.SRGBColorSpace;
        return texture;
    }

    createMoonGlowTexture() {
        const canvas = document.createElement('canvas');
        canvas.width = 512;
        canvas.height = 512;
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        const glow = ctx.createRadialGradient(256, 256, 0, 256, 256, 256);
        glow.addColorStop(0, 'rgba(255,255,255,0.62)');
        glow.addColorStop(0.12, 'rgba(236,242,255,0.46)');
        glow.addColorStop(0.28, 'rgba(198,216,255,0.26)');
        glow.addColorStop(0.52, 'rgba(148,184,255,0.11)');
        glow.addColorStop(0.78, 'rgba(120,160,255,0.05)');
        glow.addColorStop(1, 'rgba(120,160,255,0)');
        ctx.fillStyle = glow;
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        const texture = new THREE.CanvasTexture(canvas);
        texture.colorSpace = THREE.SRGBColorSpace;
        return texture;
    }

    createGalaxyTexture() {
        const canvas = document.createElement('canvas');
        canvas.width = 1024;
        canvas.height = 256;
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        const base = ctx.createLinearGradient(0, canvas.height * 0.5, canvas.width, canvas.height * 0.5);
        base.addColorStop(0, 'rgba(0,0,0,0)');
        base.addColorStop(0.16, 'rgba(110,130,170,0.04)');
        base.addColorStop(0.35, 'rgba(165,180,215,0.1)');
        base.addColorStop(0.5, 'rgba(235,235,255,0.16)');
        base.addColorStop(0.68, 'rgba(165,180,215,0.1)');
        base.addColorStop(0.84, 'rgba(110,130,170,0.04)');
        base.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = base;
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        for (let i = 0; i < 1800; i++) {
            const x = Math.random() * canvas.width;
            const yCenter = canvas.height * 0.52 + Math.sin(x * 0.008) * 22.0;
            const y = yCenter + (Math.random() - 0.5) * 120;
            const alpha = Math.random() * Math.random() * 0.7;
            const size = Math.random() < 0.06 ? 2.2 : 1.0;
            ctx.fillStyle = `rgba(255,255,255,${alpha})`;
            ctx.fillRect(x, y, size, size);
        }

        const blur = ctx.createRadialGradient(canvas.width * 0.5, canvas.height * 0.5, 10, canvas.width * 0.5, canvas.height * 0.5, canvas.width * 0.5);
        blur.addColorStop(0, 'rgba(210,220,255,0.09)');
        blur.addColorStop(0.5, 'rgba(150,170,220,0.04)');
        blur.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = blur;
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        const texture = new THREE.CanvasTexture(canvas);
        texture.colorSpace = THREE.SRGBColorSpace;
        return texture;
    }

    initClouds() {
        this.cloudGroup = new THREE.Group();
        this.cloudGroup.position.y = 40;
        this.addCloudPlaneLayer({
            radius: 5200,
            y: 120,
            opacity: 0.42,
            scale: 1450,
            detailScale: 3.4,
            softness: 0.19,
            edgeFade: 0.2,
            shadowStrength: 0.36,
            highlightStrength: 0.18,
            erosionStrength: 0.2,
            ridgeStrength: 0.08,
            driftX: 0.0045,
            driftY: 0.0012,
            rotationZ: 0.06
        });
        this.addCloudPlaneLayer({
            radius: 4300,
            y: 250,
            opacity: 0.28,
            scale: 980,
            detailScale: 4.1,
            softness: 0.17,
            edgeFade: 0.24,
            shadowStrength: 0.42,
            highlightStrength: 0.24,
            erosionStrength: 0.28,
            ridgeStrength: 0.12,
            driftX: -0.0032,
            driftY: 0.0018,
            rotationZ: -0.04
        });
        this.addCloudPlaneLayer({
            radius: 3400,
            y: 360,
            opacity: 0.18,
            scale: 760,
            detailScale: 4.8,
            softness: 0.16,
            edgeFade: 0.28,
            shadowStrength: 0.46,
            highlightStrength: 0.3,
            erosionStrength: 0.34,
            ridgeStrength: 0.16,
            driftX: 0.0021,
            driftY: -0.0014,
            rotationZ: 0.1
        });

        this.scene.add(this.cloudGroup);
        this.initLightningCloudGlow();
        this.setCloudElevation(this.params.cloudElevation);
        this.setCloudCoverage(this.params.cloudCoverage);
        this.updateClouds();
    }

    initLightningCloudGlow() {
        const glowTexture = this.createLightningGlowTexture();
        const material = new THREE.SpriteMaterial({
            map: glowTexture,
            color: 0xddeeff,
            transparent: true,
            opacity: 0,
            depthWrite: false,
            depthTest: false,
            fog: false,
            blending: THREE.AdditiveBlending
        });

        this.lightningCloudGlow = new THREE.Sprite(material);
        this.lightningCloudGlow.scale.set(900, 900, 1);
        this.lightningCloudGlow.position.set(-420, 210, -760);
        this.lightningCloudGlow.visible = false;
        this.scene.add(this.lightningCloudGlow);
    }

    addCloudPlaneLayer(config) {
        const material = new THREE.ShaderMaterial({
            uniforms: {
                tintColor: { value: new THREE.Color(0xffffff) },
                layerOpacity: { value: config.opacity },
                time: { value: 0 },
                cloudCoverage: { value: this.params.cloudCoverage },
                cloudDensity: { value: this.params.cloudDensity },
                scale: { value: config.scale },
                detailScale: { value: config.detailScale },
                softness: { value: config.softness },
                edgeFade: { value: config.edgeFade },
                drift: { value: new THREE.Vector2(config.driftX, config.driftY) },
                seed: { value: Math.random() * 100.0 },
                lightDir: { value: new THREE.Vector2(1, 0) },
                shadowStrength: { value: config.shadowStrength ?? 0.42 },
                highlightStrength: { value: config.highlightStrength ?? 0.26 },
                erosionStrength: { value: config.erosionStrength ?? 0.24 },
                ridgeStrength: { value: config.ridgeStrength ?? 0.12 }
            },
            vertexShader: `
                varying vec2 vPlaneUv;
                varying vec3 vWorldPos;

                void main() {
                    vPlaneUv = uv;
                    vWorldPos = (modelMatrix * vec4(position, 1.0)).xyz;
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }
            `,
            fragmentShader: `
                uniform vec3 tintColor;
                uniform float layerOpacity;
                uniform float time;
                uniform float cloudCoverage;
                uniform float cloudDensity;
                uniform float scale;
                uniform float detailScale;
                uniform float softness;
                uniform float edgeFade;
                uniform vec2 drift;
                uniform float seed;
                uniform vec2 lightDir;
                uniform float shadowStrength;
                uniform float highlightStrength;
                uniform float erosionStrength;
                uniform float ridgeStrength;

                varying vec2 vPlaneUv;
                varying vec3 vWorldPos;

                float hash(vec2 p) {
                    p = fract(p * vec2(123.34, 456.21));
                    p += dot(p, p + 78.233);
                    return fract(p.x * p.y);
                }

                float noise(vec2 p) {
                    vec2 i = floor(p);
                    vec2 f = fract(p);
                    vec2 u = f * f * (3.0 - 2.0 * f);

                    return mix(
                        mix(hash(i + vec2(0.0, 0.0)), hash(i + vec2(1.0, 0.0)), u.x),
                        mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
                        u.y
                    );
                }

                float fbm(vec2 p) {
                    float value = 0.0;
                    float amplitude = 0.5;
                    for (int i = 0; i < 5; i++) {
                        value += amplitude * noise(p);
                        p = p * 2.03 + vec2(11.7, 7.3);
                        amplitude *= 0.5;
                    }
                    return value;
                }

                void main() {
                    vec2 flow = vWorldPos.xz / scale + drift * time + vec2(seed);
                    float base = fbm(flow);
                    float detail = fbm(flow * detailScale + vec2(0.0, time * 0.01));
                    float wisps = fbm(flow * (detailScale * 0.55) - vec2(time * 0.008, 0.0));
                    float billow = fbm(flow * 0.62 + vec2(seed * 0.37, -seed * 0.21));
                    float erosion = fbm(flow * (detailScale * 1.8) + vec2(seed * 1.3, -seed * 0.9));
                    float ridge = 1.0 - abs(fbm(flow * (detailScale * 0.85) - vec2(seed * 0.6, seed * 0.45)) * 2.0 - 1.0);
                    float shape = base * 0.5 + billow * 0.24 + detail * 0.14 + wisps * 0.12;
                    shape -= erosion * erosionStrength;
                    shape += ridge * ridgeStrength;

                    float densityBoost = mix(0.78, 1.28, clamp(cloudDensity, 0.0, 1.0));
                    float coverageThreshold = mix(0.84, 0.34, clamp(cloudCoverage, 0.0, 1.0));
                    float alpha = smoothstep(
                        coverageThreshold + softness,
                        coverageThreshold - softness,
                        shape * densityBoost
                    );

                    float core = smoothstep(
                        coverageThreshold + softness * 0.4,
                        coverageThreshold - softness * 1.4,
                        shape * densityBoost
                    );
                    vec2 eps = vec2(0.03, 0.0);
                    float sampleA = fbm((flow + lightDir * eps.x) * 0.62 + vec2(seed * 0.37, -seed * 0.21));
                    float sampleB = fbm((flow - lightDir * eps.x) * 0.62 + vec2(seed * 0.37, -seed * 0.21));
                    float lightEdge = clamp((sampleA - sampleB) * 3.2 + 0.5, 0.0, 1.0);
                    float underside = 1.0 - smoothstep(0.32, 0.88, shape);

                    float radial = distance(vPlaneUv, vec2(0.5)) * 2.0;
                    float edgeMask = 1.0 - smoothstep(1.0 - edgeFade, 1.0, radial);
                    alpha *= edgeMask * layerOpacity;
                    if (alpha <= 0.001) discard;

                    vec3 shadowColor = tintColor * (1.0 - shadowStrength);
                    vec3 litColor = mix(shadowColor, tintColor, core);
                    litColor += tintColor * lightEdge * core * highlightStrength;
                    litColor = mix(litColor, shadowColor, underside * shadowStrength * 0.7);
                    gl_FragColor = vec4(litColor, alpha);
                }
            `,
            transparent: true,
            side: THREE.DoubleSide,
            depthWrite: false,
            fog: false
        });

        const geometry = new THREE.CircleGeometry(config.radius, 96);
        const mesh = new THREE.Mesh(geometry, material);
        mesh.rotation.x = -Math.PI / 2;
        mesh.rotation.z = config.rotationZ ?? 0;
        mesh.position.y = config.y;
        this.cloudLayers.push({
            mesh,
            material,
            baseOpacity: config.opacity,
            baseY: config.y,
            baseScale: config.scale,
            baseSoftness: config.softness,
            baseShadowStrength: config.shadowStrength ?? 0.42,
            baseHighlightStrength: config.highlightStrength ?? 0.26,
            baseErosionStrength: config.erosionStrength ?? 0.24,
            baseRidgeStrength: config.ridgeStrength ?? 0.12
        });
        this.cloudGroup.add(mesh);
    }

    initFog() {
        const fogTexture = this.createFogTexture();
        const lowFogTexture = this.createLowFogTexture();
        this.fogGroup = new THREE.Group();
        this.fogLayers = [];

        const layerConfigs = [
            { width: 5200, height: 1800, y: 5, opacity: 0.18, speedX: 0.00022, speedY: 0.00004, rotation: 0.03, scale: 3.2, texture: lowFogTexture, low: true },
            { width: 4300, height: 1500, y: 11, opacity: 0.14, speedX: -0.00018, speedY: 0.00005, rotation: -0.04, scale: 2.8, texture: lowFogTexture, low: true },
            { width: 4600, height: 2400, y: 22, opacity: 0.2, speedX: 0.00045, speedY: 0.0001, rotation: 0.08, scale: 2.4, texture: fogTexture, low: false },
            { width: 3900, height: 1900, y: 52, opacity: 0.14, speedX: -0.00028, speedY: 0.00014, rotation: -0.05, scale: 2.1, texture: fogTexture, low: false }
        ];

        layerConfigs.forEach((config) => {
            const texture = config.texture.clone();
            texture.wrapS = THREE.RepeatWrapping;
            texture.wrapT = THREE.RepeatWrapping;
            texture.repeat.set(config.scale, config.low ? 1.1 : 1.4);
            texture.needsUpdate = true;

            const material = new THREE.MeshBasicMaterial({
                map: texture,
                alphaMap: texture,
                color: 0xdbe7ef,
                transparent: true,
                opacity: config.opacity,
                depthWrite: false,
                fog: false,
                side: THREE.DoubleSide,
                blending: THREE.NormalBlending
            });

            const geometry = new THREE.PlaneGeometry(config.width, config.height, 1, 1);
            const mesh = new THREE.Mesh(geometry, material);
            mesh.rotation.x = -Math.PI / 2;
            mesh.rotation.z = config.rotation;
            mesh.position.y = config.y;

            this.fogLayers.push({
                mesh,
                texture,
                baseY: config.y,
                baseOpacity: config.opacity,
                isLowLayer: config.low,
                speedX: config.speedX,
                speedY: config.speedY
            });

            this.fogGroup.add(mesh);
        });

        this.horizonFog = this.createHorizonFog();
        this.fogGroup.add(this.horizonFog);
        this.skyHazeBand = this.createSkyHazeBand();
        this.fogGroup.add(this.skyHazeBand);
        this.scene.add(this.fogGroup);
        this.updateFog();
    }

    createLightningGlowTexture() {
        const canvas = document.createElement('canvas');
        canvas.width = 256;
        canvas.height = 256;

        const context = canvas.getContext('2d');
        const gradient = context.createRadialGradient(128, 128, 0, 128, 128, 128);
        gradient.addColorStop(0, 'rgba(255,255,255,0.95)');
        gradient.addColorStop(0.18, 'rgba(220,236,255,0.85)');
        gradient.addColorStop(0.42, 'rgba(180,205,255,0.35)');
        gradient.addColorStop(0.72, 'rgba(120,155,255,0.08)');
        gradient.addColorStop(1, 'rgba(120,155,255,0)');
        context.fillStyle = gradient;
        context.fillRect(0, 0, canvas.width, canvas.height);

        const texture = new THREE.CanvasTexture(canvas);
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.needsUpdate = true;
        return texture;
    }

    createFogTexture() {
        const canvas = document.createElement('canvas');
        canvas.width = 512;
        canvas.height = 512;

        const context = canvas.getContext('2d');
        context.clearRect(0, 0, canvas.width, canvas.height);

        for (let i = 0; i < 42; i++) {
            const x = 30 + Math.random() * 452;
            const y = 40 + Math.random() * 432;
            const radius = 34 + Math.random() * 88;
            const gradient = context.createRadialGradient(x, y, 0, x, y, radius);

            gradient.addColorStop(0, 'rgba(255,255,255,0.82)');
            gradient.addColorStop(0.22, 'rgba(255,255,255,0.58)');
            gradient.addColorStop(0.58, 'rgba(255,255,255,0.16)');
            gradient.addColorStop(1, 'rgba(255,255,255,0)');

            context.fillStyle = gradient;
            context.fillRect(x - radius, y - radius, radius * 2, radius * 2);
        }

        const texture = new THREE.CanvasTexture(canvas);
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.needsUpdate = true;

        return texture;
    }

    createLowFogTexture() {
        const canvas = document.createElement('canvas');
        canvas.width = 512;
        canvas.height = 256;

        const context = canvas.getContext('2d');
        context.clearRect(0, 0, canvas.width, canvas.height);

        for (let i = 0; i < 30; i++) {
            const x = Math.random() * canvas.width;
            const y = 30 + Math.random() * 150;
            const radiusX = 80 + Math.random() * 140;
            const radiusY = 14 + Math.random() * 28;
            const gradient = context.createRadialGradient(x, y, 0, x, y, radiusX);

            gradient.addColorStop(0, 'rgba(255,255,255,0.58)');
            gradient.addColorStop(0.22, 'rgba(255,255,255,0.36)');
            gradient.addColorStop(0.6, 'rgba(255,255,255,0.12)');
            gradient.addColorStop(1, 'rgba(255,255,255,0)');

            context.save();
            context.translate(x, y);
            context.scale(1.0, radiusY / radiusX);
            context.translate(-x, -y);
            context.fillStyle = gradient;
            context.fillRect(x - radiusX, y - radiusX, radiusX * 2, radiusX * 2);
            context.restore();
        }

        const verticalFade = context.createLinearGradient(0, 0, 0, canvas.height);
        verticalFade.addColorStop(0, 'rgba(255,255,255,0)');
        verticalFade.addColorStop(0.18, 'rgba(255,255,255,0.55)');
        verticalFade.addColorStop(0.52, 'rgba(255,255,255,1)');
        verticalFade.addColorStop(0.86, 'rgba(255,255,255,0.42)');
        verticalFade.addColorStop(1, 'rgba(255,255,255,0)');
        context.globalCompositeOperation = 'destination-in';
        context.fillStyle = verticalFade;
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.globalCompositeOperation = 'source-over';

        const texture = new THREE.CanvasTexture(canvas);
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.needsUpdate = true;
        return texture;
    }

    createHorizonFogTexture() {
        const canvas = document.createElement('canvas');
        canvas.width = 64;
        canvas.height = 512;

        const context = canvas.getContext('2d');
        const gradient = context.createLinearGradient(0, 0, 0, canvas.height);
        gradient.addColorStop(0, 'rgba(255,255,255,0)');
        gradient.addColorStop(0.08, 'rgba(255,255,255,0.02)');
        gradient.addColorStop(0.2, 'rgba(255,255,255,0.12)');
        gradient.addColorStop(0.35, 'rgba(255,255,255,0.38)');
        gradient.addColorStop(0.5, 'rgba(255,255,255,0.55)');
        gradient.addColorStop(0.65, 'rgba(255,255,255,0.38)');
        gradient.addColorStop(0.8, 'rgba(255,255,255,0.12)');
        gradient.addColorStop(0.92, 'rgba(255,255,255,0.02)');
        gradient.addColorStop(1, 'rgba(255,255,255,0)');
        context.fillStyle = gradient;
        context.fillRect(0, 0, canvas.width, canvas.height);

        const texture = new THREE.CanvasTexture(canvas);
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.ClampToEdgeWrapping;
        texture.repeat.set(4, 1);
        texture.needsUpdate = true;
        return texture;
    }

    createSkyHazeTexture() {
        const canvas = document.createElement('canvas');
        canvas.width = 64;
        canvas.height = 512;

        const context = canvas.getContext('2d');
        const gradient = context.createLinearGradient(0, 0, 0, canvas.height);
        gradient.addColorStop(0, 'rgba(255,255,255,0)');
        gradient.addColorStop(0.06, 'rgba(255,255,255,0.01)');
        gradient.addColorStop(0.15, 'rgba(255,255,255,0.06)');
        gradient.addColorStop(0.28, 'rgba(255,255,255,0.18)');
        gradient.addColorStop(0.42, 'rgba(255,255,255,0.45)');
        gradient.addColorStop(0.55, 'rgba(255,255,255,0.62)');
        gradient.addColorStop(0.7, 'rgba(255,255,255,0.45)');
        gradient.addColorStop(0.85, 'rgba(255,255,255,0.12)');
        gradient.addColorStop(0.94, 'rgba(255,255,255,0.02)');
        gradient.addColorStop(1, 'rgba(255,255,255,0)');
        context.fillStyle = gradient;
        context.fillRect(0, 0, canvas.width, canvas.height);

        const texture = new THREE.CanvasTexture(canvas);
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.ClampToEdgeWrapping;
        texture.repeat.set(3, 1);
        texture.needsUpdate = true;
        return texture;
    }

    createHorizonFog() {
        const texture = this.createHorizonFogTexture();
        const material = new THREE.MeshBasicMaterial({
            map: texture,
            alphaMap: texture,
            color: 0xdde8f2,
            transparent: true,
            opacity: 0.38,
            fog: false,
            depthWrite: false,
            side: THREE.BackSide
        });

        const geometry = new THREE.CylinderGeometry(4700, 4700, 900, 72, 1, true);
        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.y = 130;
        mesh.renderOrder = -1;
        mesh.userData.texture = texture;
        return mesh;
    }

    createSkyHazeBand() {
        const texture = this.createSkyHazeTexture();
        const material = new THREE.MeshBasicMaterial({
            map: texture,
            alphaMap: texture,
            color: 0xdde8f2,
            transparent: true,
            opacity: 0.32,
            fog: false,
            depthWrite: false,
            side: THREE.BackSide,
            blending: THREE.NormalBlending
        });

        const geometry = new THREE.CylinderGeometry(5200, 5200, 1600, 72, 1, true);
        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.y = 420;
        mesh.renderOrder = -2;
        mesh.userData.texture = texture;
        return mesh;
    }
    
    async initWater() {
        const waterGeometry = new THREE.PlaneGeometry(10000, 10000, 128, 128);
        
        const waterNormals = await new Promise((resolve) => {
            new THREE.TextureLoader().load(
                '/textures/waternormals.jpg',
                (texture) => {
                    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
                    resolve(texture);
                }
            );
        });
        
        this.water = new Water(waterGeometry, {
            textureWidth: 512,
            textureHeight: 512,
            waterNormals: waterNormals,
            sunDirection: new THREE.Vector3(),
            sunColor: 0xffffff,
            waterColor: this.params.waterColor,
            distortionScale: 3.7,
            fog: true
        });
        
        this.water.rotation.x = -Math.PI / 2;
        this.water.position.y = -0.15;
        this.setWaterColor(this.params.waterColor);

        const baseWaterOnBeforeRender = this.water.onBeforeRender.bind(this.water);
        this.water.onBeforeRender = (...args) => {
            const starsWereVisible = this.starField?.visible ?? false;
            const moonWasVisible = this.moonSprite?.visible ?? false;
            const moonGlowWasVisible = this.moonGlowSprite?.visible ?? false;
            const galaxyWasVisible = this.galaxyBand?.visible ?? false;
            if (this.starField) {
                this.starField.visible = false;
            }
            if (this.moonSprite) {
                this.moonSprite.visible = false;
            }
            if (this.moonGlowSprite) {
                this.moonGlowSprite.visible = false;
            }
            if (this.galaxyBand) {
                this.galaxyBand.visible = false;
            }
            try {
                baseWaterOnBeforeRender(...args);
            } finally {
                if (this.starField) {
                    this.starField.visible = starsWereVisible;
                }
                if (this.moonSprite) {
                    this.moonSprite.visible = moonWasVisible;
                }
                if (this.moonGlowSprite) {
                    this.moonGlowSprite.visible = moonGlowWasVisible;
                }
                if (this.galaxyBand) {
                    this.galaxyBand.visible = galaxyWasVisible;
                }
            }
        };

        this.scene.add(this.water);
    }
    
    async initTerrain() {
        const terrainGen = new TerrainGenerator({
            size: 6800, // 地形平面尺寸
            segments: 280, // 网格细分数，越高细节越多
            maxHeight: 34, // 海平面以上的最大起伏高度
            waterLevel: 0, // 海平面基准高度
            underwaterDepthBias: 4.5, // 压低水下地形，避免近岸浅滩露出
            underwaterBiasFadeWidth: 8, // 水下额外下沉的过渡宽度
            landBias: 0.2, // 整体抬高陆地比例
            falloffStartRatio: 0.22, // 从中心向外开始下沉的起始比例
            maxLandRatio: 0.46, // 大陆海岸线的大致外缘比例
            edgeDepth: 12, // 海岸外侧向海底下沉的强度
            coreRadiusRatio: 0.24, // 中心高地区域半径比例
            continentLift: 0.55, // 中心大陆的额外抬升强度
            coastVariance: 0.05, // 海岸线起伏幅度
            outerShelfDepth: 4, // 外侧大陆架的额外下沉深度
            coastlineBlendWidth: 42, // 海岸向海底过渡的缓冲宽度
            satellite: {
                enabled: true,
                centerLon: 121.4737,
                centerLat: 31.2304,
                zoom: 15,
                grid: 5
            },
            seed: 23 // 固定随机种子，保证地形稳定复现
        });
        
        this.terrain = terrainGen.generate();
        this.scene.add(this.terrain);
        
        this.terrainGenerator = terrainGen;
    }

    async initWindTurbine() {
        this.windTurbine = new OffshoreWindTurbineAsset({
            position: new THREE.Vector3(280, 0, -2350),
            yaw: 0,
            scale: 0.68,
            rotorSpeed: 0.24
        });
        await this.windTurbine.load();
        this.windTurbine.addToScene(this.scene);
        this.windTurbine.faceDirection(this.sun);
    }
    
    async initVegetation() {
        const vegSystem = new VegetationSystem(this.terrainGenerator, {
            grassCount: 0, // 设为 0 时只使用 grassAreas
            shrubCount: 0, // 设为 0 时只使用 shrubPlacements
            lowPlantCount: 0, // 设为 0 时只使用 lowPlantPlacements
            treeCount: 0, // 设为 0 时只使用 treePlacements
            terrainSize: 2800, // 随机植被允许分布的范围
            waterLevel: 1, // 植被生成时参考的水位
            treePlacements: [ // 手动指定树木坐标
                { x: 0, z: 50, rotation: 0.4, scale: 1.6 },
                { x: 21, z: 32, rotation: 1.2, scale: 1.35 },
                // { x: -40, z: -150, rotation: 2.1, scale: 1.75 },
                // { x: 70, z: -70, rotation: 2.8, scale: 1.45 },
                // { x: 135, z: 15, rotation: 4.1, scale: 1.55 },
                // { x: 30, z: 120, rotation: 5.2, scale: 1.7 }
            ],
            shrubPlacements: [ // 手动指定灌木坐标
                { x: -210, z: -65, rotation: 0.3, scale: 1.05 },
                { x: -195, z: -75, rotation: 1.4, scale: 0.95 },
                // { x: -20, z: -95, rotation: 2.2, scale: 1.1 },
                // { x: 55, z: -5, rotation: 3.6, scale: 0.9 },
                // { x: 150, z: -55, rotation: 4.5, scale: 1.15 },
                // { x: 185, z: 75, rotation: 5.4, scale: 1.0 }
            ],
            lowPlantPlacements: [ // 手动指定低矮植物坐标
                { x: -235, z: -20, rotation: 0.6, scale: 0.58 },
                { x: -205, z: 15, rotation: 1.8, scale: 0.52 },
                // { x: -10, z: -20, rotation: 2.7, scale: 0.48 },
                // { x: 82, z: -132, rotation: 3.4, scale: 0.62 },
                // { x: 118, z: 58, rotation: 4.2, scale: 0.56 },
                // { x: 225, z: 18, rotation: 5.1, scale: 0.6 }
            ],
            grassAreas: [ // 手动指定草地区域
                { centerX: -140, centerZ: -10, width: 220, depth: 170, count: 4200 },
                { centerX: 110, centerZ: 65, width: 210, depth: 160, count: 3800 }
            ]
        });
        
        this.vegetation = vegSystem.generate();
        this.vegetationSystem = vegSystem;
        vegSystem.addToScene(this.scene);
    }
    
    initSunPosition() {
        this.initialSun.copy(this.sun);
        this.updateSun();
    }
    
    updateSun() {
        const phi = THREE.MathUtils.degToRad(90 - this.params.elevation);
        const theta = THREE.MathUtils.degToRad(this.params.azimuth);
        
        this.sun.setFromSphericalCoords(1, phi, theta);
        if (this.initialSun.lengthSq() === 0) {
            this.initialSun.copy(this.sun);
        }
        
        this.sky.material.uniforms['sunPosition'].value.copy(this.sun);
        this.water.material.uniforms['sunDirection'].value.copy(this.sun).normalize();
        
        if (this.sunLight) {
            const sunDistance = 100;
            this.sunLight.position.set(
                this.sun.x * sunDistance,
                this.sun.y * sunDistance,
                this.sun.z * sunDistance
            );
            const dayMix = THREE.MathUtils.clamp((this.sun.y + 0.06) / 0.52, 0, 1);
            this.sunLight.intensity = THREE.MathUtils.lerp(0.0, 1.5, dayMix);
        }

        const nightMix = THREE.MathUtils.clamp((-this.sun.y + 0.02) / 0.72, 0, 1);

        if (this.ambientLight) {
            this.ambientLight.color.set(0x8ea0b7).lerp(new THREE.Color(0x425a77), nightMix);
            this.ambientLight.intensity = THREE.MathUtils.lerp(0.66, 1.0, nightMix);
        }

        if (this.moonLight) {
            const moonDistance = 115;
            this.moonLight.position.set(
                -this.sun.x * moonDistance,
                Math.max(34, -this.sun.y * moonDistance * 0.5 + 42),
                -this.sun.z * moonDistance
            );
            this.moonLight.intensity = 1.15 * nightMix;
        }

        if (this.vegetationFillLight) {
            const fillDistance = 90;
            this.vegetationFillLight.position.set(
                -this.sun.x * fillDistance * 0.45 + 35,
                Math.max(18, this.sun.y * fillDistance * 0.28 + 24),
                -this.sun.z * fillDistance * 0.35 + 28
            );
            const fillDayMix = THREE.MathUtils.clamp((this.sun.y + 0.2) / 0.9, 0, 1);
            this.vegetationFillLight.intensity = THREE.MathUtils.lerp(0.5, 1.15, fillDayMix) + nightMix * 0.16;
        }
        
        if (this.renderTarget) {
            this.renderTarget.dispose();
        }
        
        const sceneEnv = new THREE.Scene();
        sceneEnv.add(this.sky);
        this.renderTarget = this.pmremGenerator.fromScene(sceneEnv);
        this.scene.environment = this.renderTarget.texture;
        this.scene.add(this.sky);
        
        this.updateClouds();
        this.updateStars();
    }
    
    getFogColor() {
        const elevation = this.params.elevation;
        
        if (elevation < -4) {
            return 0x121c2c;
        } else if (elevation < 0) {
            return 0x1d2b40;
        } else if (elevation < 10) {
            return 0x4a5a6a;
        } else if (elevation < 20) {
            return 0x8cb8d4;
        } else if (elevation < 45) {
            return 0x9ec5db;
        } else if (elevation < 70) {
            return 0xb8d4e8;
        } else {
            return 0xd4e8f4;
        }
    }

    getAtmosphereColors() {
        const sunMix = THREE.MathUtils.clamp((this.params.elevation + 10) / 100, 0, 1);
        const fogColor = new THREE.Color(this.getFogColor());
        const nightMix = THREE.MathUtils.clamp((-this.params.elevation + 1.0) / 12.0, 0, 1);
        const clarityMix =
            THREE.MathUtils.smoothstep(this.params.elevation, 52, 82) *
            (1.0 - THREE.MathUtils.smoothstep(this.params.turbidity, 3.2, 8.0));
        const warmHorizon = new THREE.Color(0xf0c7a3);
        const coolHorizon = new THREE.Color(0xcfe0ee).lerp(new THREE.Color(0x8fd2ff), clarityMix);
        const nightHorizon = new THREE.Color(0x27415f);
        const horizonColor = warmHorizon.clone().lerp(coolHorizon, sunMix).lerp(nightHorizon, nightMix);
        const warmSkyBase = new THREE.Color(0xf6d7b8);
        const coolSkyBase = new THREE.Color(0xbfd8eb).lerp(new THREE.Color(0x6fc4ff), clarityMix);
        const nightSkyBase = new THREE.Color(0x08111f);
        const nightSkyBlend = new THREE.Color(0x182940);
        const skyBaseColor = warmSkyBase.clone().lerp(coolSkyBase, sunMix * 0.92).lerp(nightSkyBase, nightMix);
        const fogBlend = THREE.MathUtils.lerp(0.42, 0.16, clarityMix);
        const skyBlendColor = skyBaseColor.clone().lerp(fogColor, fogBlend).lerp(nightSkyBlend, nightMix * 0.78);

        return { sunMix, fogColor, horizonColor, skyBaseColor, skyBlendColor };
    }
    
    initEventListeners() {
        window.addEventListener('resize', () => this.onWindowResize());
    }
    
    onWindowResize() {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        if (this.depthTarget) {
            this.depthTarget.setSize(window.innerWidth, window.innerHeight);
        }
        if (this.composer) {
            this.composer.setSize(window.innerWidth, window.innerHeight);
        }
        if (this.fogPass) {
            this.fogPass.material.uniforms.resolution.value.set(window.innerWidth, window.innerHeight);
            this.fogPass.material.uniforms.cameraNear.value = this.camera.near;
            this.fogPass.material.uniforms.cameraFar.value = this.camera.far;
        }
        if (this.rainPass) {
            this.rainPass.material.uniforms.resolution.value.set(window.innerWidth, window.innerHeight);
        }
        if (this.snowPass) {
            this.snowPass.material.uniforms.resolution.value.set(window.innerWidth, window.innerHeight);
        }
        if (this.underwaterPass) {
            this.underwaterPass.material.uniforms.resolution.value.set(window.innerWidth, window.innerHeight);
        }
    }

    updateUnderwaterPass(time) {
        if (!this.underwaterPass || !this.water) return;

        const waterSurface = this.water.position.y + 0.18;
        const depth = Math.max(0, waterSurface - this.camera.position.y);
        const underwaterAmount = THREE.MathUtils.smoothstep(depth, 0.05, 1.6);
        const depthMix = THREE.MathUtils.clamp(depth, 0, 18);

        const uniforms = this.underwaterPass.material.uniforms;
        uniforms.time.value = time;
        uniforms.underwaterAmount.value = underwaterAmount;
        uniforms.underwaterDepth.value = depthMix;
    }
    
    setSunElevation(value) {
        this.params.elevation = value;
        this.updateSun();
    }
    
    setSunAzimuth(value) {
        this.params.azimuth = value;
        this.updateSun();
    }
    
    setExposure(value) {
        this.params.exposure = value;
        this.renderer.toneMappingExposure = value;
    }
    
    setTurbidity(value) {
        this.params.turbidity = value;
        this.sky.material.uniforms['turbidity'].value = value;
        this.updateSun();
    }
    
    setRayleigh(value) {
        this.params.rayleigh = value;
        this.sky.material.uniforms['rayleigh'].value = value;
        this.updateSun();
    }

    setBloomStrength(value) {
        this.params.bloomStrength = value;
        if (this.bloomPass) {
            this.bloomPass.strength = value;
        }
    }

    setBloomRadius(value) {
        this.params.bloomRadius = value;
        if (this.bloomPass) {
            this.bloomPass.radius = value;
        }
    }

    setBloomThreshold(value) {
        this.params.bloomThreshold = value;
        if (this.bloomPass) {
            this.bloomPass.threshold = value;
        }
    }

    setWaterColor(value) {
        this.params.waterColor = value;
        if (this.water?.material?.uniforms?.waterColor?.value) {
            this.water.material.uniforms.waterColor.value.set(value);
        }
    }

    setCloudCoverage(value) {
        this.params.cloudCoverage = value;
        this.updateClouds();
    }

    setCloudDensity(value) {
        this.params.cloudDensity = value;
        this.updateClouds();
    }

    setCloudElevation(value) {
        this.params.cloudElevation = value;
        if (this.cloudGroup) {
            this.cloudGroup.position.y = THREE.MathUtils.lerp(-160, 260, value);
        }
    }

    setFogEnabled(value) {
        this.params.fogEnabled = value;
        this.updateFog();
    }

    setFogDensity(value) {
        this.params.fogDensity = THREE.MathUtils.clamp(value, 0, 2);
        this.updateFog();
    }

    setFogHeight(value) {
        this.params.fogHeight = value;
        this.updateFog();
    }

    setFogRange(value) {
        this.params.fogRange = value;
        this.updateFog();
    }

    setRainEnabled(value) {
        this.params.rainEnabled = value;
        if (this.rainPass) {
            this.rainPass.enabled = value;
        }
        this.updateRainAudioState();
        if (!value) {
            this.lightningFlash = 0;
            this.lightningLocalFlash = 0;
            this.lightningBurstEnd = 0;
            this.nextLightningAt = 0;
            this.lightningPulseSchedule = [];
            this.scheduledThunder = [];
            this.applyLightningState(0);
            this.stopThunderAudio();
        }
    }

    setRainScreenIntensity(value) {
        this.params.rainScreenIntensity = value;
        if (this.rainPass) {
            this.rainPass.material.uniforms.screenIntensity.value = value;
        }
    }

    setRainVeilIntensity(value) {
        this.params.rainVeilIntensity = value;
        if (this.rainPass) {
            this.rainPass.material.uniforms.veilIntensity.value = value;
        }
    }

    setRainDropSize(value) {
        this.params.rainDropSize = value;
        if (this.rainPass) {
            this.rainPass.material.uniforms.dropSize.value = value;
        }
    }

    setRainSpeed(value) {
        this.params.rainSpeed = value;
        if (this.rainPass) {
            this.rainPass.material.uniforms.rainSpeed.value = value;
        }
    }

    setRainAudioEnabled(value) {
        this.params.rainAudioEnabled = value;
        this.updateRainAudioState();
    }

    setRainAudioVolume(value) {
        this.params.rainAudioVolume = value;
        this.updateRainAudioState();
    }

    setSnowEnabled(value) {
        this.params.snowEnabled = value;
        if (this.snowPass) {
            this.snowPass.enabled = value;
        }
    }

    setSnowIntensity(value) {
        this.params.snowIntensity = value;
        if (this.snowPass) {
            this.snowPass.material.uniforms.intensity.value = value;
        }
    }

    setSnowSpeed(value) {
        this.params.snowSpeed = value;
        if (this.snowPass) {
            this.snowPass.material.uniforms.snowSpeed.value = value;
        }
    }

    setStarEnabled(value) {
        this.params.starEnabled = value;
        this.updateStars();
    }

    setStarIntensity(value) {
        this.params.starIntensity = value;
        this.updateStars();
    }

    updateRainAudioState() {
        if (this.rainAudioPool.length === 0) return;

        const shouldPlay = this.params.rainEnabled && this.params.rainAudioEnabled && this.params.rainAudioVolume > 0.001;
        if (shouldPlay) {
            if (!this.rainAudioIsPlaying) {
                const active = this.rainAudioPool[this.rainAudioActiveIndex];
                active.currentTime = 0;
                active.volume = this.params.rainAudioVolume;
                const playPromise = active.play();
                if (playPromise?.catch) {
                    playPromise.catch(() => {});
                }
                this.rainAudioIsPlaying = true;
                this.rainAudioCrossfading = false;
            }
        } else {
            for (const audio of this.rainAudioPool) {
                audio.pause();
                audio.currentTime = 0;
                audio.volume = 0;
            }
            this.rainAudioIsPlaying = false;
            this.rainAudioCrossfading = false;
        }
    }

    updateRainAudioLoop() {
        if (!this.rainAudioIsPlaying || this.rainAudioPool.length < 2) return;

        const active = this.rainAudioPool[this.rainAudioActiveIndex];
        const next = this.rainAudioPool[(this.rainAudioActiveIndex + 1) % this.rainAudioPool.length];
        const duration = Number.isFinite(active.duration) ? active.duration : 0;
        if (duration <= 0) {
            active.volume = this.params.rainAudioVolume;
            return;
        }

        const timeLeft = duration - active.currentTime;
        if (!this.rainAudioCrossfading && timeLeft <= this.rainAudioCrossfadeDuration) {
            next.currentTime = 0;
            next.volume = 0;
            const playPromise = next.play();
            if (playPromise?.catch) {
                playPromise.catch(() => {});
            }
            this.rainAudioCrossfading = true;
        }

        if (this.rainAudioCrossfading) {
            const progress = THREE.MathUtils.clamp(1.0 - timeLeft / this.rainAudioCrossfadeDuration, 0, 1);
            active.volume = this.params.rainAudioVolume * (1.0 - progress);
            next.volume = this.params.rainAudioVolume * progress;

            if (progress >= 0.999 || active.ended) {
                active.pause();
                active.currentTime = 0;
                active.volume = 0;
                this.rainAudioActiveIndex = (this.rainAudioActiveIndex + 1) % this.rainAudioPool.length;
                this.rainAudioCrossfading = false;
            }
        } else {
            active.volume = this.params.rainAudioVolume;
        }
    }

    setLightningEnabled(value) {
        this.params.lightningEnabled = value;
        if (!value) {
            this.lightningFlash = 0;
            this.lightningBurstEnd = 0;
            this.nextLightningAt = 0;
            this.lightningPulseSchedule = [];
            this.scheduledThunder = [];
            this.applyLightningState(0);
            this.stopThunderAudio();
        }
    }

    setLightningIntensity(value) {
        this.params.lightningIntensity = value;
    }

    setThunderVolume(value) {
        const nextValue = THREE.MathUtils.clamp(value, 0, 1);
        this.params.thunderVolume = nextValue;
        this.thunderVolume = nextValue;
    }

    applyParams(nextParams = {}) {
        const mergedParams = { ...DEFAULT_SCENE_PARAMS, ...nextParams };

        this.setSunElevation(mergedParams.elevation);
        this.setSunAzimuth(mergedParams.azimuth);
        this.setExposure(mergedParams.exposure);
        this.setTurbidity(mergedParams.turbidity);
        this.setRayleigh(mergedParams.rayleigh);
        this.setBloomStrength(mergedParams.bloomStrength);
        this.setBloomRadius(mergedParams.bloomRadius);
        this.setWaterColor(mergedParams.waterColor);
        this.setCloudCoverage(mergedParams.cloudCoverage);
        this.setCloudDensity(mergedParams.cloudDensity);
        this.setCloudElevation(mergedParams.cloudElevation);
        this.setFogEnabled(mergedParams.fogEnabled ?? true);
        this.setFogDensity(mergedParams.fogDensity);
        this.setFogHeight(mergedParams.fogHeight);
        this.setFogRange(mergedParams.fogRange);
        this.setRainScreenIntensity(mergedParams.rainScreenIntensity);
        this.setRainVeilIntensity(mergedParams.rainVeilIntensity);
        this.setRainDropSize(mergedParams.rainDropSize);
        this.setRainSpeed(mergedParams.rainSpeed);
        this.setRainAudioVolume(mergedParams.rainAudioVolume);
        this.setRainAudioEnabled(mergedParams.rainAudioEnabled);
        this.setSnowIntensity(mergedParams.snowIntensity);
        this.setSnowSpeed(mergedParams.snowSpeed);
        this.setSnowEnabled(mergedParams.snowEnabled);
        this.setStarIntensity(mergedParams.starIntensity);
        this.setStarEnabled(mergedParams.starEnabled);
        this.setLightningIntensity(mergedParams.lightningIntensity);
        this.setThunderVolume(mergedParams.thunderVolume);
        this.setLightningEnabled(mergedParams.lightningEnabled);
        this.setRainEnabled(mergedParams.rainEnabled);
    }

    scheduleNextLightning(time) {
        const rainActivity = Math.max(this.params.rainVeilIntensity, this.params.rainScreenIntensity);
        const densityBias = THREE.MathUtils.clamp(rainActivity / 1.5, 0, 1);
        const delay = THREE.MathUtils.lerp(7.5, 3.0, densityBias) + Math.random() * THREE.MathUtils.lerp(8.0, 4.0, densityBias);
        this.nextLightningAt = time + delay;
    }

    startLightningBurst(time) {
        const pulseCountRoll = Math.random();
        const pulseCount = pulseCountRoll > 0.8 ? 3 : pulseCountRoll > 0.45 ? 2 : 1;
        this.lightningPulseSchedule = [];

        let pulseTime = time;
        for (let i = 0; i < pulseCount; i++) {
            const duration = 0.05 + Math.random() * 0.07;
            const amplitude = this.params.lightningIntensity * (1.0 - i * 0.14) * (0.85 + Math.random() * 0.35);
            this.lightningPulseSchedule.push({
                time: pulseTime,
                duration,
                amplitude
            });
            pulseTime += 0.06 + Math.random() * 0.12;
        }

        this.lightningBurstEnd = pulseTime + 0.12;

        const flashX = THREE.MathUtils.randFloat(-1600, 1600);
        const flashY = THREE.MathUtils.randFloat(120, 340);
        const flashZ = THREE.MathUtils.randFloat(-1800, -420);
        this.lightningLight.position.set(flashX * 0.22, flashY, flashZ * 0.08);

        if (this.lightningCloudGlow) {
            this.lightningCloudGlow.position.set(flashX, flashY, flashZ);
            const size = THREE.MathUtils.randFloat(720, 1480);
            this.lightningCloudGlow.scale.set(size, size * THREE.MathUtils.randFloat(0.72, 1.08), 1);
        }

        this.scheduleThunderBurst(flashX, flashY, flashZ);
    }

    scheduleThunderBurst(flashX, flashY, flashZ) {
        const distanceNorm = THREE.MathUtils.clamp(
            (Math.abs(flashX) / 1600) * 0.35 + (Math.abs(flashZ) / 1800) * 0.65,
            0,
            1
        );
        const delay = THREE.MathUtils.lerp(0.65, 2.4, distanceNorm) + Math.random() * 0.45;
        const volume = this.params.lightningIntensity * THREE.MathUtils.lerp(1.0, 0.58, distanceNorm) * 1.12;
        this.scheduledThunder.push({
            playAt: this.lightningBurstEnd + delay,
            volume,
            playbackRate: THREE.MathUtils.randFloat(0.94, 1.03)
        });
    }

    stopThunderAudio() {
        for (const audio of this.thunderAudioPool) {
            audio.pause();
            audio.currentTime = 0;
        }
    }

    playThunder(volume, playbackRate) {
        if (!this.params.rainEnabled || !this.params.lightningEnabled || this.thunderAudioPool.length === 0) return;

        const audio = this.thunderAudioPool[this.thunderAudioIndex % this.thunderAudioPool.length];
        this.thunderAudioIndex += 1;
        audio.pause();
        audio.currentTime = 0;
        audio.volume = THREE.MathUtils.clamp(volume * this.thunderVolume, 0, 1);
        audio.playbackRate = playbackRate;
        const playPromise = audio.play();
        if (playPromise?.catch) {
            playPromise.catch(() => {});
        }
    }

    updateThunder(time) {
        if (!this.params.rainEnabled || !this.params.lightningEnabled || this.scheduledThunder.length === 0) return;

        const pending = [];
        for (const thunder of this.scheduledThunder) {
            if (time >= thunder.playAt) {
                this.playThunder(thunder.volume, thunder.playbackRate);
            } else {
                pending.push(thunder);
            }
        }
        this.scheduledThunder = pending;
    }

    updateLightning(time) {
        if (!this.params.rainEnabled || !this.params.lightningEnabled) return;

        if (this.nextLightningAt === 0) {
            this.scheduleNextLightning(time);
        }

        if (time >= this.nextLightningAt && time >= this.lightningBurstEnd) {
            this.startLightningBurst(time);
            this.scheduleNextLightning(time);
        }

        let flash = 0;
        let localFlash = 0;
        for (const pulse of this.lightningPulseSchedule) {
            const dt = time - pulse.time;
            if (dt < -0.001 || dt > pulse.duration * 2.8) continue;

            const attack = Math.exp(-Math.pow((dt - pulse.duration * 0.12) / Math.max(pulse.duration * 0.32, 0.001), 2.0));
            const decay = Math.exp(-Math.max(dt, 0.0) / Math.max(pulse.duration * 1.45, 0.001));
            const pulseFlash = pulse.amplitude * attack * decay;
            flash += pulseFlash;
            localFlash += pulseFlash * 1.35;
        }

        if (flash > 0.001) {
            this.lightningFlash = Math.max(this.lightningFlash * 0.7, flash);
            this.lightningLocalFlash = Math.max(this.lightningLocalFlash * 0.62, localFlash);
        } else {
            this.lightningFlash *= 0.82;
            if (this.lightningFlash < 0.002) this.lightningFlash = 0;
            this.lightningLocalFlash *= 0.74;
            if (this.lightningLocalFlash < 0.002) this.lightningLocalFlash = 0;
        }

        this.applyLightningState(this.lightningFlash, this.lightningLocalFlash);
    }

    applyLightningState(flash, localFlash = 0) {
        if (this.lightningLight) {
            this.lightningLight.intensity = flash * 5.5;
        }

        if (this.lightningCloudGlow) {
            this.lightningCloudGlow.visible = localFlash > 0.002;
            this.lightningCloudGlow.material.opacity = THREE.MathUtils.clamp(localFlash * 0.95, 0, 0.95);
        }

        if (this.renderer) {
            this.renderer.toneMappingExposure = this.params.exposure * (1.0 + flash * 1.6);
        }

        if (this.bloomPass) {
            this.bloomPass.strength = this.params.bloomStrength + flash * 0.35;
        }
    }

    updateClouds() {
        if (!this.cloudGroup) return;

        const sunMix = THREE.MathUtils.clamp((this.params.elevation + 10) / 100, 0, 1);
        const dawnMix = 1.0 - THREE.MathUtils.smoothstep(this.params.elevation, 8, 34);
        const rainMix = this.params.rainEnabled ? THREE.MathUtils.clamp(this.params.rainVeilIntensity / 2.0, 0.35, 1.0) : 0;
        const snowMix = this.params.snowEnabled ? THREE.MathUtils.clamp(this.params.snowIntensity / 1.5, 0.35, 1.0) : 0;
        const stormMix = Math.max(rainMix, snowMix);
        const warmCloud = new THREE.Color(0xdab188);
        const dayCloud = new THREE.Color(0xd1dbe6);
        const cloudColor = warmCloud.lerp(dayCloud, sunMix);
        const lightningMix = THREE.MathUtils.clamp(this.lightningFlash * 0.32, 0, 1);
        cloudColor.lerp(new THREE.Color(0xbfcad6), stormMix * 0.45);
        cloudColor.lerp(new THREE.Color(0xe9f3ff), lightningMix);
        const lightDir = new THREE.Vector2(this.sun.x, this.sun.z).normalize();

        this.cloudLayers.forEach((layer, index) => {
            const coverageFactor = 0.15 + this.params.cloudCoverage * 1.15;
            const densityFactor = 0.2 + this.params.cloudDensity * 1.35;
            const layerDepth = index / Math.max(this.cloudLayers.length - 1, 1);
            const weatherOpacityBoost = THREE.MathUtils.lerp(1.0, 1.42 - layerDepth * 0.16, rainMix);
            const snowOpacityBoost = THREE.MathUtils.lerp(1.0, 1.22 - layerDepth * 0.08, snowMix);
            const opacity = layer.baseOpacity * coverageFactor * densityFactor * weatherOpacityBoost * snowOpacityBoost;
            const heightDrop = THREE.MathUtils.lerp(0, 120 + index * 55, rainMix);
            const snowLift = THREE.MathUtils.lerp(0, 40 + index * 24, snowMix);
            const layerScale = layer.baseScale * THREE.MathUtils.lerp(1.18 - index * 0.06, 0.9 + index * 0.04, rainMix);
            const softness = layer.baseSoftness * THREE.MathUtils.lerp(1.15, 0.82, rainMix) * THREE.MathUtils.lerp(1.0, 1.08, snowMix);
            const erosion = layer.baseErosionStrength * THREE.MathUtils.lerp(0.72 + index * 0.08, 1.28 + index * 0.1, rainMix);
            const ridge = layer.baseRidgeStrength * THREE.MathUtils.lerp(1.24, 0.78, rainMix) * THREE.MathUtils.lerp(1.0, 0.86, snowMix);
            const highlight = layer.baseHighlightStrength * THREE.MathUtils.lerp(1.45 - index * 0.12, 0.62, rainMix) * THREE.MathUtils.lerp(1.12, 0.84, snowMix);
            const shadow = layer.baseShadowStrength * THREE.MathUtils.lerp(0.94, 1.36, stormMix);

            layer.material.uniforms.layerOpacity.value = opacity;
            layer.material.uniforms.cloudCoverage.value = this.params.cloudCoverage;
            layer.material.uniforms.cloudDensity.value = this.params.cloudDensity;
            layer.material.uniforms.scale.value = layerScale;
            layer.material.uniforms.softness.value = softness;
            layer.material.uniforms.erosionStrength.value = erosion;
            layer.material.uniforms.ridgeStrength.value = ridge;
            layer.material.uniforms.highlightStrength.value = highlight;
            layer.material.uniforms.shadowStrength.value = shadow;
            layer.material.uniforms.tintColor.value.copy(cloudColor);
            layer.material.uniforms.lightDir.value.copy(lightDir);
            layer.mesh.position.y = layer.baseY - heightDrop + snowLift + dawnMix * index * 18.0;
            layer.mesh.visible = opacity > 0.015;
        });
    }

    updateStars() {
        if (!this.starField) return;

        const nightFactor = THREE.MathUtils.clamp((12.0 - this.params.elevation) / 16.0, 0.0, 1.0);
        const weatherFade = this.params.rainEnabled ? 0.08 : this.params.snowEnabled ? 0.55 : 1.0;
        const opacity = (this.params.starEnabled ? this.params.starIntensity : 0.0) * nightFactor * weatherFade;
        const isBlackNight = this.params.elevation < -1.0;

        this.starField.visible = opacity > 0.001;
        this.starField.material.uniforms.intensity.value = opacity;

        if (this.moonSprite) {
            const moonAngle = Math.atan2(this.initialSun.z, this.initialSun.x);
            const moonDistance = 3200;
            this.moonSprite.position.set(
                Math.cos(moonAngle) * moonDistance,
                THREE.MathUtils.lerp(260, 520, nightFactor),
                Math.sin(moonAngle) * moonDistance
            );
            const moonGlow = isBlackNight ? THREE.MathUtils.clamp((nightFactor - 0.18) / 0.72, 0, 1) : 0.0;
            this.moonSprite.visible = isBlackNight && moonGlow > 0.01;
            this.moonSprite.material.opacity = THREE.MathUtils.lerp(0.0, 2.4, moonGlow);
            const moonScale = THREE.MathUtils.lerp(410, 730, moonGlow);
            this.moonSprite.scale.setScalar(moonScale);

            if (this.moonGlowSprite) {
                this.moonGlowSprite.position.copy(this.moonSprite.position);
                this.moonGlowSprite.visible = this.moonSprite.visible;
                this.moonGlowSprite.material.opacity = moonGlow * 1.18;
                this.moonGlowSprite.scale.setScalar(THREE.MathUtils.lerp(980, 1680, moonGlow));
            }
        }

        if (this.galaxyBand) {
            const angle = THREE.MathUtils.degToRad(this.params.azimuth + 36);
            const radius = 3000;
            this.galaxyBand.position.set(
                Math.cos(angle) * radius,
                THREE.MathUtils.lerp(920, 1500, nightFactor),
                Math.sin(angle) * radius
            );
            this.galaxyBand.material.rotation = THREE.MathUtils.degToRad(-24);
            const galaxyFade = isBlackNight ? THREE.MathUtils.clamp((opacity - 0.18) / 1.1, 0, 1) * weatherFade : 0.0;
            this.galaxyBand.material.opacity = galaxyFade * 0.92;
            this.galaxyBand.visible = isBlackNight && this.galaxyBand.material.opacity > 0.01;
        }
    }

    updateFog() {
        if (!this.fogPass) return;

        const { fogColor, horizonColor } = this.getAtmosphereColors();
        const lightningMix = THREE.MathUtils.clamp(this.lightningFlash * 0.42, 0, 1);
        fogColor.lerp(new THREE.Color(0xdbe8f5), lightningMix);
        horizonColor.lerp(new THREE.Color(0xe5eef9), lightningMix);

        const uniforms = this.fogPass.material.uniforms;
        uniforms.fogColor.value.copy(fogColor);
        uniforms.horizonColor.value.copy(horizonColor);
        uniforms.fogDensity.value = this.params.fogEnabled
            ? THREE.MathUtils.lerp(0.00002, 0.00078, this.params.fogDensity / 2.0)
            : 0.0;
        uniforms.fogHeight.value = this.params.fogHeight;
        uniforms.fogRange.value = this.params.fogRange;
        uniforms.projectionMatrixInverse.value.copy(this.camera.projectionMatrixInverse);
        uniforms.viewMatrixInverse.value.copy(this.camera.matrixWorld);
        uniforms.cameraWorldPosition.value.copy(this.camera.position);
    }

    updateDepthTarget() {
        if (!this.depthTarget) return;

        const hiddenObjects = [
            this.sky,
            this.starField,
            this.moonSprite,
            this.moonGlowSprite,
            this.galaxyBand
        ].filter(Boolean);
        const previousVisibility = hiddenObjects.map((object) => object.visible);

        hiddenObjects.forEach((object) => {
            object.visible = false;
        });

        const previousRenderTarget = this.renderer.getRenderTarget();
        this.renderer.setRenderTarget(this.depthTarget);
        this.renderer.clear();
        this.renderer.render(this.scene, this.camera);
        this.renderer.setRenderTarget(previousRenderTarget);

        hiddenObjects.forEach((object, index) => {
            object.visible = previousVisibility[index];
        });
    }
    
    animate() {
        requestAnimationFrame(() => this.animate());
        this.stats?.begin();
        
        const delta = this.clock.getDelta();
        const time = this.clock.elapsedTime;
        this.updateLightning(time);
        this.updateThunder(time);
        this.updateRainAudioLoop();
        
        if (this.water) {
            this.water.material.uniforms['time'].value += 1.0 / 60.0;
        }

        if (this.cloudGroup) {
            this.cloudLayers.forEach((layer) => {
                layer.material.uniforms.time.value = time;
            });
        }

        if (this.starField) {
            this.starField.material.uniforms.time.value = time;
        }

        if (this.vegetationSystem) {
            this.vegetationSystem.update(time);
        }

        if (this.windTurbine) {
            this.windTurbine.faceDirection(this.sun);
            this.windTurbine.update(time, delta);
        }

        if (this.lightningFlash > 0.001) {
            this.updateClouds();
            this.updateFog();
            this.updateStars();
        }

        if (this.rainPass) {
            this.rainPass.material.uniforms.time.value = time;
        }
        if (this.snowPass) {
            this.snowPass.material.uniforms.time.value = time;
        }
        if (this.fogPass) {
            this.fogPass.material.uniforms.time.value = time;
        }
        this.updateUnderwaterPass(time);
        
        this.controls.update();
        this.updateFog();
        if (this.composer) {
            this.updateDepthTarget();
            this.composer.render();
        } else {
            this.renderer.render(this.scene, this.camera);
        }
        this.stats?.end();
    }
    
    hideLoading() {
        const loading = document.getElementById('loading');
        if (loading) {
            loading.style.opacity = '0';
            loading.style.transition = 'opacity 0.5s ease';
            setTimeout(() => {
                loading.style.display = 'none';
            }, 500);
        }
    }
}


