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
    console.error('Application startup failed:', error);
});

if (import.meta.hot) {
    import.meta.hot.dispose(() => {
        window.__CESIUM_APP__?.destroy?.();
        window.__CESIUM_APP__ = null;
    });
}
