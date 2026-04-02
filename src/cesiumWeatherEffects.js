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
    uniform sampler2D cloudMask;
    uniform sampler2D weatherTexture;
    uniform float time;
    uniform vec2 resolution;
    uniform float cameraAltitude;
    uniform float cloudCoverage;
    uniform float cloudDensity;
    uniform float cloudBaseHeight;
    uniform float cloudTopHeight;
    uniform float scale;
    uniform float detailScale;
    uniform float softness;
    uniform vec2 drift;
    uniform vec3 sunDirection;
    uniform float atmosphereStrength;
    uniform float absorptionStrength;
    
    in vec2 v_textureCoordinates;
    out vec4 fragColor;
    
    vec2 raySphereIntersect(float camAlt, float H, float rayDirY) {
        float R = 6378137.0;
        float A = 1.0 / (2.0 * R);
        float B = rayDirY + (camAlt * rayDirY) / R;
        float C = (camAlt - H) + (camAlt * camAlt - H * H) / (2.0 * R);
        float delta = B * B - 4.0 * A * C;
        if (delta < 0.0) return vec2(-1.0, -1.0);
        float sqrtDelta = sqrt(delta);
        float s = B >= 0.0 ? 1.0 : -1.0;
        float q = -0.5 * (B + s * sqrtDelta);
        return vec2(min(q / A, C / q), max(q / A, C / q));
    }

    float hash13(vec3 p) {
        p = fract(p * vec3(0.1031, 0.1030, 0.0973));
        p += dot(p, p.yxz + 33.33);
        return fract((p.x + p.y) * p.z);
    }

    float noise3(vec3 p) {
        vec3 i = floor(p);
        vec3 f = fract(p);
        vec3 u = f * f * (3.0 - 2.0 * f);
        float nxy0 = mix(mix(hash13(i), hash13(i+vec3(1,0,0)), u.x), mix(hash13(i+vec3(0,1,0)), hash13(i+vec3(1,1,0)), u.x), u.y);
        float nxy1 = mix(mix(hash13(i+vec3(0,0,1)), hash13(i+vec3(1,0,1)), u.x), mix(hash13(i+vec3(0,1,1)), hash13(i+vec3(1,1,1)), u.x), u.y);
        return mix(nxy0, nxy1, u.z);
    }

    float fbm3(vec3 p) {
        float value = 0.0;
        float amplitude = 0.5;
        for (int i = 0; i < 4; i++) {
            value += amplitude * noise3(p);
            p = p * 2.02 + vec3(17.2, 11.3, 7.7);
            amplitude *= 0.5;
        }
        return value;
    }
    
    void main() {
        vec2 uv = v_textureCoordinates;
        vec4 baseColor = texture(colorTexture, uv);
        vec2 px = 1.0 / resolution;
        float depth1 = czm_readDepth(depthTexture, uv);
        float depth2 = czm_readDepth(depthTexture, uv + vec2(px.x, 0.0));
        float depth3 = czm_readDepth(depthTexture, uv + vec2(0.0, px.y));
        float depth4 = czm_readDepth(depthTexture, uv + px);
        float depth = min(min(depth1, depth2), min(depth3, depth4));
        
        vec4 clipPos = vec4(uv * 2.0 - 1.0, 1.0, 1.0);
        vec4 farEC = czm_inverseProjection * clipPos;
        vec3 rayEC = normalize(farEC.xyz / max(farEC.w, 0.000001));
        vec3 rayDir = normalize((czm_inverseView * vec4(rayEC, 0.0)).xyz);
        vec3 up = normalize(czm_viewerPositionWC);
        float rayDirY = dot(rayDir, up);
        
        vec2 shellBase = raySphereIntersect(cameraAltitude, cloudBaseHeight, rayDirY);
        vec2 shellTop  = raySphereIntersect(cameraAltitude, cloudTopHeight,  rayDirY);
        
        float t0 = (cameraAltitude < cloudBaseHeight) ? shellBase.y : (cameraAltitude > cloudTopHeight) ? shellTop.x : 0.0;
        float t1 = (cameraAltitude < cloudBaseHeight) ? shellTop.y  : (cameraAltitude > cloudTopHeight) ? shellBase.x : shellTop.y;
        
        float tMin = max(t0, 0.0);
        float tMax = max(t1, 0.0);
        
        tMin = max(tMin, 0.0);
        const float maxVisualDist = 2000000.0;
        if (tMin > maxVisualDist || tMax < 0.0) { fragColor = baseColor; return; }
        tMax = min(tMax, maxVisualDist);
        
        vec4 eyePos = czm_windowToEyeCoordinates(gl_FragCoord.xy, depth);
        float sceneEyeZ = eyePos.z / max(eyePos.w, 0.000001);
        
        float cloudShellTMax = tMax;
        
        float horizonContinuity = smoothstep(-0.08, 0.02, rayDirY);
        const float VISUAL_MAX = 1500000.0;
        float distContinuity = smoothstep(VISUAL_MAX, VISUAL_MAX * 0.8, tMin);
        
        float totalContinuity = horizonContinuity * distContinuity;
        if (totalContinuity <= 0.001 || tMin >= cloudShellTMax) { fragColor = baseColor; return; }
        
        const float FIXED_STEP = 250.0;
        const int MAX_STEPS = 56;
        
        float t = tMin + fract(sin(dot(uv, vec2(12.9898, 78.233))) * 43758.5453) * 5.0;
        
        float transmittance = 1.0;
        vec3 scatteredLight = vec3(0.0);
        vec3 sunDir = normalize(sunDirection);
        float cosSun = dot(rayDir, sunDir);
        float g1 = 0.85; float g2 = -0.25;
        float hg1 = (1.0 - g1*g1) / pow(1.0 + g1*g1 - 2.0*g1*cosSun, 1.5);
        float hg2 = (1.0 - g2*g2) / pow(1.0 + g2*g2 - 2.0*g2*cosSun, 1.5);
        float phaseForward = 0.5 + mix(hg2, hg1, 0.65) * 0.079577 * 3.5;
        float viewUp = clamp(dot(rayDir, up) * 0.5 + 0.5, 0.0, 1.0);
        float atmSunUp = clamp(dot(sunDir, up), 0.0, 1.0);
        float atmSunDown = clamp(-dot(sunDir, up), 0.0, 1.0);
        vec3 sunLightColor = mix(vec3(1.0, 0.45, 0.15), vec3(0.98, 0.96, 0.94), smoothstep(0.0, 0.3, atmSunUp));
        vec3 ambientColor = mix(vec3(0.35, 0.45, 0.65), vec3(0.56, 0.64, 0.78), atmSunUp);
        vec3 atmosphereColor = mix(vec3(0.2, 0.3, 0.5), vec3(0.6, 0.75, 0.9), viewUp) * (0.4 + 0.6 * atmSunUp) + sunLightColor * pow(max(cosSun, 0.0), 6.0) * 0.5;
        float absorptionCoeff = mix(0.5, 3.5, clamp(absorptionStrength, 0.0, 1.0));
        float densBoost = mix(0.5, 4.0, clamp(cloudDensity, 0.0, 1.0));
        float covThreshold = mix(0.7, 0.2, clamp(cloudCoverage, 0.0, 1.0));
        float horizonFade = smoothstep(0.0, 0.05, rayDirY);
        
        vec3 camNormW = normalize(czm_viewerPositionWC);
        float R_earth = 6378137.0;
        float camR = R_earth + cameraAltitude;
        
        vec2 flowOffset = drift * time * 50.0;
        for (int i = 0; i < MAX_STEPS; i++) {
            if (t > cloudShellTMax || transmittance < 0.02) break;
            // Correct Occlusion: If rayZ is farther (more negative) than sceneZ, weight is 0.
            float occlusionWeight = (depth < 1.0) ? smoothstep(sceneEyeZ - 500.0 * abs(rayEC.z), sceneEyeZ, t * rayEC.z) : 1.0;
            float h = cameraAltitude + t * rayDirY + (t * t) / (2.0 * R_earth);
            
            vec3 sampleDir = normalize(camNormW + (t / camR) * rayDir);
            vec2 flow = vec2(atan(sampleDir.y, sampleDir.x), asin(clamp(sampleDir.z, -1.0, 1.0))) * R_earth / (scale * 0.5) + flowOffset;
            float maskVal = texture(cloudMask, fract(flow * 0.02)).r;
            float maskVal2 = texture(cloudMask, fract(flow * 0.011 + vec2(0.17, 0.31))).r;
            vec3 weather = texture(weatherTexture, fract(flow * 0.005)).rgb;
            float boundaryNoise = fbm3(vec3(flow * 0.22, h / (scale * 0.2) + 11.0));
            float dBase = cloudBaseHeight + (boundaryNoise - 0.5) * 2.0 * (mix(120.0, 900.0, weather.r) + maskVal * 300.0) - weather.g * 120.0;
            float dTop = cloudTopHeight + (0.5 - boundaryNoise) * 0.9 * (mix(250.0, 1700.0, weather.b) + maskVal2 * 450.0) + weather.b * 420.0;
            float heightFrac = clamp((h - dBase) / max(dTop - dBase, 500.0), 0.0, 1.0);
            float heightProfile = smoothstep(0.0, mix(0.2, 0.35, maskVal), heightFrac) * smoothstep(1.0, mix(0.35, 0.7, maskVal2), heightFrac);
            if (heightProfile > 0.005) {
                float weatherMask = mix(1.0, clamp(maskVal * 0.45 + maskVal2 * 0.35 + weather.r * 0.55, 0.0, 1.0), 0.80);
                float weatherWeight = smoothstep(covThreshold - 0.26, covThreshold + 0.12, weatherMask);
                if (weatherWeight > 0.001) {
                    float n = fbm3(vec3(flow, h / (scale * 0.1)) * 0.4) * 0.7 + fbm3(vec3(flow, h / (scale * 0.1)) * detailScale) * 0.3;
                    float shape = n * mix(0.4, 1.0, weatherWeight) - covThreshold;
                    float shapeWeight = smoothstep(-0.04, 0.22, shape);
                    if (shapeWeight > 0.001) {
                        float density = shapeWeight * heightProfile * densBoost * mix(0.5, 2.5, weather.g) * 0.012 * occlusionWeight;
                        float stepExp = exp(-density * FIXED_STEP * absorptionCoeff);
                        float sunPen = smoothstep(0.0, 1.0, heightFrac);
                        vec3 S = mix(sunLightColor * phaseForward * sunPen * (0.8 + 1.2 * (1.0 - exp(-density * FIXED_STEP * 4.0))) + ambientColor * (0.6 + 0.4 * mix(1.0, exp(-density * FIXED_STEP * absorptionCoeff * 0.2), 0.5)), atmosphereColor, clamp(atmosphereStrength, 0.0, 1.0) * 0.6 * (1.0 - sunPen * 0.3));
                        scatteredLight += transmittance * (1.0 - stepExp) * S;
                        transmittance *= stepExp;
                    }
                }
            }
            t += FIXED_STEP;
        }
        transmittance = mix(1.0, transmittance, horizonFade);
        float finalOpacity = (1.0 - transmittance) * totalContinuity;
        fragColor = vec4(mix(baseColor.rgb, baseColor.rgb * transmittance + scatteredLight * horizonFade, totalContinuity), 1.0);
    }
