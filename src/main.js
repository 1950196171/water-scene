async function bootstrap() {
    const engine = new URLSearchParams(window.location.search).get('engine')?.toLowerCase();
    if (engine === 'cesium') {
        globalThis.CESIUM_BASE_URL = '/cesium/';
        const { startCesium } = await import('./cesium-main.js');
        await startCesium();
        return;
    }
    const { startThree } = await import('./three-main.js');
    await startThree();
}

bootstrap().catch((error) => {
    console.error('应用启动失败:', error);
});
