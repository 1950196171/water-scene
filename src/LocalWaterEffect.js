import {
    Primitive,
    GeometryInstance,
    RectangleGeometry,
    EllipsoidSurfaceAppearance,
    Material,
    Color,
    Math as CesiumMath,
    Rectangle
} from 'cesium';

// ==========================================
// 局部水面特效 (Gerstner Waves + Foam + PBR-like water)
// ==========================================

function glslFloat(value) {
    return Number(value).toFixed(6);
}

function estimateSurfaceSize(bounds) {
    const [west, south, east, north] = bounds;
    const meanLatRad = ((south + north) * 0.5) * Math.PI / 180.0;
    const width = Math.max(1.0, Math.abs(east - west) * 111320.0 * Math.cos(meanLatRad));
    const height = Math.max(1.0, Math.abs(north - south) * 110540.0);
    return { width, height };
}

function createWaterVertexShader(params, surfaceSize) {
    return `
in vec3 position3DHigh;
in vec3 position3DLow;
in vec2 st;
in float batchId;

out vec3 v_positionEC;
out vec3 v_positionMC;
out vec3 v_normalEC;
out vec2 v_st;
out float v_waveHeight;
out float v_waveSlope;

vec2 waveDX(vec2 position, vec2 direction, float frequency, float timeShift) {
    float x = dot(direction, position) * frequency + timeShift;
    float wave = exp(sin(x) - 1.0);
    float derivative = wave * cos(x);
    return vec2(wave, -derivative);
}

vec3 sampleOcean(vec2 position, float time, float baseFrequency) {
    float iter = 0.0;
    float frequency = baseFrequency;
    float timeMultiplier = 1.0;
    float weight = 1.0;
    float weightedSum = 0.0;
    float weightSum = 0.0;
    vec2 dragPosition = position;
    vec2 gradient = vec2(0.0);

    for (int i = 0; i < 7; i++) {
        vec2 direction = normalize(vec2(sin(iter), cos(iter)));
        vec2 wave = waveDX(dragPosition, direction, frequency, time * timeMultiplier);
        gradient += direction * wave.y * weight * frequency;
        dragPosition += direction * wave.y * weight * 0.24;
        weightedSum += wave.x * weight;
        weightSum += weight;
        weight *= 0.82;
        frequency *= 1.18;
        timeMultiplier *= 1.07;
        iter += 1232.399963;
    }

    return vec3(weightedSum / weightSum, gradient);
}

void main() {
    vec4 p = czm_computePosition();
    vec3 positionEC = (czm_modelViewRelativeToEye * p).xyz;
    vec3 position3D = position3DHigh + position3DLow;
    vec3 normal3D = normalize(position3D);
    vec3 normalEC = czm_normal * normal3D;
    mat3 tangentToEye = czm_eastNorthUpToEyeCoordinates(position3D, normalEC);

    float waveAmplitude = ${glslFloat(params.waveAmplitude)};
    float waveLength = ${glslFloat(params.waveLength)};
    float waveSpeed = ${glslFloat(params.waveSpeed)};
    float time = czm_frameNumber * 0.014 * waveSpeed;
    float baseFrequency = 6.28318530718 / max(waveLength, 1.0);
    vec2 waveCoord = (st - 0.5) * vec2(${glslFloat(surfaceSize.width)}, ${glslFloat(surfaceSize.height)});

    vec3 ocean = sampleOcean(waveCoord, time, baseFrequency);
    float centeredWave = (ocean.x - 0.42) * waveAmplitude * 2.4;
    vec2 slope = ocean.yz * waveAmplitude * 2.4;

    vec3 tangentNormal = normalize(vec3(-slope.x, 1.0, -slope.y));
    vec3 displacedPositionEC = positionEC + normalEC * centeredWave;

    gl_Position = czm_projection * vec4(displacedPositionEC, 1.0);
    v_positionEC = displacedPositionEC;
    v_positionMC = position3D;
    v_normalEC = normalize(tangentToEye * tangentNormal);
    v_st = st;
    v_waveHeight = centeredWave;
    v_waveSlope = length(slope);
}
`;
}

