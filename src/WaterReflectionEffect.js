import {
    BoundingRectangle,
    Camera,
    Cartesian3,
    Cartesian4,
    Cesium3DTilePass,
    Cesium3DTilePassState,
    ClippingPlane,
    ClippingPlaneCollection,
    Color,
    Framebuffer,
    Matrix4,
    PixelDatatype,
    PixelFormat,
    Renderbuffer,
    RenderbufferFormat,
    Texture,
    Transforms
} from 'cesium';

// ---------------------------------------------------------------------------
// 镜像相机（严格按参考文章实现）
// ---------------------------------------------------------------------------
function getMirrorCamera(camera, normal, centerPosition) {
    // 相机位置镜像
    const cameraToCenter = Cartesian3.subtract(centerPosition, camera.position, new Cartesian3());
    const n = -Cartesian3.dot(normal, cameraToCenter);
    const t = Cartesian3.multiplyByScalar(normal, 2 * n, new Cartesian3());
    const reflectCameraPosition = Cartesian3.subtract(camera.position, t, new Cartesian3());

    // 方向镜像
    const ndir = Cartesian3.dot(normal, camera.directionWC);
    const tdir = Cartesian3.multiplyByScalar(normal, 2 * ndir, new Cartesian3());
    const reflectCameraDirection = Cartesian3.subtract(camera.directionWC, tdir, new Cartesian3());
    Cartesian3.normalize(reflectCameraDirection, reflectCameraDirection);

    // up 镜像
    const nup = Cartesian3.dot(normal, camera.upWC);
    const tup = Cartesian3.multiplyByScalar(normal, 2 * nup, new Cartesian3());
    const reflectCameraUp = Cartesian3.subtract(camera.upWC, tup, new Cartesian3());

    // 克隆相机（继承视锥体参数）
    const reflectCamera = Camera.clone(camera);
    reflectCamera.position = reflectCameraPosition;
    reflectCamera.direction = reflectCameraDirection;
    reflectCamera.up = reflectCameraUp;
    reflectCamera.right = Cartesian3.cross(reflectCameraUp, reflectCameraDirection, new Cartesian3());

    return reflectCamera;
}

// ---------------------------------------------------------------------------
// 反射面参数
// ---------------------------------------------------------------------------
function createPlaneFrame(bounds, surfaceHeight) {
    const [west, south, east, north] = bounds;
    const center = Cartesian3.fromDegrees(
        (west + east) * 0.5,
        (south + north) * 0.5,
        surfaceHeight
    );
    const enu = Transforms.eastNorthUpToFixedFrame(center);
    const upCol = Matrix4.getColumn(enu, 2, new Cartesian4());
    return {
        center,
        normal: Cartesian3.normalize(
            new Cartesian3(upCol.x, upCol.y, upCol.z),
            new Cartesian3()
        )
    };
}

// ---------------------------------------------------------------------------
// ClippingPlane
// ---------------------------------------------------------------------------
function buildClippingCollection(planeOrigin, planeNormal, modelWorldMatrix) {
    const inverseModel = Matrix4.inverseTransformation(modelWorldMatrix, new Matrix4());
    const localOrigin = Matrix4.multiplyByPoint(inverseModel, planeOrigin, new Cartesian3());
    const localNormal = Matrix4.multiplyByPointAsVector(inverseModel, planeNormal, new Cartesian3());
    Cartesian3.normalize(localNormal, localNormal);
    const distance = -Cartesian3.dot(localNormal, localOrigin);
    return new ClippingPlaneCollection({
        planes: [new ClippingPlane(localNormal, distance)],
        enabled: false
    });
}

// ---------------------------------------------------------------------------
// 3DTile 渲染通道状态（和 Cesium 内部 render 函数用的一样）
// ---------------------------------------------------------------------------
const reflectionTilesetPassState = new Cesium3DTilePassState({
    pass: Cesium3DTilePass.RENDER
});

// ---------------------------------------------------------------------------
// renderToFbo — 严格按参考文章实现
// 复制 Cesium Scene 内部 render() 函数的逻辑，用反射相机渲染到 FBO
// ---------------------------------------------------------------------------
function renderToFbo(fbo, scene, reflectCamera) {
    const frameState = scene._frameState;
    const context = scene.context;
    const us = context.uniformState;

    // 隐藏地球（只反射模型和天空，不反射地面）
    const globeWasVisible = scene.globe.show;
    scene.globe.show = false;

    // 替换相机
    const preCamera = scene._defaultView.camera;
    scene._defaultView.camera = reflectCamera;
    const view = scene._defaultView;
    scene._view = view;

    // 更新帧状态（和内部 render 函数一样）
    scene.updateFrameState();
    frameState.passes.render = true;
    frameState.passes.postProcess = scene.postProcessStages.hasSelected;
    frameState.tilesetPassState = reflectionTilesetPassState;

    let backgroundColor = scene.backgroundColor ?? Color.BLACK;
    frameState.backgroundColor = backgroundColor;
    frameState.atmosphere = scene.atmosphere;
    scene.fog.update(frameState);
    us.update(frameState);

    scene._computeCommandList.length = 0;
    scene._overlayCommandList.length = 0;

    // 视口
    const viewport = view.viewport;
    viewport.x = 0;
    viewport.y = 0;
    viewport.width = context.drawingBufferWidth;
    viewport.height = context.drawingBufferHeight;

    // passState — 渲染目标设为我们的 FBO
    const passState = view.passState;
    passState.framebuffer = fbo;
    passState.blendingEnabled = undefined;
    passState.scissorTest = undefined;
    passState.viewport = BoundingRectangle.clone(viewport, passState.viewport);

    // 执行渲染管线
    scene.updateEnvironment();
    scene.updateAndExecuteCommands(passState, backgroundColor);
    scene.resolveFramebuffers(passState);

    // 清理
    passState.framebuffer = undefined;
    context.endFrame();

    // 恢复
    scene.globe.show = globeWasVisible;
    scene._defaultView.camera = preCamera;
}

