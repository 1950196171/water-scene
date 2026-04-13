import { GUI } from 'three/addons/libs/lil-gui.module.min.js';
import 'cesium/Build/Cesium/Widgets/widgets.css';
import {
    ArcGisMapServerImageryProvider,
    Cartesian3,
    Color,
    createWorldTerrainAsync,
    DirectionalLight,
    EllipsoidTerrainProvider,
    HeadingPitchRoll,
    Ion,
    Math as CesiumMath,
    Matrix3,
    Matrix4,
    Model,
    ModelAnimationLoop,
    OpenStreetMapImageryProvider,
    ScreenSpaceEventHandler,
    ScreenSpaceEventType,
    Transforms,
    Viewer,
    defined as CesiumDefined
} from 'cesium';
import { DEFAULT_SCENE_PARAMS, WEATHER_PRESETS } from './weatherPresets.js';
import { CesiumWeatherPlugin } from './cesiumWeatherEffects.js';
import { LocalWaterEffect } from './LocalWaterEffect.js';
import { WaterReflectionEffect } from './WaterReflectionEffect.js';

class CesiumWeatherApp {
    constructor(container) {
        this.container = container;
        this.viewer = null;
        this.gui = null;
        this.mouseHandler = null;
        this.weatherPlugin = null;
        this.localWater = null;
        this.waterReflection = null;
        this.waterBounds = [119.18113701279704, 25.10883264778591, 119.4475534974461, 25.473835616200297];
        this.params = { ...DEFAULT_SCENE_PARAMS };

        this.waterParams = {
            surfaceHeight: 20.0,
            enabled: true,
            planarReflectionEnabled: true,
            waveAmplitude: 5.3,
            waveLength: 155.0,
            waveSpeed: 0.9,
            waterColor1: '#000000',
            waterColor2: '#4d87a6',
            fresnelBias: 0.11,
            fresnelScale: 0.76,
            fresnelPower: 4.8,
            reflectionStrength: 1.18,
            normalMapRepeat: 3.25,
            normalMapStrength: 1.68,
            normalMapSpeed: 0.22,
            normalMapBlend: 1,
            shallowColor: '#63b7c8',
            shallowDepth: 0.0,
            shallowFade: 6.0,
            shallowAlpha: 0.48
        };
    }

    async init() {
        Ion.defaultAccessToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiJkY2IwMmVlMy0xZmQzLTQ0MWMtOTAyMi02NGU5MTJhM2ExMzgiLCJpZCI6MjI4ODY2LCJpYXQiOjE3MjExODQwMDl9.Ii0oqgbb5NJMzHtP46t53OSOp8ceduG1N5BwYgRCIUk';

        const terrainProvider = await this.createTerrainProvider();

        this.viewer = new Viewer(this.container, {
            terrainProvider,
            animation: false,
            timeline: false,
            geocoder: false,
            homeButton: false,
            sceneModePicker: false,
            baseLayerPicker: false,
            navigationHelpButton: false,
            fullscreenButton: false,
            infoBox: false,
            selectionIndicator: false,
            shouldAnimate: true
        });

        this.viewer.scene.sun.show = true;
        this.viewer.scene.sun.glowFactor = 0.08;
        this.viewer.scene.sunBloom = false;
        this.viewer.scene.moon.show = false;
        this.viewer.scene.postProcessStages.fxaa.enabled = true;

        this.weatherPlugin = new CesiumWeatherPlugin({ params: this.params });
        this.weatherPlugin.install(this.viewer);

        this.mouseHandler = handleMouseEvents(this.viewer);
        await this.setupBaseLayer();
        this.setupCamera();
        this.setupLocalWater();
        this.setupWaterReflection();
        let rotationAngle = 0;

        await addWindTurbine(this.viewer);
        this.registerTurbinesForReflection();
        this.applyParams(this.params);
    }

    async createTerrainProvider() {
        try {
            return await createWorldTerrainAsync({});
        } catch (error) {
            console.warn('WorldTerrain load failed, falling back to ellipsoid terrain.', error);
            return new EllipsoidTerrainProvider();
        }
    }

