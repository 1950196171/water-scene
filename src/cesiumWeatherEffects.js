import { PostProcessStage, Color, Matrix4, Cartesian3, Math as CesiumMath, Cartesian2 } from 'cesium';
import { WEATHER_PRESETS } from './weatherPresets.js';

const rainShader = `
    uniform sampler2D colorTexture;
    uniform float time;
    uniform float screenIntensity;
    uniform float veilIntensity;
    uniform float dropSize;
    uniform float rainSpeed;
    uniform vec2 resolution;

    in vec2 v_textureCoordinates;
    out vec4 fragColor;

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
        vec2 uv = v_textureCoordinates;
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
        
        // Use colorTexture in Cesium instead of tDiffuse
        vec3 base =
            texture(colorTexture, uv + distortion).rgb * 0.4 +
            texture(colorTexture, uv + distortion + vec2(texel.x * focus * 24.0, 0.0)).rgb * 0.15 +
            texture(colorTexture, uv + distortion - vec2(texel.x * focus * 24.0, 0.0)).rgb * 0.15 +
            texture(colorTexture, uv + distortion + vec2(0.0, texel.y * focus * 24.0)).rgb * 0.15 +
            texture(colorTexture, uv + distortion - vec2(0.0, texel.y * focus * 24.0)).rgb * 0.15;

        vec3 sharp = texture(colorTexture, uv + distortion * 0.6).rgb;
        vec3 col = mix(base, sharp, smoothstep(0.04, 0.22, c.x));

        vec3 rainTint = vec3(0.86, 0.91, 0.95);
        col = mix(col, col * 0.88 + rainTint * 0.12, clamp(c.x * 0.65 + c.y * 0.3 + impact.x * 0.4, 0.0, 1.0));
        col += c.y * rainTint * 0.08 * screenAmount;
        col += impact.x * rainTint * 0.18 * screenAmount;
        col += veil * rainTint * (0.12 + veilAmount * 0.18);
        col = mix(col, col * 0.94 + rainTint * 0.06, veil * 0.18);
        col = mix(texture(colorTexture, uv).rgb, col, clamp(rainAmount * 1.1, 0.0, 1.0));

        fragColor = vec4(col, 1.0);
    }
`;

const snowShader = `
    uniform sampler2D colorTexture;
    uniform float time;
    uniform float intensity;
    uniform float snowSpeed;
    uniform vec2 resolution;

    in vec2 v_textureCoordinates;
    out vec4 fragColor;

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
        vec2 uv = v_textureCoordinates;
        float aspect = resolution.x / max(resolution.y, 1.0);
        vec2 snowUv = vec2(uv.x * aspect, uv.y);
        float snowAmount = clamp(intensity / 1.5, 0.0, 1.0);
        float t = time * snowSpeed;
        float snow = snowField(snowUv, t, snowAmount, aspect);
        float snowMask = clamp(snow * mix(0.45, 1.15, snowAmount), 0.0, 1.0);
        float atmosphere = (1.0 - uv.y) * 0.12 * snowAmount;

        vec3 base = texture(colorTexture, uv).rgb;
        vec3 snowTint = vec3(0.92, 0.95, 1.0);
        base = mix(base, base * 0.96 + snowTint * 0.04, snowAmount * 0.1);
        base += snowTint * snowMask;
        base += vec3(0.16, 0.28, 0.4) * atmosphere;

        fragColor = vec4(base, 1.0);
    }
`;