function createWaterFragmentSource(params, surfaceSize) {
    return `
in vec3 v_normalEC;
in float v_waveHeight;
in float v_waveSlope;

uniform vec4 u_waterColor1;
uniform vec4 u_waterColor2;
uniform float u_fresnelBias;
uniform float u_fresnelScale;
uniform float u_fresnelPower;
uniform float u_reflectionStrength;
uniform sampler2D u_normalMap;
uniform float u_normalMapRepeat;
uniform float u_normalMapStrength;
uniform float u_normalMapSpeed;
uniform float u_normalMapBlend;
uniform vec4 u_shallowColor;
uniform float u_shallowDepth;
uniform float u_shallowFade;
uniform float u_shallowAlpha;

vec2 waveDX(vec2 position, vec2 direction, float frequency, float timeShift) {
    float x = dot(direction, position) * frequency + timeShift;
    float wave = exp(sin(x) - 1.0);
    float derivative = wave * cos(x);
    return vec2(wave, -derivative);
}

vec3 sampleOcean(vec2 position, float time, float baseFrequency) {
    float iter = 0.0;
    float frequency = baseFrequency;
    float timeMultiplier = 1.0;
    float weight = 1.0;
    float weightedSum = 0.0;
    float weightSum = 0.0;
    vec2 dragPosition = position;
    vec2 gradient = vec2(0.0);

    for (int i = 0; i < 9; i++) {
        vec2 direction = normalize(vec2(sin(iter), cos(iter)));
        vec2 wave = waveDX(dragPosition, direction, frequency, time * timeMultiplier);
        gradient += direction * wave.y * weight * frequency;
        dragPosition += direction * wave.y * weight * 0.22;
        weightedSum += wave.x * weight;
        weightSum += weight;
        weight *= 0.81;
        frequency *= 1.19;
        timeMultiplier *= 1.08;
        iter += 1232.399963;
    }

    return vec3(weightedSum / weightSum, gradient);
}

float getWaterColumnDepth(vec3 waterPositionToEyeEC) {
    vec2 depthUv = gl_FragCoord.xy / czm_viewport.zw;
    float terrainLogDepth = czm_unpackDepth(texture(czm_globeDepthTexture, depthUv));

    if (terrainLogDepth <= 0.0) {
        return 1.0e6;
    }

    vec4 terrainPositionEC4 = czm_windowToEyeCoordinates(gl_FragCoord.xy, terrainLogDepth);
    vec3 terrainPositionEC = terrainPositionEC4.xyz / terrainPositionEC4.w;
    vec3 waterPositionEC = -waterPositionToEyeEC;
    float terrainDistance = length(terrainPositionEC);
    float waterDistance = length(waterPositionEC);
    return max(terrainDistance - waterDistance, 0.0);
}

czm_material czm_getMaterial(czm_materialInput materialInput) {
    czm_material material = czm_getDefaultMaterial(materialInput);
    float waveAmplitude = ${glslFloat(params.waveAmplitude)};
    float waveLength = ${glslFloat(params.waveLength)};
    float waveSpeed = ${glslFloat(params.waveSpeed)};
    float time = czm_frameNumber * 0.014 * waveSpeed;
    float baseFrequency = 6.28318530718 / max(waveLength, 1.0);
    vec2 waveCoord = (materialInput.st - 0.5) * vec2(${glslFloat(surfaceSize.width)}, ${glslFloat(surfaceSize.height)});

    vec3 detailOcean = sampleOcean(waveCoord * 1.7 + vec2(17.0, -11.0), time * 1.15, baseFrequency * 1.85);
    vec2 detailSlope = detailOcean.yz * waveAmplitude * 1.15;
    vec3 detailNormal = normalize(vec3(-detailSlope.x, 1.0, -detailSlope.y));
    vec4 normalNoise = czm_getWaterNoise(
        u_normalMap,
        materialInput.st * u_normalMapRepeat * 220.0 + waveCoord * 0.0015,
        time * u_normalMapSpeed,
        0.0
    );
    vec3 normalMapTS = normalize(vec3(normalNoise.xy * u_normalMapStrength, 1.0));
    vec3 combinedDetailNormal = normalize(mix(detailNormal, normalMapTS, clamp(u_normalMapBlend, 0.0, 1.0)));
    vec3 detailNormalEC = normalize(materialInput.tangentToEyeMatrix * combinedDetailNormal);
    vec3 normal = normalize(mix(v_normalEC, detailNormalEC, 0.72));
    vec3 viewDir = normalize(materialInput.positionToEyeEC);
    vec3 lightDir = normalize(czm_lightDirectionEC);
    float viewDistance = length(materialInput.positionToEyeEC);
    float NoV = clamp(dot(normal, viewDir), 0.0, 1.0);
    float fresnel = clamp(u_fresnelBias + u_fresnelScale * pow(1.0 - NoV, max(u_fresnelPower, 0.001)), 0.0, 1.0);
    float waterColumnDepth = getWaterColumnDepth(materialInput.positionToEyeEC);
    float shallowMix = 1.0 - smoothstep(u_shallowDepth, u_shallowDepth + max(u_shallowFade, 0.001), waterColumnDepth);

    float bodyMix = clamp(0.42 + fresnel * 0.35 - v_waveSlope * 0.05, 0.0, 1.0);
    float horizonMix = smoothstep(400.0, 2600.0, viewDistance);
    vec3 deepColor = u_waterColor1.rgb * vec3(0.7, 0.82, 0.9);
    vec3 surfaceColor = mix(u_waterColor1.rgb, u_waterColor2.rgb, bodyMix);
    vec3 horizonColor = mix(surfaceColor, u_waterColor2.rgb * vec3(1.25, 1.28, 1.35), horizonMix * 0.65);
    vec3 reflectedDir = reflect(-viewDir, normal);
    float skyBlend = clamp(reflectedDir.y * 0.5 + 0.5, 0.0, 1.0);
    vec3 reflectionSky = mix(
        u_waterColor2.rgb * vec3(1.18, 1.16, 1.12),
        vec3(0.72, 0.84, 0.98),
        pow(skyBlend, 1.35)
    );
    float sunReflection = pow(max(dot(reflectedDir, lightDir), 0.0), mix(180.0, 520.0, fresnel));
    vec3 reflectionColor = reflectionSky * (0.6 + horizonMix * 0.4)
        + vec3(1.0, 0.96, 0.9) * sunReflection * (0.55 + horizonMix * 0.45);
    vec3 finalColor = mix(deepColor, horizonColor, 0.55 + fresnel * 0.45);
    finalColor = mix(finalColor, reflectionColor, fresnel * u_reflectionStrength);
    finalColor = mix(finalColor, u_shallowColor.rgb, shallowMix * (0.72 - fresnel * 0.18));

    float specular = pow(max(dot(normalize(lightDir + viewDir), normal), 0.0), mix(110.0, 280.0, fresnel));
    float glint = pow(max(dot(reflect(-lightDir, normal), viewDir), 0.0), 420.0);
    vec3 sparkle = vec3(1.0, 0.96, 0.88) * specular * 0.85 + vec3(1.0) * glint * 0.2;

    material.diffuse = finalColor;
    material.emission = sparkle + u_shallowColor.rgb * shallowMix * 0.05;
    material.alpha = mix(u_shallowAlpha, 0.97, 1.0 - shallowMix);
    material.normal = normal;
    material.specular = 0.78;
    material.shininess = 180.0;
    return material;
}
`;
}