`;

const cloudShadowShader = `
    uniform sampler2D colorTexture;
    uniform sampler2D depthTexture;
    uniform sampler2D cloudMask;
    uniform sampler2D weatherTexture;
    uniform float time;
    uniform vec2 resolution;
    uniform float cloudCoverage;
    uniform float cloudBaseHeight;
    uniform float cloudTopHeight;
    uniform float scale;
    uniform vec2 drift;
    uniform vec3 sunDirection;
    uniform float shadowStrength;
    uniform float cameraAltitude;
    in vec2 v_textureCoordinates;
    out vec4 fragColor;

    void main() {
        vec2 uv = v_textureCoordinates;
        vec4 baseColor = texture(colorTexture, uv);
        vec2 px = 1.0 / resolution;
        float depth1 = czm_readDepth(depthTexture, uv);
        float depth2 = czm_readDepth(depthTexture, uv + vec2(px.x, 0.0));
        float depth3 = czm_readDepth(depthTexture, uv + vec2(0.0, px.y));
        float depth4 = czm_readDepth(depthTexture, uv + px);
        float depth = min(min(depth1, depth2), min(depth3, depth4));
        
        vec4 rayEC = czm_inverseProjection * vec4(uv * 2.0 - 1.0, 1.0, 1.0);
        vec3 rayDirEC = normalize(rayEC.xyz / rayEC.w);
        vec3 rayDir = normalize(czm_inverseViewRotation * rayDirEC);
        vec4 eyePos = czm_windowToEyeCoordinates(gl_FragCoord.xy, depth);
        float sceneEyeZ = eyePos.z / max(eyePos.w, 0.000001);
        float sceneT = sceneEyeZ / min(rayDirEC.z, -0.000001);
        // Correct Shadow Occlusion Bias: ensures shadows only appear on ground in front of sky.
        if (depth >= 0.99999 || sceneT > 40000.0) sceneT = 40000.0; 
        
        vec3 offset = rayDir * sceneT;
        vec3 camUp = normalize(czm_viewerPositionWC);
        vec3 sunDir = normalize(sunDirection);
        float sunUp = dot(sunDir, camUp);
        // Smooth Sun Cutoff: replace binary drop-out with a smooth fade near horizon.
        float sunContinuity = smoothstep(0.0, 0.04, sunUp);
        
        float h_ground = cameraAltitude + dot(offset, camUp);
        float h_target = mix(cloudBaseHeight, cloudTopHeight, 0.45);
        float toCloud = (h_target - h_ground) / max(sunUp, 0.02);
        
        // Final shadow contribution weight
        float totalShadowContinuity = sunContinuity * smoothstep(40000.0, 15000.0, sceneT);
        if (totalShadowContinuity < 0.001 || toCloud <= 0.0) { fragColor = baseColor; return; }
        
        // Stabilize shadow mask by adding a generous bias to the coverage lookup
        // and using smoothstep instead of a hard binary test.
        float R_earth = 6378137.0;
        float camR = R_earth + cameraAltitude;
        vec3 camNormW = normalize(czm_viewerPositionWC);
        vec3 totalOffset = offset + sunDir * toCloud;
        vec3 sampleDir = normalize(camNormW + totalOffset / camR);
        vec2 flow = vec2(atan(sampleDir.y, sampleDir.x), asin(clamp(sampleDir.z, -1.0, 1.0))) * R_earth / (scale * 0.5) + drift * time * 50.0;
        float maskVal = texture(cloudMask, fract(flow * 0.02)).r;
        float maskVal2 = texture(cloudMask, fract(flow * 0.011 + vec2(0.17, 0.31))).r;
        float maskDetail = texture(cloudMask, fract(flow * 0.065 + vec2(0.09, 0.41))).r;
        vec3 weather = texture(weatherTexture, fract(flow * 0.005)).rgb;
        float weatherMask = mix(1.0, clamp(clamp(maskVal * 0.45 + maskVal2 * 0.35 + weather.r * 0.55, 0.0, 1.0) * 0.72 + maskDetail * 0.28, 0.0, 1.0), 0.86);
        
        float covRef = mix(0.74, 0.24, clamp(cloudCoverage, 0.0, 1.0));
        // Smoothly fade shadow near coverage threshold to hide depth jitter
        float shadow = smoothstep(covRef + 0.20, covRef - 0.40, weatherMask);
        // Apply smooth shadow continuity
        shadow *= totalShadowContinuity;
        
        fragColor = vec4(mix(baseColor.rgb, baseColor.rgb * (1.0 - shadow * shadowStrength * 0.6 * mix(0.5, 1.0, weather.g)) + vec3(0.5, 0.65, 0.88) * baseColor.rgb * shadow * 0.3, totalShadowContinuity), 1.0);
    }
