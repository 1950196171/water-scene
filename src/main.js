import { GUI } from 'three/addons/libs/lil-gui.module.min.js';
import { OceanScene } from './OceanScene.js';
import { WEATHER_PRESETS } from './weatherPresets.js';
import { loadThreeTerrain } from './utils/loadThreeTerrain.js';

async function main() {
    const container = document.getElementById('container');
    
    await loadThreeTerrain();

    const oceanScene = new OceanScene(container);
    try {
        await oceanScene.init();
        
        setupControls(oceanScene);
        
        oceanScene.hideLoading();
        
        oceanScene.animate();
        
        console.log('写实海洋场景加载完成！');
    } catch (error) {
        console.error('场景加载失败:', error);
        
        const loading = document.getElementById('loading');
        if (loading) {
            loading.innerHTML = `
                <h1 style="color: #ff6b6b;">加载失败</h1>
                <p style="margin-top: 20px; opacity: 0.8;">${error.message}</p>
                <p style="margin-top: 10px; opacity: 0.6;">请刷新页面重试</p>
            `;
        }
    }
}

function setupControls(oceanScene) {
    const gui = new GUI({ title: '场景控制' });
    gui.domElement.style.marginTop = '12px';
    gui.domElement.style.marginRight = '12px';
    gui.domElement.style.zIndex = '120';

    const params = oceanScene.params;
    const controllers = [];
    const presetState = { 当前天气: 'default' };
    const presetOptions = Object.fromEntries(
        Object.entries(WEATHER_PRESETS).map(([key, preset]) => [preset.label, key])
    );
    const presetKeys = [
        'elevation',
        'azimuth',
        'exposure',
        'turbidity',
        'rayleigh',
        'bloomStrength',
        'bloomRadius',
        'waterColor',
        'cloudCoverage',
        'cloudDensity',
        'cloudElevation',
        'fogEnabled',
        'fogDensity',
        'rainEnabled',
        'rainScreenIntensity',
        'rainVeilIntensity',
        'rainDropSize',
        'rainSpeed',
        'rainAudioEnabled',
        'rainAudioVolume',
        'snowEnabled',
        'snowIntensity',
        'snowSpeed',
        'starEnabled',
        'starIntensity',
        'lightningEnabled',
        'lightningIntensity',
        'thunderVolume'
    ];
    const presetComments = {
        elevation: '太阳高度角',
        azimuth: '太阳方位角',
        exposure: '场景曝光度',
        turbidity: '天空浑浊度',
        rayleigh: '瑞利散射强度',
        bloomStrength: '泛光强度',
        bloomRadius: '泛光扩散范围',
        waterColor: '海水颜色',
        cloudCoverage: '云层覆盖度',
        cloudDensity: '云层密度',
        cloudElevation: '云层高度',
        fogEnabled: '是否启用雾气',
        fogDensity: '雾气浓度',
        rainEnabled: '是否启用雨效',
        rainScreenIntensity: '屏幕雨滴强度',
        rainVeilIntensity: '雨线强度',
        rainDropSize: '雨滴尺寸',
        rainSpeed: '雨效速度',
        rainAudioEnabled: '是否启用雨声',
        rainAudioVolume: '雨声音量',
        snowEnabled: '是否启用降雪',
        snowIntensity: '雪量',
        snowSpeed: '降雪速度',
        starEnabled: '是否启用星空',
        starIntensity: '星空强度',
        lightningEnabled: '是否启用雷闪',
        lightningIntensity: '雷闪强度',
        thunderVolume: '雷声音量'
    };

    const exportActions = {
        导出预设: () => {
            const preset = {
                meta: {
                    version: 1,
                    comment: '场景预设导出文件',
                    exportedAt: new Date().toISOString()
                },
                comments: Object.fromEntries(
                    presetKeys.map((key) => [key, presetComments[key]])
                ),
                params: Object.fromEntries(
                    presetKeys.map((key) => [key, params[key]])
                )
            };

            const blob = new Blob([JSON.stringify(preset, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            const stamp = new Date().toISOString().replace(/[:.]/g, '-');
            link.href = url;
            link.download = `scene-preset-${stamp}.json`;
            link.click();
            URL.revokeObjectURL(url);
        }
    };

    const markPresetCustom = () => {
        if (presetState.当前天气 !== 'custom') {
            presetState.当前天气 = 'custom';
            presetController.updateDisplay();
        }
    };
    const refreshControllers = () => {
        controllers.forEach((controller) => controller.updateDisplay());
        updateStarControllerState();
    };
    const setControllerEnabled = (controller, enabled) => {
        controller.domElement.style.opacity = enabled ? '1' : '0.45';
        controller.domElement.style.pointerEvents = enabled ? 'auto' : 'none';
        controller.enable?.();
        if (!enabled) {
            controller.disable?.();
        }
        controller.domElement.querySelectorAll('input, select, button').forEach((element) => {
            element.disabled = !enabled;
        });
    };
    const bindController = (controller, applyValue) => {
        controllers.push(controller);
        controller.onChange((value) => {
            applyValue(value);
            markPresetCustom();
            updateStarControllerState();
        });
        return controller;
    };

    const presetController = gui.add(presetState, '当前天气', { ...presetOptions, 自定义: 'custom' }).name('天气预设');
    presetController.onChange((presetKey) => {
        if (presetKey === 'custom') return;
        oceanScene.applyParams(WEATHER_PRESETS[presetKey].params);
        refreshControllers();
    });
    gui.add(exportActions, '导出预设');

    const skyFolder = gui.addFolder('天空');
    bindController(skyFolder.add(params, 'elevation', -12, 90, 0.1).name('太阳高度'), (value) => oceanScene.setSunElevation(value));
    bindController(skyFolder.add(params, 'azimuth', -180, 180, 0.1).name('太阳方位'), (value) => oceanScene.setSunAzimuth(value));
    bindController(skyFolder.add(params, 'exposure', 0, 1, 0.01).name('曝光度'), (value) => oceanScene.setExposure(value));
    bindController(skyFolder.add(params, 'turbidity', 1, 20, 0.1).name('浑浊度'), (value) => oceanScene.setTurbidity(value));
    bindController(skyFolder.add(params, 'rayleigh', 0, 4, 0.01).name('瑞利散射'), (value) => oceanScene.setRayleigh(value));
    const starEnabledController = bindController(skyFolder.add(params, 'starEnabled').name('启用星空'), (value) => oceanScene.setStarEnabled(value));
    const starIntensityController = bindController(skyFolder.add(params, 'starIntensity', 0, 1.5, 0.01).name('星空强度'), (value) => oceanScene.setStarIntensity(value));
    const updateStarControllerState = () => {
        const canUseStars = params.elevation < -1.0;
        if (!canUseStars && params.starEnabled) {
            oceanScene.setStarEnabled(false);
        }
        setControllerEnabled(starEnabledController, canUseStars);
        setControllerEnabled(starIntensityController, canUseStars);
        starEnabledController.updateDisplay();
        starIntensityController.updateDisplay();
    };

    const bloomFolder = gui.addFolder('泛光');
    bindController(bloomFolder.add(params, 'bloomStrength', 0, 1, 0.01).name('强度'), (value) => oceanScene.setBloomStrength(value));
    bindController(bloomFolder.add(params, 'bloomRadius', 0, 3, 0.01).name('扩散'), (value) => oceanScene.setBloomRadius(value));

    const waterFolder = gui.addFolder('海水');
    bindController(waterFolder.addColor(params, 'waterColor').name('颜色'), (value) => oceanScene.setWaterColor(value));

    const cloudFolder = gui.addFolder('云层');
    bindController(cloudFolder.add(params, 'cloudCoverage', 0, 1, 0.01).name('覆盖度'), (value) => oceanScene.setCloudCoverage(value));
    bindController(cloudFolder.add(params, 'cloudDensity', 0, 1, 0.01).name('密度'), (value) => oceanScene.setCloudDensity(value));
    bindController(cloudFolder.add(params, 'cloudElevation', 0, 1, 0.01).name('高度'), (value) => oceanScene.setCloudElevation(value));

    const rainFolder = gui.addFolder('雨效');
    bindController(rainFolder.add(params, 'rainEnabled').name('启用雨效'), (value) => oceanScene.setRainEnabled(value));
    bindController(rainFolder.add(params, 'rainVeilIntensity', 0.5, 2.5, 0.01).name('雨线强度'), (value) => oceanScene.setRainVeilIntensity(value));
    bindController(rainFolder.add(params, 'rainAudioEnabled').name('启用雨声'), (value) => oceanScene.setRainAudioEnabled(value));
    bindController(rainFolder.add(params, 'rainAudioVolume', 0, 1, 0.01).name('雨声音量'), (value) => oceanScene.setRainAudioVolume(value));
    bindController(rainFolder.add(params, 'lightningEnabled').name('启用雷闪'), (value) => oceanScene.setLightningEnabled(value));

    const fogFolder = gui.addFolder('雾气');
    bindController(fogFolder.add(params, 'fogEnabled').name('启用雾气'), (value) => oceanScene.setFogEnabled(value));
    bindController(fogFolder.add(params, 'fogDensity', 0, 2, 0.01).name('雾气浓度'), (value) => oceanScene.setFogDensity(value));

    const snowFolder = gui.addFolder('雪效');
    bindController(snowFolder.add(params, 'snowEnabled').name('启用降雪'), (value) => oceanScene.setSnowEnabled(value));
    bindController(snowFolder.add(params, 'snowIntensity', 0, 1.5, 0.01).name('雪量'), (value) => oceanScene.setSnowIntensity(value));
    bindController(snowFolder.add(params, 'snowSpeed', 0.2, 2.2, 0.01).name('速度'), (value) => oceanScene.setSnowSpeed(value));

    [skyFolder, bloomFolder, waterFolder, cloudFolder, rainFolder, fogFolder, snowFolder].forEach((folder) => folder.close());
    updateStarControllerState();
}

main().catch(console.error);