export class LocalWaterEffect {
    constructor(viewer, options = {}) {
        this.viewer = viewer;
        this.primitive = null;

        // Configuration
        // Longitude: 119.33649918542253
        // Latitude: 25.299193911074877
        // Longitude: 119.35435883149441
        // Latitude: 25.326187439777247
        // Longitude: 119.38584559144647
        // Latitude: 25.264754845185497
        // Longitude: 119.40100354369514
        // Latitude: 25.29351423113237
        this.bounds = options.bounds || [119.33649918542253, 25.264754845185497, 119.40100354369514, 25.326187439777247]; // [west, south, east, north]
        this.params = {
            surfaceHeight: options.surfaceHeight ?? 20.0,
            waveAmplitude: options.waveAmplitude || 1.5,
            waveLength: options.waveLength || 60.0,
            waveSpeed: options.waveSpeed || 1.2,
            waterColor1: options.waterColor1 || '#052336', // Deep water color
            waterColor2: options.waterColor2 || '#1b4a68', // Shallow/Sky reflection color
            fresnelBias: options.fresnelBias ?? 0.04,
            fresnelScale: options.fresnelScale ?? 0.96,
            fresnelPower: options.fresnelPower ?? 5.0,
            reflectionStrength: options.reflectionStrength ?? 0.72,
            normalMapUrl: options.normalMapUrl || '/textures/waternormals.jpg',
            normalMapRepeat: options.normalMapRepeat ?? 1.25,
            normalMapStrength: options.normalMapStrength ?? 0.68,
            normalMapSpeed: options.normalMapSpeed ?? 0.85,
            normalMapBlend: options.normalMapBlend ?? 0.78,
            shallowColor: options.shallowColor || '#63b7c8',
            shallowDepth: options.shallowDepth ?? 2.0,
            shallowFade: options.shallowFade ?? 8.0,
            shallowAlpha: options.shallowAlpha ?? 0.58
        };

        this.timeOffset = 0;
        this.surfaceSize = estimateSurfaceSize(this.bounds);
        this.init();
    }