`;

const fogShader = `
    uniform sampler2D colorTexture;
    uniform sampler2D depthTexture;
    uniform float fogDensity;
    uniform float cameraAltitude;
    uniform vec2 resolution;
    in vec2 v_textureCoordinates;
    out vec4 fragColor;
    void main() {
        vec2 uv = v_textureCoordinates;
        vec4 baseColor = texture(colorTexture, uv);
        if (fogDensity <= 0.0001) { fragColor = baseColor; return; }
        // 4-Tap Min-Depth Filter for fog stability
        vec2 px = 1.0 / resolution;
        float depth1 = czm_readDepth(depthTexture, uv);
        float depth2 = czm_readDepth(depthTexture, uv + vec2(px.x, 0.0));
        float depth3 = czm_readDepth(depthTexture, uv + vec2(0.0, px.y));
        float depth4 = czm_readDepth(depthTexture, uv + px);
        float depth = min(min(depth1, depth2), min(depth3, depth4));
        vec4 rayEC = czm_inverseProjection * vec4(uv * 2.0 - 1.0, 1.0, 1.0);
        vec3 rayDirEC = normalize(rayEC.xyz / rayEC.w);
        vec4 eyePos = czm_windowToEyeCoordinates(gl_FragCoord.xy, depth);
        float sceneEyeZ = eyePos.z / max(eyePos.w, 0.000001);
        float sceneT = sceneEyeZ / min(rayDirEC.z, -0.000001);
        // Stabilize fog distance: snap large distances and clamp to 80km
        if (depth >= 0.99999 || sceneT > 80000.0) sceneT = 80000.0; 
        float f = 1.0 - exp(-sceneT * fogDensity * 0.0001);
        vec3 up = normalize(czm_viewerPositionWC);
        float finalFog = clamp(f * exp(-(cameraAltitude + dot(normalize(czm_inverseViewRotation * rayDirEC) * sceneT, up)) * 0.002), 0.0, 1.0);
        fragColor = vec4(mix(baseColor.rgb, mix(vec3(0.5, 0.6, 0.7), vec3(0.7, 0.8, 0.9), smoothstep(-0.2, 0.2, dot(normalize(czm_inverseViewRotation * rayDirEC), up))), finalFog), 1.0);
    }
