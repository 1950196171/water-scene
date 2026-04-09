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
uniform float u_foamThreshold;

float hash(vec2 p) {
    p = fract(p * vec2(5.3983, 5.4427));
    p += dot(p.yx, p.xy + vec2(21.5351, 14.3137));
    return fract(p.x * p.y * 95.4337);
}

float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i + vec2(0.0, 0.0)),
                   hash(i + vec2(1.0, 0.0)), u.x),
               mix(hash(i + vec2(0.0, 1.0)),
                   hash(i + vec2(1.0, 1.0)), u.x), u.y);
}

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
    vec3 detailNormalEC = normalize(materialInput.tangentToEyeMatrix * detailNormal);
    vec3 normal = normalize(mix(v_normalEC, detailNormalEC, 0.55));
    vec3 viewDir = normalize(materialInput.positionToEyeEC);
    vec3 lightDir = normalize(czm_lightDirectionEC);
    float viewDistance = length(materialInput.positionToEyeEC);
    float fresnel = pow(1.0 - max(dot(normal, viewDir), 0.0), 5.0);

    float foamNoise = noise(waveCoord * 0.018 + vec2(time * 0.16, -time * 0.09));
    float foamSignal = v_waveSlope * 0.92 + max(v_waveHeight, 0.0) * 0.22 + foamNoise * 0.38;
    float foam = smoothstep(u_foamThreshold * 0.65, u_foamThreshold, foamSignal);
    foam += smoothstep(0.12, 0.55, max(v_waveHeight, 0.0) / max(waveAmplitude, 0.001)) * 0.22;
    foam = clamp(foam, 0.0, 1.0);

    float bodyMix = clamp(0.42 + fresnel * 0.35 + foamNoise * 0.08 - v_waveSlope * 0.05, 0.0, 1.0);
    float horizonMix = smoothstep(400.0, 2600.0, viewDistance);
    vec3 deepColor = u_waterColor1.rgb * vec3(0.7, 0.82, 0.9);
    vec3 surfaceColor = mix(u_waterColor1.rgb, u_waterColor2.rgb, bodyMix);
    vec3 horizonColor = mix(surfaceColor, u_waterColor2.rgb * vec3(1.25, 1.28, 1.35), horizonMix * 0.65);
    vec3 finalColor = mix(deepColor, horizonColor, 0.55 + fresnel * 0.45);
    finalColor = mix(finalColor, vec3(0.9, 0.97, 1.0), foam * 0.72);

    float specular = pow(max(dot(normalize(lightDir + viewDir), normal), 0.0), mix(110.0, 280.0, fresnel));
    float glint = pow(max(dot(reflect(-lightDir, normal), viewDir), 0.0), 420.0) * (0.45 + foamNoise * 0.55);
    vec3 sparkle = vec3(1.0, 0.96, 0.88) * specular * 0.85 + vec3(1.0) * glint * 0.45;

    material.diffuse = finalColor;
    material.emission = sparkle + vec3(foam) * 0.04;
    material.alpha = 0.97;
    material.normal = normal;
    material.specular = mix(0.9, 0.18, foam);
    material.shininess = mix(220.0, 48.0, foam);
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
            waveAmplitude: options.waveAmplitude || 1.5,
            waveLength: options.waveLength || 60.0,
            waveSpeed: options.waveSpeed || 1.2,
            waterColor1: options.waterColor1 || '#052336', // Deep water color
            waterColor2: options.waterColor2 || '#1b4a68', // Shallow/Sky reflection color
            foamThreshold: options.foamThreshold || 0.15
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
            height: 20.0
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
                    u_foamThreshold: this.params.foamThreshold
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
        uniforms.u_foamThreshold = this.params.foamThreshold;
    }

    setParams(newParams) {
        const requiresRebuild = ['waveAmplitude', 'waveLength', 'waveSpeed']
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
