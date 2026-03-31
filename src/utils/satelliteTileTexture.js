import * as THREE from 'three';

function lonLatToTile(lon, lat, zoom) {
    const latRad = (lat * Math.PI) / 180;
    const n = 2 ** zoom;
    const x = Math.floor(((lon + 180) / 360) * n);
    const y = Math.floor((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2 * n);
    return { x, y };
}

function loadImage(url) {
    return new Promise((resolve, reject) => {
        const image = new Image();
        image.crossOrigin = 'anonymous';
        image.decoding = 'async';
        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error(`Failed to load tile: ${url}`));
        image.src = url;
    });
}

export async function createSatelliteTileTexture({
    centerLon = 121.4737,
    centerLat = 31.2304,
    zoom = 18,
    grid = 5,
    tileSize = 256
} = {}) {
    const template = 'https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
    const clampedZoom = Math.max(1, Math.min(19, zoom));
    const normalizedGrid = Math.max(1, grid | 0);
    const half = Math.floor(normalizedGrid / 2);
    const centerTile = lonLatToTile(centerLon, centerLat, clampedZoom);
    const canvas = document.createElement('canvas');
    canvas.width = tileSize * normalizedGrid;
    canvas.height = tileSize * normalizedGrid;
    const ctx = canvas.getContext('2d');

    const tasks = [];
    for (let gy = 0; gy < normalizedGrid; gy++) {
        for (let gx = 0; gx < normalizedGrid; gx++) {
            const tx = centerTile.x + gx - half;
            const ty = centerTile.y + gy - half;
            const url = template
                .replace('{z}', String(clampedZoom))
                .replace('{x}', String(tx))
                .replace('{y}', String(ty));

            tasks.push(
                loadImage(url).then((image) => {
                    ctx.drawImage(image, gx * tileSize, gy * tileSize, tileSize, tileSize);
                })
            );
        }
    }

    await Promise.all(tasks);

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.generateMipmaps = true;
    texture.anisotropy = 16;
    texture.needsUpdate = true;
    return texture;
}