    async setupBaseLayer() {
        const layers = this.viewer.imageryLayers;
        layers.removeAll();

        const arcgisProvider = await ArcGisMapServerImageryProvider.fromUrl(
            'https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer'
        );
        layers.addImageryProvider(arcgisProvider);

        layers.addImageryProvider(new OpenStreetMapImageryProvider({
            url: 'https://tile.openstreetmap.org/'
        }));
        layers.get(1).alpha = 0.15;
    }

    setupCamera() {
        this.viewer.scene.camera.setView({
            destination: Cartesian3.fromDegrees(121.4737, 31.2304, 2000),
            orientation: new HeadingPitchRoll(
                CesiumMath.toRadians(0),
                CesiumMath.toRadians(-25),
                0
            )
        });
    }

    setupLocalWater() {
        this.localWater = new LocalWaterEffect(this.viewer, {
            bounds: this.waterBounds,
            ...this.waterParams
        });

        if (!this.waterParams.enabled && this.localWater.primitive) {
            this.localWater.primitive.show = false;
        }
    }

    setupWaterReflection() {
        this.waterReflection = new WaterReflectionEffect(this.viewer, {
            waterEffect: this.localWater,
            bounds: this.waterBounds,
            ...this.waterParams
        });
    }

    /**
     * 收集场景中所有风机 Model，注册到反射模块做 ClippingPlane 裁剪。
     * 在 addWindTurbine() 之后调用。
     */
    registerTurbinesForReflection() {
        if (!this.waterReflection) return;

        const models = [];
        const primitives = this.viewer.scene.primitives;
        for (let i = 0; i < primitives.length; i++) {
            const p = primitives.get(i);
            if (p?.id === 'wind_turbine') {
                models.push(p);
            }
        }

        this.waterReflection.setModels(models);
    }

