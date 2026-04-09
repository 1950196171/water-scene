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
    Math as CesiumMath,
    Matrix4,
    OpenStreetMapImageryProvider,
    Transforms,
    Viewer,
    CesiumTerrainProvider,
    Terrain,
    Ion,
    defined as CesiumDefined,
    ScreenSpaceEventHandler,
    ScreenSpaceEventType

} from 'cesium';
import { DEFAULT_SCENE_PARAMS, WEATHER_PRESETS } from './weatherPresets.js';
import { CesiumWeatherPlugin } from './cesiumWeatherEffects.js';
import { LocalWaterEffect } from './LocalWaterEffect.js';

class CesiumWeatherApp {
    constructor(container) {
        this.container = container;
        this.viewer = null;
        this.gui = null;
        this.weatherPlugin = null;
        this.localWater = null;
        this.params = { ...DEFAULT_SCENE_PARAMS };

        // Local Water params
        this.waterParams = {
            enabled: true,
            waveAmplitude: 4.8,
            waveLength: 95.0,
            waveSpeed: 0.9,
            waterColor1: '#0a3042',
            waterColor2: '#4d87a6',
            foamThreshold: 0.95
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

        // this.viewer.scene.setTerrain(
        //     new Terrain(CesiumTerrainProvider.fromIonAssetId(2426648))
        // );

        this.viewer.scene.sun.show = true;
        this.viewer.scene.sun.glowFactor = 0.08;
        this.viewer.scene.sunBloom = false;
        this.viewer.scene.moon.show = false;
        this.viewer.scene.postProcessStages.fxaa.enabled = true;


        // 环境
        this.weatherPlugin = new CesiumWeatherPlugin({ params: this.params });
        this.weatherPlugin.install(this.viewer);
        handleMouseEvents(this.viewer)

        await this.setupBaseLayer();
        this.setupCamera();
        this.setupLocalWater();
        this.applyParams(this.params);
    }

    async createTerrainProvider() {
        try {
            return await createWorldTerrainAsync({
                requestVertexNormals: true,
                requestWaterMask: true,
            });
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
        // 创建局部海面 (设置在初始相机视角的正下方附近)
        // const bounds = [121.45, 31.21, 121.49, 31.25];
        const bounds = [119.33649918542253, 25.264754845185497, 119.40100354369514, 25.326187439777247]
        this.localWater = new LocalWaterEffect(this.viewer, {
            bounds: bounds,
            ...this.waterParams
        });

        // 如果未开启则立刻隐藏
        if (!this.waterParams.enabled && this.localWater.primitive) {
            this.localWater.primitive.show = false;
        }
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
                if (this.localWater.primitive) {
                    this.localWater.primitive.show = this.waterParams.enabled;
                }
                this.localWater.setParams(this.waterParams);
            }
        };
        waterFolder.add(this.waterParams, 'enabled').name('启用').onChange(updateWater);
        waterFolder.add(this.waterParams, 'waveAmplitude', 0, 20, 0.1).name('浪高 (Amplitude)').onChange(updateWater);
        waterFolder.add(this.waterParams, 'waveLength', 10, 500, 1).name('波长 (Length)').onChange(updateWater);
        waterFolder.add(this.waterParams, 'waveSpeed', 0, 5, 0.01).name('流速 (Speed)').onChange(updateWater);
        waterFolder.add(this.waterParams, 'foamThreshold', -5, 10, 0.1).name('泡沫阈值）。').onChange(updateWater);
        waterFolder.addColor(this.waterParams, 'waterColor1').name('深水颜色').onChange(updateWater);
        waterFolder.addColor(this.waterParams, 'waterColor2').name('浅水/高光颜色').onChange(updateWater);

        [skyFolder, bloomFolder, cloudFolder, fogFolder, rainFolder, snowFolder].forEach((folder) => folder.close());
        waterFolder.open();
    }

    refreshGui() {
        if (!this.gui) return;
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
        scene.globe.depthTestAgainstTerrain = true; // CRITICAL: This allows mountains to be written to the depth buffer for cloud occlusion!

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

        this.viewer.scene.requestRender();
    }

    destroy() {
        this.weatherPlugin?.destroy();
        this.localWater?.destroy();
        this.gui?.destroy();
        this.viewer?.destroy();
    }
}

function hideLoading() {
    const loading = document.getElementById('loading');
    if (!loading) return;
    loading.style.opacity = '0';
    loading.style.transition = 'opacity 0.4s ease';
    setTimeout(() => {
        loading.style.display = 'none';
    }, 400);
}

export async function startCesium() {
    const container = document.getElementById('container');
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

// 鼠标事件 =》 获取经纬度
function handleMouseEvents(viewer) {
    const handler = new ScreenSpaceEventHandler(viewer.scene.canvas);
    handler.setInputAction((movement) => {
        console.log('movement', movement);
        // 获取点击位置的经纬度
        const cartesian = viewer.scene.pickPosition(movement.position);
        if (CesiumDefined(cartesian)) {
            const cartographic = viewer.scene.globe.ellipsoid.cartesianToCartographic(cartesian);
            const longitude = CesiumMath.toDegrees(cartographic.longitude);
            const latitude = CesiumMath.toDegrees(cartographic.latitude);
            console.log('Longitude:', longitude);
            console.log('Latitude:', latitude);
        }
    }, ScreenSpaceEventType.LEFT_CLICK);
}