// ---------------------------------------------------------------------------
// WaterReflectionEffect
// ---------------------------------------------------------------------------
export class WaterReflectionEffect {
    constructor(viewer, options = {}) {
        this.viewer = viewer;
        this.scene = viewer.scene;
        this.waterEffect = options.waterEffect || null;
        this.bounds = options.bounds;
        this.params = {
            enabled: options.enabled ?? true,
            surfaceHeight: options.surfaceHeight ?? 20.0
        };

        this.planeFrame = createPlaneFrame(this.bounds, this.params.surfaceHeight);
        this._clippingCollections = [];

        this._onPreRender = this._preRender.bind(this);
        this.scene.preRender.addEventListener(this._onPreRender);
        this._applyTexture(null);
    }

    // -----------------------------------------------------------------------
    // 公开 API
    // -----------------------------------------------------------------------

    setModels(models) {
        this._clippingCollections.forEach((col) => {
            if (col && !col.isDestroyed?.()) col.removeAll();
        });
        this._clippingCollections = [];

        const { center, normal } = this.planeFrame;
        for (const model of models) {
            if (!model || model.isDestroyed?.()) continue;
            const mat = model.modelMatrix ?? Matrix4.IDENTITY;
            try {
                const col = buildClippingCollection(center, normal, mat);
                model.clippingPlanes = col;
                this._clippingCollections.push(col);
            } catch {
                // 不支持 clippingPlanes
            }
        }
    }

    setParams(nextParams = {}) {
        const planeChanged =
            ('surfaceHeight' in nextParams && nextParams.surfaceHeight !== this.params.surfaceHeight) ||
            ('bounds' in nextParams && nextParams.bounds !== this.bounds);

        Object.assign(this.params, nextParams);
        if ('bounds' in nextParams) this.bounds = nextParams.bounds;

        if (planeChanged) {
            this.planeFrame = createPlaneFrame(this.bounds, this.params.surfaceHeight);
        }
    }

    destroy() {
        if (!this.viewer) return;
        this.scene.preRender.removeEventListener(this._onPreRender);
        this._applyTexture(null);

        this._clippingCollections.forEach((col) => {
            if (col && !col.isDestroyed?.()) col.removeAll();
        });
        this._clippingCollections = [];

        this.viewer = null;
        this.scene = null;
        this.waterEffect = null;
    }

    // -----------------------------------------------------------------------
    // 每帧渲染（preRender 中执行，和文章一致）
    // -----------------------------------------------------------------------

    _preRender() {
        if (!this.params.enabled || !this.waterEffect?.primitive) {
            this._applyTexture(null);
            return;
        }

        const scene = this.scene;
        const context = scene.context;
        const width = context.drawingBufferWidth;
        const height = context.drawingBufferHeight;

        // 每帧创建 FBO（和文章一致，简单可靠，Cesium 内部也是类似模式）
        const fbo = new Framebuffer({
            context,
            colorTextures: [
                new Texture({
                    context,
                    width,
                    height,
                    pixelFormat: PixelFormat.RGBA,
                    pixelDatatype: PixelDatatype.UNSIGNED_BYTE
                })
            ],
            destroyAttachments: false
        });

        try {
            // 计算反射相机
            const { center, normal } = this.planeFrame;
            const reflectCamera = getMirrorCamera(this.viewer.camera, normal, center);

            // 隐藏水面（防递归）
            const waterWasVisible = this.waterEffect.primitive.show;
            this.waterEffect.primitive.show = false;

            // 开启裁剪
            this._setClipping(true);

            // 渲染到 FBO
            renderToFbo(fbo, scene, reflectCamera);

            // 关闭裁剪
            this._setClipping(false);

            // 恢复水面
            this.waterEffect.primitive.show = waterWasVisible;

            // 将 FBO 的颜色纹理传给水面材质
            const colorTexture = fbo.getColorTexture(0);
            this._applyTexture(colorTexture);
        } catch (e) {
            console.warn('[WaterReflectionEffect] 反射渲染失败', e);
            this._applyTexture(null);
        }

        // 销毁 FBO 容器（但 colorTexture 不销毁，因为 destroyAttachments=false）
        fbo.destroy();
    }

    // -----------------------------------------------------------------------
    // 工具
    // -----------------------------------------------------------------------

    _setClipping(enabled) {
        for (const col of this._clippingCollections) {
            if (col && !col.isDestroyed?.()) col.enabled = enabled;
        }
    }

    _applyTexture(texture) {
        if (!this.waterEffect) return;
        this.waterEffect.setReflectionTexture(texture);
    }
}