    setupControls() {
        const gui = new GUI({ title: 'Cesium 天气控制' });
        gui.domElement.style.marginTop = '12px';
        gui.domElement.style.marginRight = '12px';
        gui.domElement.style.zIndex = '120';
        this.gui = gui;

        const presetState = { preset: 'default' };
        const presetOptions = Object.fromEntries(
            Object.entries(WEATHER_PRESETS).map(([key, preset]) => [preset.label, key])
        );
        gui.add(presetState, 'preset', presetOptions)
            .name('天气预设')
            .onChange((presetKey) => {
                this.applyParams(WEATHER_PRESETS[presetKey].params);
                this.refreshGui();
            });

        const skyFolder = gui.addFolder('天空');
        skyFolder.add(this.params, 'elevation', -12, 90, 0.1).name('太阳高度').onChange(() => this.applyParams(this.params));
        skyFolder.add(this.params, 'azimuth', -180, 180, 0.1).name('太阳方位').onChange(() => this.applyParams(this.params));
        skyFolder.add(this.params, 'exposure', 0, 1, 0.01).name('曝光').onChange(() => this.applyParams(this.params));
        skyFolder.add(this.params, 'rayleigh', 0, 4, 0.01).name('瑞利散射').onChange(() => this.applyParams(this.params));

        const bloomFolder = gui.addFolder('泛光');
        bloomFolder.add(this.params, 'bloomStrength', 0, 1, 0.01).name('强度').onChange(() => this.applyParams(this.params));
        bloomFolder.add(this.params, 'bloomRadius', 0, 3, 0.01).name('半径').onChange(() => this.applyParams(this.params));

        const cloudFolder = gui.addFolder('云层');
        cloudFolder.add(this.params, 'cloudCoverage', 0, 1, 0.01).name('覆盖率').onChange(() => this.applyParams(this.params));
        cloudFolder.add(this.params, 'cloudDensity', 0, 1, 0.01).name('密度').onChange(() => this.applyParams(this.params));
        cloudFolder.add(this.params, 'cloudBaseHeight', 500, 12000, 100).name('云底高度').onChange(() => this.applyParams(this.params));
        cloudFolder.add(this.params, 'cloudTopHeight', 1000, 16000, 100).name('云顶高度').onChange(() => this.applyParams(this.params));

        const fogFolder = gui.addFolder('雾效');
        fogFolder.add(this.params, 'fogEnabled').name('启用').onChange(() => this.applyParams(this.params));
        fogFolder.add(this.params, 'fogDensity', 0, 2, 0.01).name('密度').onChange(() => this.applyParams(this.params));

        const rainFolder = gui.addFolder('雨效');
        rainFolder.add(this.params, 'rainEnabled').name('启用').onChange(() => this.applyParams(this.params));
        rainFolder.add(this.params, 'rainVeilIntensity', 0.5, 2.5, 0.01).name('雨幕强度').onChange(() => this.applyParams(this.params));
        rainFolder.add(this.params, 'rainAudioEnabled').name('雨声').onChange(() => this.applyParams(this.params));
        rainFolder.add(this.params, 'rainAudioVolume', 0, 1, 0.01).name('雨声音量').onChange(() => this.applyParams(this.params));
        rainFolder.add(this.params, 'lightningEnabled').name('闪电').onChange(() => this.applyParams(this.params));

        const snowFolder = gui.addFolder('雪效');
        snowFolder.add(this.params, 'snowEnabled').name('启用').onChange(() => this.applyParams(this.params));
        snowFolder.add(this.params, 'snowIntensity', 0, 1.5, 0.01).name('强度').onChange(() => this.applyParams(this.params));
        snowFolder.add(this.params, 'snowSpeed', 0.2, 2.2, 0.01).name('速度').onChange(() => this.applyParams(this.params));

        const waterFolder = gui.addFolder('局部海面 (Wind Farm Area)');
        const updateWater = () => {
            if (this.localWater) {
                this.localWater.setParams(this.waterParams);
                if (this.localWater.primitive) {
                    this.localWater.primitive.show = this.waterParams.enabled;
                }
            }

            if (this.waterParams.planarReflectionEnabled) {
                if (!this.waterReflection) {
                    this.setupWaterReflection();
                    this.registerTurbinesForReflection();
                }
                this.waterReflection?.setParams({
                    bounds: this.waterBounds,
                    ...this.waterParams
                });
            } else if (this.waterReflection) {
                this.waterReflection.destroy();
                this.waterReflection = null;
            }

            this.viewer.scene.requestRender();
        };

        waterFolder.add(this.waterParams, 'enabled').name('启用').onChange(updateWater);
        waterFolder.add(this.waterParams, 'waveAmplitude', 0, 20, 0.1).name('浪高').onChange(updateWater);
        waterFolder.add(this.waterParams, 'waveLength', 10, 500, 1).name('波长').onChange(updateWater);
        waterFolder.add(this.waterParams, 'waveSpeed', 0, 5, 0.01).name('流速').onChange(updateWater);
        waterFolder.add(this.waterParams, 'fresnelBias', 0, 0.2, 0.005).name('F0 偏置').onChange(updateWater);
        waterFolder.add(this.waterParams, 'fresnelScale', 0, 1.5, 0.01).name('菲涅尔缩放').onChange(updateWater);
        waterFolder.add(this.waterParams, 'fresnelPower', 1, 8, 0.1).name('菲涅尔指数').onChange(updateWater);
        waterFolder.add(this.waterParams, 'reflectionStrength', 0, 1.5, 0.01).name('反射强度').onChange(updateWater);
        waterFolder.add(this.waterParams, 'normalMapRepeat', 0.2, 4.0, 0.01).name('法线重复').onChange(updateWater);
        waterFolder.add(this.waterParams, 'normalMapStrength', 0, 2.0, 0.01).name('法线强度').onChange(updateWater);
        waterFolder.add(this.waterParams, 'normalMapSpeed', 0, 3.0, 0.01).name('法线流速').onChange(updateWater);
        waterFolder.add(this.waterParams, 'normalMapBlend', 0, 1, 0.01).name('法线混合').onChange(updateWater);
        waterFolder.addColor(this.waterParams, 'shallowColor').name('浅滩颜色').onChange(updateWater);
        waterFolder.add(this.waterParams, 'shallowDepth', 0, 12, 0.1).name('浅水深度').onChange(updateWater);
        waterFolder.add(this.waterParams, 'shallowFade', 0.5, 20, 0.1).name('浅水过渡').onChange(updateWater);
        waterFolder.add(this.waterParams, 'shallowAlpha', 0.1, 1, 0.01).name('浅滩透明').onChange(updateWater);
        waterFolder.addColor(this.waterParams, 'waterColor1').name('深水颜色').onChange(updateWater);
        waterFolder.addColor(this.waterParams, 'waterColor2').name('高光颜色').onChange(updateWater);

        [skyFolder, bloomFolder, cloudFolder, fogFolder, rainFolder, snowFolder].forEach((folder) => folder.close());
        waterFolder.open();
    }