    init() {
        this.createPrimitive();

        // Animation Hook
        this.preUpdateHandler = this.viewer.scene.preUpdate.addEventListener(this.update.bind(this));
    }

    createPrimitive() {
        const [w, s, e, n] = this.bounds;
        const rectangle = Rectangle.fromDegrees(w, s, e, n);

        const geometry = new RectangleGeometry({
            rectangle: rectangle,
            vertexFormat: EllipsoidSurfaceAppearance.VERTEX_FORMAT,
            granularity: CesiumMath.RADIANS_PER_DEGREE / 1000.0,
            height: this.params.surfaceHeight
        });

        const instance = new GeometryInstance({
            geometry: geometry,
            id: 'local-water'
        });

        // Use custom Material with Fabric inside the standard Appearance
        // This is safe and fully integrated with Cesium lighting!
        const material = new Material({
            fabric: {
                type: 'LocalWaterWave',
                uniforms: {
                    u_waterColor1: Color.fromCssColorString(this.params.waterColor1),
                    u_waterColor2: Color.fromCssColorString(this.params.waterColor2),
                    u_fresnelBias: this.params.fresnelBias,
                    u_fresnelScale: this.params.fresnelScale,
                    u_fresnelPower: this.params.fresnelPower,
                    u_reflectionStrength: this.params.reflectionStrength,
                    u_normalMap: this.params.normalMapUrl,
                    u_normalMapRepeat: this.params.normalMapRepeat,
                    u_normalMapStrength: this.params.normalMapStrength,
                    u_normalMapSpeed: this.params.normalMapSpeed,
                    u_normalMapBlend: this.params.normalMapBlend,
                    u_shallowColor: Color.fromCssColorString(this.params.shallowColor),
                    u_shallowDepth: this.params.shallowDepth,
                    u_shallowFade: this.params.shallowFade,
                    u_shallowAlpha: this.params.shallowAlpha
                },
                source: createWaterFragmentSource(this.params, this.surfaceSize)
            }
        });

        // Patch the shaders via options during instantiation
        const appearance = new EllipsoidSurfaceAppearance({
            material: material,
            aboveGround: false,
            vertexShaderSource: createWaterVertexShader(this.params, this.surfaceSize)
        });

        this.primitive = new Primitive({
            geometryInstances: instance,
            appearance: appearance,
            asynchronous: false
        });

        this.viewer.scene.primitives.add(this.primitive);
    }

    update(scene, time) {
        if (!this.primitive || !this.primitive.appearance) return;

        const uniforms = this.primitive.appearance.material.uniforms;
        uniforms.u_waterColor1 = Color.fromCssColorString(this.params.waterColor1);
        uniforms.u_waterColor2 = Color.fromCssColorString(this.params.waterColor2);
        uniforms.u_fresnelBias = this.params.fresnelBias;
        uniforms.u_fresnelScale = this.params.fresnelScale;
        uniforms.u_fresnelPower = this.params.fresnelPower;
        uniforms.u_reflectionStrength = this.params.reflectionStrength;
        uniforms.u_normalMap = this.params.normalMapUrl;
        uniforms.u_normalMapRepeat = this.params.normalMapRepeat;
        uniforms.u_normalMapStrength = this.params.normalMapStrength;
        uniforms.u_normalMapSpeed = this.params.normalMapSpeed;
        uniforms.u_normalMapBlend = this.params.normalMapBlend;
        uniforms.u_shallowColor = Color.fromCssColorString(this.params.shallowColor);
        uniforms.u_shallowDepth = this.params.shallowDepth;
        uniforms.u_shallowFade = this.params.shallowFade;
        uniforms.u_shallowAlpha = this.params.shallowAlpha;
    }

    setParams(newParams) {
        const requiresRebuild = ['surfaceHeight', 'waveAmplitude', 'waveLength', 'waveSpeed']
            .some((key) => key in newParams && newParams[key] !== this.params[key]);
        Object.assign(this.params, newParams);

        if (requiresRebuild) {
            this.destroyPrimitive();
            this.createPrimitive();
        }
    }

    destroyPrimitive() {
        if (this.primitive) {
            this.viewer.scene.primitives.remove(this.primitive);
            this.primitive = null;
        }
    }

    destroy() {
        if (this.preUpdateHandler) {
            this.preUpdateHandler();
            this.preUpdateHandler = null;
        }
        this.destroyPrimitive();
    }
}