const cloudShader = `
    uniform sampler2D colorTexture;
    uniform sampler2D depthTexture;
    uniform float time;
    uniform vec2 resolution;
    
    uniform float cloudCoverage;
    uniform float cloudDensity;
    uniform float cloudHeight;
    uniform float scale;
    uniform float detailScale;
    uniform float softness;
    uniform vec2 drift;
    
    in vec2 v_textureCoordinates;
    out vec4 fragColor;
    
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
        vec2 uv = v_textureCoordinates;
        vec4 baseColor = texture(colorTexture, uv);
        float depth = czm_readDepth(depthTexture, uv);
        
        // Compute precise ray direction using far plane (depth=1.0)
        vec4 farEC = czm_windowToEyeCoordinates(gl_FragCoord.xy, 1.0);
        vec3 rayEC = normalize(farEC.xyz);
        vec3 D = normalize((czm_inverseView * vec4(rayEC, 0.0)).xyz);
        
        // Only draw clouds on sky/distant objects (depth mask)
        float depthMask = step(0.999, depth);
        if (depthMask < 0.5) {
            fragColor = baseColor;
            return;
        }

        vec3 up = normalize(czm_viewerPositionWC); 
        float lookUpAngle = dot(D, up);
        
        if (lookUpAngle < 0.02) {
            fragColor = baseColor;
            return;
        }
        
        // Calculate intersection distance to the local horizontal cloud plane
        float t_val = cloudHeight / lookUpAngle;
        vec3 offset = t_val * D;
        
        // Build a local tangent plane at the camera to map coordinates
        vec3 north = vec3(0.0, 0.0, 1.0);
        vec3 right = normalize(cross(north, up));
        if (length(right) < 0.1) right = vec3(1.0, 0.0, 0.0);
        vec3 forward = normalize(cross(up, right));
        
        // Project offset onto the local 2D tangent plane (right, forward)
        vec2 cloudPlanePos = vec2(dot(offset, right), dot(offset, forward));
        
        vec2 flow = cloudPlanePos / scale + drift * time * 40.0;
        
        float horizonFade = smoothstep(0.02, 0.18, lookUpAngle);
        
        if (horizonFade < 0.01) {
            fragColor = baseColor;
            return;
        }
        
        float baseNoise = fbm(flow);
        float detail = fbm(flow * detailScale + vec2(0.0, time * 0.01));
        float billow = fbm(flow * 0.62);
        
        float shape = baseNoise * 0.6 + billow * 0.3 + detail * 0.1;
        
        float densityBoost = mix(0.78, 1.28, clamp(cloudDensity, 0.0, 1.0));
        float coverageThreshold = mix(0.84, 0.34, clamp(cloudCoverage, 0.0, 1.0));
        
        float alpha = smoothstep(
            coverageThreshold + softness,
            coverageThreshold - softness,
            shape * densityBoost
        );
        
        if (alpha <= 0.001) {
            fragColor = baseColor;
            return;
        }
        
        vec3 cloudColor = vec3(1.0);
        vec3 finalCol = mix(baseColor.rgb, cloudColor, alpha * horizonFade * 0.85); // 0.85 opacity max
        
        fragColor = vec4(finalCol, 1.0);
    }
`;

const fogShader = `
    uniform sampler2D colorTexture;
    uniform sampler2D depthTexture;
    uniform float fogDensity;
    
    in vec2 v_textureCoordinates;
    out vec4 fragColor;
    
    void main() {
        vec2 uv = v_textureCoordinates;
        vec4 baseColor = texture(colorTexture, uv);
        
        if (fogDensity <= 0.0001) {
            fragColor = baseColor;
            return;
        }
        
        float depth = czm_readDepth(depthTexture, uv);
        
        vec4 positionEC = czm_windowToEyeCoordinates(gl_FragCoord.xy, depth);
        // Extract vector from camera to the pixel in world coordinates
        vec3 offset = (czm_inverseViewRotation * positionEC.xyz);
        
        float dist = length(offset);
        
        if (depth >= 0.99999) {
            dist = 20000.0; // Max fog distance for sky
            offset = normalize(offset) * dist;
        }
        
        // Simple distance-based exponential fog
        float f = 1.0 - exp(-dist * fogDensity * 0.0001);
        
        // Height attenuation: safely calculate point altitude using camera altitude and vertical offset
        vec3 up = normalize(czm_viewerPositionWC);
        float cameraAltitude = max(length(czm_viewerPositionWC) - 6378137.0, 0.0);
        float pointAltitude = cameraAltitude + dot(offset, up);
        
        float heightFalloff = exp(-max(pointAltitude, 0.0) * 0.002);
        
        float finalFog = clamp(f * heightFalloff, 0.0, 1.0);
        
        float verticalDirection = dot(normalize(offset), up);
        vec3 lowColor = vec3(0.5, 0.6, 0.7);
        vec3 highColor = vec3(0.7, 0.8, 0.9);
        vec3 fogColor = mix(lowColor, highColor, smoothstep(-0.2, 0.2, verticalDirection));
        
        fragColor = vec4(mix(baseColor.rgb, fogColor, finalFog), 1.0);
    }
`;

