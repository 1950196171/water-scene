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
    Viewer
} from 'cesium';
import { DEFAULT_SCENE_PARAMS, WEATHER_PRESETS } from './weatherPresets.js';
import { CesiumWeatherSystem } from './cesiumWeatherEffects.js';

class CesiumWeatherApp {
    constructor(container) {
        this.container = container;
        this.viewer = null;
        this.gui = null;
        this.params = { ...DEFAULT_SCENE_PARAMS, cloudHeight: 6000 };
    }

    async init() {

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

        this.viewer.scene.sun.show = false;
        this.viewer.scene.moon.show = false;

        this.weatherSystem = new CesiumWeatherSystem(this.viewer, this.params);

        await this.setupBaseLayer();

        this.setupCamera();
        this.applyParams(this.params);
    }

    async createTerrainProvider() {
        try {
            return await createWorldTerrainAsync();
        } catch (error) {
            console.warn('WorldTerrain 加载失败，回退到椭球地形。', error);
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
            destination: Cartesian3.fromDegrees(121.4737, 31.2304, 12000),
            orientation: new HeadingPitchRoll(
                CesiumMath.toRadians(0),
                CesiumMath.toRadians(-25),
                0
            )
        });
    }

    setupControls() {
        const gui = new GUI({ title: 'Cesium 天气控制' });
        gui.domElement.style.marginTop = '12px';
        gui.domElement.style.marginRight = '12px';
        gui.domElement.style.zIndex = '120';
        this.gui = gui;

        const presetState = { 预设: 'default' };
        gui.add(presetState, '预设', Object.keys(WEATHER_PRESETS))
            .name('天气预设')
            .onChange((presetKey) => {
                this.applyParams(WEATHER_PRESETS[presetKey].params);
                this.refreshGui();
            });

        const skyFolder = gui.addFolder('天空与光照');
        skyFolder.add(this.params, 'elevation', -12, 90, 0.1).name('太阳高度').onChange(() => this.applyParams(this.params));
        skyFolder.add(this.params, 'azimuth', -180, 180, 0.1).name('太阳方位').onChange(() => this.applyParams(this.params));
        skyFolder.add(this.params, 'exposure', 0, 1, 0.01).name('曝光').onChange(() => this.applyParams(this.params));
        skyFolder.add(this.params, 'rayleigh', 0, 4, 0.01).name('瑞利散射').onChange(() => this.applyParams(this.params));

        // 泛光文件夹
        const bloomFolder = gui.addFolder('泛光 (Bloom)');
        bloomFolder.add(this.params, 'bloomStrength', 0, 1, 0.01).name('泛光强度').onChange(() => this.applyParams(this.params));
        bloomFolder.add(this.params, 'bloomRadius', 0, 3, 0.01).name('泛光扩散').onChange(() => this.applyParams(this.params));

        // 云层文件夹
        const cloudFolder = gui.addFolder('云层 (Clouds)');
        cloudFolder.add(this.params, 'cloudCoverage', 0, 1, 0.01).name('云层覆盖度').onChange(() => this.applyParams(this.params));
        cloudFolder.add(this.params, 'cloudDensity', 0, 1, 0.01).name('云层密度').onChange(() => this.applyParams(this.params));
        cloudFolder.add(this.params, 'cloudHeight', 500, 10000, 100).name('云层高度').onChange(() => this.applyParams(this.params));

        const fogFolder = gui.addFolder('雾效 (Fog)');
        fogFolder.add(this.params, 'fogEnabled').name('启用雾').onChange(() => this.applyParams(this.params));
        fogFolder.add(this.params, 'fogDensity', 0, 2, 0.01).name('雾浓度').onChange(() => this.applyParams(this.params));

        const rainFolder = gui.addFolder('雨效 (Rain)');
        rainFolder.add(this.params, 'rainEnabled').name('启用降雨').onChange(() => this.applyParams(this.params));
        rainFolder.add(this.params, 'rainVeilIntensity', 0.5, 2.5, 0.01).name('雨线强度').onChange(() => this.applyParams(this.params));
        rainFolder.add(this.params, 'rainAudioEnabled').name('启用雨声').onChange(() => this.applyParams(this.params));
        rainFolder.add(this.params, 'rainAudioVolume', 0, 1, 0.01).name('雨声音量').onChange(() => this.applyParams(this.params));
        rainFolder.add(this.params, 'lightningEnabled').name('启用雷闪').onChange(() => this.applyParams(this.params));

        const snowFolder = gui.addFolder('雪效 (Snow)');
        snowFolder.add(this.params, 'snowEnabled').name('启用降雪').onChange(() => this.applyParams(this.params));
        snowFolder.add(this.params, 'snowIntensity', 0, 1.5, 0.01).name('雪量').onChange(() => this.applyParams(this.params));
        snowFolder.add(this.params, 'snowSpeed', 0.2, 2.2, 0.01).name('速度').onChange(() => this.applyParams(this.params));

        [skyFolder, bloomFolder, cloudFolder, fogFolder, rainFolder, snowFolder].forEach((folder) => folder.close());
    }

    refreshGui() {
        if (!this.gui) return;
        this.gui.controllersRecursive().forEach((controller) => controller.updateDisplay());
    }

    applyParams(nextParams) {
        Object.assign(this.params, nextParams);
        const scene = this.viewer.scene;

        scene.highDynamicRange = this.params.exposure > 0.2;
        scene.globe.enableLighting = true;

        scene.fog.enabled = Boolean(this.params.fogEnabled);
        scene.fog.density = CesiumMath.lerp(0.00002, 0.0012, CesiumMath.clamp(this.params.fogDensity / 2, 0, 1));
        scene.fog.minimumBrightness = CesiumMath.lerp(0.06, 0.02, CesiumMath.clamp(this.params.fogDensity / 2, 0, 1));

        if (scene.skyAtmosphere) {
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

        // Transform to global ECEF using target location origin (Shanghai)
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
        console.error('Cesium 场景加载失败:', error);
        const loading = document.getElementById('loading');
        if (loading) {
            loading.innerHTML = `
                <h1 style="color: #ff6b6b;">Cesium 加载失败</h1>
                <p style="margin-top: 20px; opacity: 0.8;">${error.message}</p>
                <p style="margin-top: 10px; opacity: 0.6;">请检查网络和 Cesium 资源配置</p>
            `;
        }
        throw error;
    }
}
