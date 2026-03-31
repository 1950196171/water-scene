# 写实无尽海洋场景

一个基于 Three.js 的写实海洋场景，包含程序化生成的地形、植被、写实的水面和天空效果。

## 功能特性

### 🌊 写实海洋
- 使用 Three.js 官方 Water shader
- 动态水面波纹和反射
- 基于法线贴图的真实水面效果
- 支持天空颜色反射

### 🏔️ 程序化地形
- 使用 Simplex Noise 和 FBM（分形布朗运动）生成
- 多层噪声叠加创建自然起伏
- 基于高度的颜色渐变（深海、浅滩、沙滩、草地、岩石、雪山）
- 平滑的海岸线过渡

### 🌲 植被系统
- 40,000+ 片草地（实例化渲染）
- 400+ 棵程序化生成的树木
- 根据地形高度智能分布
- 逼真的树木几何形状（树干 + 多层树冠）

### ☀️ 天空与光影
- Three.js Sky shader（大气散射）
- 真实的太阳位置计算
- 动态雾效随太阳高度变化
- ACES Filmic 色调映射
- 高质量阴影

### 🎮 交互控制
- 轨道相机控制（拖拽旋转、右键平移、滚轮缩放）
- 太阳高度角控制（-10° 到 90°）
- 太阳方位角控制（-180° 到 180°）
- 曝光度调节
- 大气浑浊度控制
- 瑞利散射强度控制

## 技术栈

- **Three.js r171** - 3D 渲染引擎
- **Vite** - 现代化构建工具
- **ES Modules** - 模块化代码组织

## 项目结构

```
.
├── index.html              # HTML 入口
├── package.json            # 项目配置
├── vite.config.js          # Vite 配置
└── src/
    ├── main.js             # 应用入口
    ├── OceanScene.js       # 主场景管理器
    ├── TerrainGenerator.js # 地形生成器
    ├── VegetationSystem.js # 植被系统
    └── utils/
        └── SimplexNoise.js # Simplex Noise 实现
```

## 安装与运行

### 安装依赖

```bash
npm install
```

### 启动开发服务器

```bash
npm run dev
```

访问 http://localhost:3000

### 构建生产版本

```bash
npm run build
```

## 使用说明

### 相机控制
- **左键拖动**: 旋转视角
- **右键拖动**: 平移相机
- **滚轮**: 缩放

### 太阳控制面板

右上角提供完整的太阳和大气控制：

1. **太阳高度角 (Elevation)**
   - 范围: -10° 到 90°
   - 控制太阳在天空中的高度
   - 日出/日落效果在 0-15°
   - 正午效果在 70-90°

2. **太阳方位角 (Azimuth)**
   - 范围: -180° 到 180°
   - 控制太阳的水平位置
   - 180° = 正南方向

3. **曝光度 (Exposure)**
   - 范围: 0.1 到 2.0
   - 调节整体亮度
   - 默认 0.5 适合大多数场景

4. **大气浑浊度 (Turbidity)**
   - 范围: 1 到 20
   - 较低值: 清澈蓝天
   - 较高值: 雾霾/阴天效果

5. **瑞利散射 (Rayleigh)**
   - 范围: 0 到 4
   - 影响天空蓝色强度
   - 较高值: 更蓝的天空

## 性能优化

- 实例化渲染草地（减少 draw calls）
- 程序化生成（无需加载外部模型）
- 自适应像素比（限制最大 2x）
- PCF 软阴影
- 雾效减少远处渲染负担

## 浏览器要求

- Chrome 90+
- Firefox 88+
- Safari 14+
- Edge 90+

需要支持 WebGL 2.0

## 参数调优建议

### 日出场景
```
Elevation: 5-15
Azimuth: 90-180
Exposure: 0.4-0.6
Turbidity: 8-12
Rayleigh: 2-3
```

### 正午场景
```
Elevation: 70-85
Azimuth: 180
Exposure: 0.5-0.7
Turbidity: 6-10
Rayleigh: 1.5-2.5
```

### 黄昏场景
```
Elevation: 0-10
Azimuth: 270
Exposure: 0.3-0.5
Turbidity: 12-16
Rayleigh: 2-4
```

## 自定义修改

### 调整地形大小
编辑 `src/OceanScene.js` 中的 `initTerrain()`:
```javascript
const terrainGen = new TerrainGenerator({
    size: 1000,      // 地形尺寸
    segments: 256,   // 细分程度（影响细节）
    maxHeight: 50,   // 最大高度
    waterLevel: 0,   // 水面高度
    seed: 42         // 随机种子
});
```

### 调整植被密度
编辑 `src/OceanScene.js` 中的 `initVegetation()`:
```javascript
const vegSystem = new VegetationSystem(this.terrainGenerator, {
    grassCount: 40000,  // 草地数量
    treeCount: 400,     // 树木数量
    terrainSize: 1000,
    waterLevel: 0
});
```

### 调整水面效果
编辑 `src/OceanScene.js` 中的 `initWater()`:
```javascript
this.water = new Water(waterGeometry, {
    textureWidth: 512,
    textureHeight: 512,
    waterColor: 0x001e0f,     // 水面颜色
    distortionScale: 3.7,     // 波纹扭曲强度
    // ...
});
```

## 许可证

MIT License

## 参考资源

- [Three.js Ocean Example](https://threejs.org/examples/webgl_shaders_ocean.html)
- [Three.js Sky Shader](https://threejs.org/docs/#api/en/objects/Sky)
- [Simplex Noise Algorithm](https://en.wikipedia.org/wiki/Simplex_noise)