export class CesiumWeatherSystem {
    constructor(viewer, params) {
        this.viewer = viewer;
        this.params = params;
        this.rainStage = null;
        this.snowStage = null;
        this.cloudStage = null;
        this.fogStage = null;
        this.elapsedTime = 0;
        
        this.RAIN_AUDIO_URL = '/audio/rain-calming.mp3';
        this.THUNDER_AUDIO_URL = '/audio/thunder-close.mp3';
        this.rainAudioPool = [];
        this.thunderAudioPool = [];
        this.rainAudioIsPlaying = false;
        
        this.initPostProcess();
        this.initAudio();
        
        // Add update listener
        this.viewer.scene.preUpdate.addEventListener(this.update.bind(this));
    }
    
    initPostProcess() {
        const scene = this.viewer.scene;
        
        // Rain Stage
        this.rainStage = new PostProcessStage({
            name: 'RainStage',
            fragmentShader: rainShader,
            uniforms: {
                time: () => this.elapsedTime,
                screenIntensity: () => this.params.rainScreenIntensity,
                veilIntensity: () => this.params.rainVeilIntensity,
                dropSize: () => this.params.rainDropSize,
                rainSpeed: () => this.params.rainSpeed,
                resolution: () => new Cartesian2(scene.canvas.width, scene.canvas.height)
            }
        });
        this.rainStage.enabled = this.params.rainEnabled;
        scene.postProcessStages.add(this.rainStage);
        
        // Snow Stage
        this.snowStage = new PostProcessStage({
            name: 'SnowStage',
            fragmentShader: snowShader,
            uniforms: {
                time: () => this.elapsedTime,
                intensity: () => this.params.snowIntensity,
                snowSpeed: () => this.params.snowSpeed,
                resolution: () => new Cartesian2(scene.canvas.width, scene.canvas.height)
            }
        });
        this.snowStage.enabled = this.params.snowEnabled;
        scene.postProcessStages.add(this.snowStage);
        
        // Cloud Stage
        this.cloudStage = new PostProcessStage({
            name: 'CloudStage',
            fragmentShader: cloudShader,
            uniforms: {
                time: () => this.elapsedTime,
                resolution: () => new Cartesian2(scene.canvas.width, scene.canvas.height),
                cloudCoverage: () => this.params.cloudCoverage,
                cloudDensity: () => this.params.cloudDensity,
                cloudHeight: () => this.params.cloudHeight !== undefined ? this.params.cloudHeight : 6000.0,
                scale: () => 4000.0,
                detailScale: () => 4.5,
                softness: () => 0.17,
                drift: () => new Cartesian2(0.003, 0.001)
            }
        });
        this.cloudStage.enabled = true; // Clouds are always "enabled", visibility controlled by coverage/density
        scene.postProcessStages.add(this.cloudStage);
        
        // Fog Stage
        this.fogStage = new PostProcessStage({
            name: 'FogStage',
            fragmentShader: fogShader,
            uniforms: {
                fogDensity: () => this.params.fogEnabled ? this.params.fogDensity : 0.0
            }
        });
        this.fogStage.enabled = true; // Controlled by fogDensity
        scene.postProcessStages.add(this.fogStage);
        
        // Bloom
        scene.postProcessStages.bloom.enabled = true;
        scene.postProcessStages.bloom.uniforms.contrast = 119;
        scene.postProcessStages.bloom.uniforms.brightness = -0.4;
        scene.postProcessStages.bloom.uniforms.glowOnly = false;
        scene.postProcessStages.bloom.uniforms.delta = 1;
        scene.postProcessStages.bloom.uniforms.sigma = 2;
        scene.postProcessStages.bloom.uniforms.stepSize = 1;
    }
    