    refreshGui() {
        if (!this.gui) {
            return;
        }

        this.gui.controllersRecursive().forEach((controller) => controller.updateDisplay());
    }

    applyParams(nextParams) {
        Object.assign(this.params, nextParams);
        if (this.params.cloudTopHeight <= this.params.cloudBaseHeight + 100.0) {
            this.params.cloudTopHeight = this.params.cloudBaseHeight + 100.0;
        }

        this.weatherPlugin?.setParams(this.params);

        const scene = this.viewer.scene;
        scene.highDynamicRange = true;
        scene.postProcessStages.exposure = CesiumMath.lerp(0.62, 1.18, CesiumMath.clamp(this.params.exposure, 0, 1));
        scene.globe.enableLighting = true;
        scene.globe.depthTestAgainstTerrain = true;

        scene.fog.enabled = Boolean(this.params.fogEnabled);
        scene.fog.density = CesiumMath.lerp(0.00002, 0.0012, CesiumMath.clamp(this.params.fogDensity / 2, 0, 1));
        scene.fog.minimumBrightness = CesiumMath.lerp(0.06, 0.02, CesiumMath.clamp(this.params.fogDensity / 2, 0, 1));

        if (scene.skyAtmosphere) {
            scene.skyAtmosphere.perFragmentAtmosphere = true;
            scene.skyAtmosphere.atmosphereLightIntensity = CesiumMath.lerp(6.5, 13.0, CesiumMath.clamp((this.params.elevation + 10) / 100, 0, 1));
            scene.skyAtmosphere.hueShift = CesiumMath.lerp(-0.08, 0.02, CesiumMath.clamp(this.params.rayleigh / 4, 0, 1));
            scene.skyAtmosphere.saturationShift = CesiumMath.lerp(-0.15, 0.08, CesiumMath.clamp(this.params.rayleigh / 4, 0, 1));
            scene.skyAtmosphere.brightnessShift = CesiumMath.lerp(-0.18, 0.1, CesiumMath.clamp(this.params.elevation / 90, 0, 1));
        }

        const elevationRad = CesiumMath.toRadians(this.params.elevation);
        const azimuthRad = CesiumMath.toRadians(this.params.azimuth);
        const localSunDir = new Cartesian3(
            Math.cos(elevationRad) * Math.sin(azimuthRad),
            Math.cos(elevationRad) * Math.cos(azimuthRad),
            Math.sin(elevationRad)
        );

        const origin = Cartesian3.fromDegrees(121.4737, 31.2304, 0);
        const enuMatrix = Transforms.eastNorthUpToFixedFrame(origin);
        const globalSunDir = new Cartesian3();
        Matrix4.multiplyByPointAsVector(enuMatrix, localSunDir, globalSunDir);
        Cartesian3.normalize(globalSunDir, globalSunDir);

        scene.light = new DirectionalLight({
            direction: Cartesian3.negate(globalSunDir, new Cartesian3()),
            color: this.params.snowEnabled ? Color.fromCssColorString('#dfefff') : Color.WHITE,
            intensity: CesiumMath.lerp(0.25, 2.0, CesiumMath.clamp((this.params.elevation + 10) / 100, 0, 1))
        });

        scene.requestRender();
    }

    destroy() {
        this.mouseHandler?.destroy();
        this.mouseHandler = null;
        this.waterReflection?.destroy();
        this.waterReflection = null;
        this.localWater?.destroy();
        this.localWater = null;
        this.weatherPlugin?.destroy();
        this.weatherPlugin = null;
        this.gui?.destroy();
        this.gui = null;
        this.viewer?.destroy();
        this.viewer = null;
    }
}

function hideLoading() {
    const loading = document.getElementById('loading');
    if (!loading) {
        return;
    }

    loading.style.opacity = '0';
    loading.style.transition = 'opacity 0.4s ease';
    setTimeout(() => {
        loading.style.display = 'none';
    }, 400);
}