`;

export class CesiumWeatherSystem {
    constructor(viewer, params) {
        this.viewer = viewer;
        this.params = params;
        this.elapsedTime = 0;
        this.rainAudioPool = [];
        this.thunderAudioPool = [];
        this.rainAudioIsPlaying = false;
        this.initPostProcess();
        this.initAudio();
        this.viewer.scene.preUpdate.addEventListener(this.update.bind(this));
    }
    initPostProcess() {
        const scene = this.viewer.scene;
        // Clean slate to prevent stage accumulation during hot-reloads
        scene.postProcessStages.removeAll();
        
        this.rainStage = new PostProcessStage({ name: 'RainStage', fragmentShader: rainShader, uniforms: { time: () => this.elapsedTime, screenIntensity: () => this.params.rainScreenIntensity, veilIntensity: () => this.params.rainVeilIntensity, dropSize: () => this.params.rainDropSize, rainSpeed: () => this.params.rainSpeed, resolution: () => new Cartesian2(scene.canvas.width, scene.canvas.height) } });
        this.snowStage = new PostProcessStage({ name: 'SnowStage', fragmentShader: snowShader, uniforms: { time: () => this.elapsedTime, intensity: () => this.params.snowIntensity, snowSpeed: () => this.params.snowSpeed, resolution: () => new Cartesian2(scene.canvas.width, scene.canvas.height) } });
        this.cloudStage = new PostProcessStage({ name: 'CloudStage', fragmentShader: cloudShader, uniforms: { cloudMask: '/textures/cloud-mask.png', weatherTexture: '/textures/weather3.png', time: () => this.elapsedTime, resolution: () => new Cartesian2(scene.canvas.width, scene.canvas.height), cloudCoverage: () => this.params.cloudCoverage, cloudDensity: () => this.params.cloudDensity, cloudBaseHeight: () => this.params.cloudBaseHeight || 1500.0, cloudTopHeight: () => this.params.cloudTopHeight || 6000.0, scale: () => 90000.0, detailScale: () => 3.8, softness: () => 0.12, drift: () => new Cartesian2(0.003, 0.001), sunDirection: () => { const l = scene.light; if (l && l.direction) { const d = Cartesian3.negate(l.direction, new Cartesian3()); return Cartesian3.normalize(d, d); } return Cartesian3.normalize(new Cartesian3(0.35, 0.25, 0.9), new Cartesian3()); }, atmosphereStrength: () => this.params.cloudAtmosphereStrength || 0.68, absorptionStrength: () => this.params.cloudAbsorptionStrength || 0.58, cameraAltitude: () => scene.camera.positionCartographic.height } });
        this.cloudShadowStage = new PostProcessStage({ name: 'CloudShadowStage', fragmentShader: cloudShadowShader, uniforms: { cloudMask: '/textures/cloud-mask.png', weatherTexture: '/textures/weather3.png', time: () => this.elapsedTime, resolution: () => new Cartesian2(scene.canvas.width, scene.canvas.height), cloudCoverage: () => this.params.cloudCoverage, cloudBaseHeight: () => this.params.cloudBaseHeight || 1500.0, cloudTopHeight: () => this.params.cloudTopHeight || 6000.0, scale: () => 90000.0, drift: () => new Cartesian2(0.003, 0.001), sunDirection: () => { const l = scene.light; if (l && l.direction) { const d = Cartesian3.negate(l.direction, new Cartesian3()); return Cartesian3.normalize(d, d); } return Cartesian3.normalize(new Cartesian3(0.35, 0.25, 0.9), new Cartesian3()); }, shadowStrength: () => this.params.cloudShadowStrength || 0.42, cameraAltitude: () => scene.camera.positionCartographic.height } });
        this.fogStage = new PostProcessStage({ name: 'FogStage', fragmentShader: fogShader, uniforms: { fogDensity: () => this.params.fogEnabled ? this.params.fogDensity : 0.0, cameraAltitude: () => scene.camera.positionCartographic.height, resolution: () => new Cartesian2(scene.canvas.width, scene.canvas.height) } });
        
        // Correct Execution Order: Clouds -> Shadows -> Fog -> Rain -> Snow
        scene.postProcessStages.add(this.cloudStage);
        scene.postProcessStages.add(this.cloudShadowStage);
        scene.postProcessStages.add(this.fogStage);
        scene.postProcessStages.add(this.rainStage);
        scene.postProcessStages.add(this.snowStage);
        scene.postProcessStages.bloom.enabled = true;
    }
    initAudio() {
        this.rainAudioPool = Array.from({ length: 2 }, () => { const a = new Audio('/audio/rain-calming.mp3'); a.loop = true; a.preload = 'auto'; a.volume = 0; a.crossOrigin = 'anonymous'; return a; });
        this.thunderAudioPool = Array.from({ length: 3 }, () => { const a = new Audio('/audio/thunder-close.mp3'); a.preload = 'auto'; a.crossOrigin = 'anonymous'; return a; });
    }
    update(scene, time) {
        this.elapsedTime += 0.016;
        this.rainStage.enabled = Boolean(this.params.rainEnabled);
        this.snowStage.enabled = Boolean(this.params.snowEnabled);
        this.cloudShadowStage.enabled = (this.params.cloudShadowStrength || 0) > 0.001;
        if (this.params.rainAudioEnabled && this.params.rainEnabled) {
            if (!this.rainAudioIsPlaying) { this.rainAudioPool[0].play().catch(() => {}); this.rainAudioIsPlaying = true; }
            this.rainAudioPool[0].volume = this.params.rainAudioVolume;
        } else {
            this.rainAudioPool.forEach(a => { a.volume = 0; a.pause(); });
            this.rainAudioIsPlaying = false;
        }
        if (this.params.bloomStrength > 0) {
            scene.postProcessStages.bloom.enabled = true;
            scene.postProcessStages.bloom.uniforms.contrast = 120 + this.params.bloomStrength * 80;
            scene.postProcessStages.bloom.uniforms.sigma = 1 + this.params.bloomRadius * 2;
        } else { scene.postProcessStages.bloom.enabled = false; }
        if (this.params.lightningEnabled && this.params.rainEnabled && Math.random() < 0.005) { this.triggerLightning(); }
    }
    triggerLightning() {
        const t = this.thunderAudioPool.find(a => a.paused || a.ended);
        if (t && this.params.rainAudioEnabled) { t.volume = this.params.thunderVolume || 0.8; t.currentTime = 0; t.play().catch(() => {}); }
        const intensity = this.viewer.scene.light.intensity;
        this.viewer.scene.light.intensity = this.params.lightningIntensity * 5.0 || 5.0;
        setTimeout(() => { if (this.viewer && this.viewer.scene) this.viewer.scene.light.intensity = intensity; }, 150);
    }
}