    initAudio() {
        this.rainAudioPool = Array.from({ length: 2 }, () => {
            const audio = new Audio(this.RAIN_AUDIO_URL);
            audio.loop = true;
            audio.preload = 'auto';
            audio.volume = 0;
            audio.crossOrigin = 'anonymous';
            return audio;
        });

        this.thunderAudioPool = Array.from({ length: 3 }, () => {
            const audio = new Audio(this.THUNDER_AUDIO_URL);
            audio.preload = 'auto';
            audio.crossOrigin = 'anonymous';
            return audio;
        });
    }

    updateAudioVolume() {
        if (!this.params.rainAudioEnabled || !this.params.rainEnabled) {
            this.rainAudioPool.forEach(a => {
                a.volume = 0;
                a.pause();
            });
            this.rainAudioIsPlaying = false;
            return;
        }
        
        if (!this.rainAudioIsPlaying) {
            this.rainAudioPool[0].play().catch(() => {});
            this.rainAudioIsPlaying = true;
        }
        this.rainAudioPool[0].volume = this.params.rainAudioVolume;
    }

    update(scene, time) {
        // Simple elapsed time delta
        this.elapsedTime += 0.016; 
        
        this.rainStage.enabled = Boolean(this.params.rainEnabled);
        this.snowStage.enabled = Boolean(this.params.snowEnabled);
        
        // Update audio
        this.updateAudioVolume();
        
        // Update bloom based on sun elevation mapping
        // In Cesium bloom behaves slightly differently, so we map Three's bloom params
        if (this.params.bloomStrength > 0) {
            scene.postProcessStages.bloom.enabled = true;
            // Rough mapping
            scene.postProcessStages.bloom.uniforms.contrast = 120 + this.params.bloomStrength * 80;
            scene.postProcessStages.bloom.uniforms.sigma = 1 + this.params.bloomRadius * 2;
        } else {
            scene.postProcessStages.bloom.enabled = false;
        }
        
        // Lightning flashes 
        if (this.params.lightningEnabled && this.params.rainEnabled && Math.random() < 0.005) {
            this.triggerLightning();
        }
    }
    
    triggerLightning() {
        // Play thunder sound
        const thunder = this.thunderAudioPool.find(a => a.paused || a.ended);
        if (thunder && this.params.rainAudioEnabled) {
            thunder.volume = this.params.thunderVolume || 0.8;
            thunder.currentTime = 0;
            thunder.play().catch(() => {});
        }
        
        // Flash light modifier
        const originalIntensity = this.viewer.scene.light.intensity;
        this.viewer.scene.light.intensity = this.params.lightningIntensity * 5.0 || 5.0;
        
        setTimeout(() => {
            if (this.viewer && this.viewer.scene) {
                this.viewer.scene.light.intensity = originalIntensity;
            }
        }, 150);
        setTimeout(() => {
            if (this.viewer && this.viewer.scene && Math.random() > 0.5) {
                this.viewer.scene.light.intensity = this.params.lightningIntensity * 3.0 || 3.0;
                setTimeout(() => {
                    if (this.viewer && this.viewer.scene) {
                        this.viewer.scene.light.intensity = originalIntensity;
                    }
                }, 50);
            }
        }, 200);
    }
}