export async function startCesium() {
    const container = document.getElementById('container');
    const previousApp = window.__CESIUM_APP__;
    if (previousApp?.destroy) {
        try {
            previousApp.destroy();
        } catch (error) {
            console.warn('Failed to destroy previous Cesium app instance.', error);
        }
    }

    window.__CESIUM_APP__ = null;
    if (container) {
        container.innerHTML = '';
    }

    const app = new CesiumWeatherApp(container);

    try {
        await app.init();
        app.setupControls();
        hideLoading();
        window.__CESIUM_APP__ = app;
    } catch (error) {
        console.error('Cesium scene failed to load:', error);
        const loading = document.getElementById('loading');
        if (loading) {
            loading.innerHTML = `
                <h1 style="color: #ff6b6b;">Cesium load failed</h1>
                <p style="margin-top: 20px; opacity: 0.8;">${error.message}</p>
                <p style="margin-top: 10px; opacity: 0.6;">Check network access and Cesium asset setup.</p>
            `;
        }
        throw error;
    }
}

function handleMouseEvents(viewer) {
    const handler = new ScreenSpaceEventHandler(viewer.scene.canvas);
    handler.setInputAction((movement) => {
        const cartesian = viewer.scene.pickPosition(movement.position);
        if (!CesiumDefined(cartesian)) {
            return;
        }

        const cartographic = viewer.scene.globe.ellipsoid.cartesianToCartographic(cartesian);
        console.log('Longitude:', CesiumMath.toDegrees(cartographic.longitude));
        console.log('Latitude:', CesiumMath.toDegrees(cartographic.latitude));
        console.log('Height:', cartographic.height);
    }, ScreenSpaceEventType.LEFT_CLICK);
}

async function addWindTurbine(viewer) {
    const arr = [
        119.26084255731591,
        25.345939038124868,
        18.27451025684805,
        119.26888646370725,
        25.341481836101515,
        23.358204001316007,
        119.27620717442116,
        25.33703533003674,
        18.7269872258613,
        119.28601154133774,
        25.33086014788838,
        19.381392519497016,
        119.24999609416892,
        25.338887543736952,
        19.647026125876042,
        119.25859162211253,
        25.333088739779257,
        20.08850590327226,
        119.2650087755827,
        25.32901646219196,
        20.906778757414763,
        119.26995232032239,
        25.326086908832686,
        18.746006481109685,
        119.27663938558962,
        25.321855109420287,
        24.281750851989564,
        119.28249339229544,
        25.315599258743568,
        20.02050060199963
    ];

    const loadTasks = [];
    let group = [];
    for (let i = 0; i < arr.length; i += 3) {
        const longitude = arr[i];
        const latitude = arr[i + 1];
        const height = arr[i + 2];
        const position = Cartesian3.fromDegrees(longitude, latitude, height);
        const baseFrame = Transforms.eastNorthUpToFixedFrame(position);
        const modelMatrix = Matrix4.multiplyByTranslation(
            baseFrame,
            new Cartesian3(0.0, 0.0, 10.0),
            new Matrix4()
        );

        const model = await Model.fromGltfAsync({
            url: '/models/31-wind/31FJ_all.gltf',
            modelMatrix,
            scale: 3.0,
            minimumPixelSize: 100,
            maximumScale: 300,
            id: 'wind_turbine',
            scene: viewer.scene
        })
        viewer.scene.primitives.add(model)

        model.readyEvent.addEventListener((e) => {
            group.push(model)

        });
    }

    // 提前定义好暂存变量，避免每帧循环中产生垃圾回收 (GC)
    const tempMatrix4 = new Matrix4();
    const tempMatrix3 = new Matrix3();
    viewer.scene.preUpdate.addEventListener((scene, time) => {
        // 处理旋转
        let rotationAngle = 0;
        rotationAngle -= 0.5; // 根据时间或固定步长 
        const angleInRadians = CesiumMath.toRadians(rotationAngle);
        Matrix3.fromRotationZ(angleInRadians, tempMatrix3);

        group.forEach(model => {
            // 旋转逻辑
            const node1 = model.getNode("FJ_DaoLiuZhao");
            if (node1) {
                Matrix4.multiplyByMatrix3(node1.matrix, tempMatrix3, tempMatrix4);
                node1.matrix = Matrix4.clone(tempMatrix4, node1.matrix);
            }
        })

    });
}
