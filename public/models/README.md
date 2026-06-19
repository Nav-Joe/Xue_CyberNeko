# Live2D 模型目录

本目录存放 Live2D 模型文件（体积较大，默认不上传 Git）。

## 首次使用

```bash
npm run setup:model
```

将自动下载 Live2D 官方免费示例 **Haru** 到 `Haru/` 子目录。

## 如何替换为自己的模型？

1. 准备一个 **Cubism 3/4** 模型文件夹（含 `*.model3.json`）
2. 放到 `public/models/你的模型名/` 下
3. 修改 `src/components/Live2DView.vue` 里的 `MODEL_URL` 指向新路径

例如：`/models/MyNeko/MyNeko.model3.json`

## 模型从哪里获取？

### 免费 / 学习用

| 来源 | 说明 |
|------|------|
| [Live2D 官方示例](https://www.live2d.com/download/sample-data/) | Haru 等官方免费素材，适合开发测试 |
| [CubismWebSamples](https://github.com/Live2D/CubismWebSamples) | 与官方示例相同，可脚本下载 |
| 开源仓库 | GitHub 搜索 `live2d model3.json`（注意许可证） |

### 付费购买（个人 / 商用需看授权）

| 平台 | 链接 | 说明 |
|------|------|------|
| **nizima**（Live2D 官方） | https://nizima.com/ | 官方模型市场，质量高，授权清晰 |
| **BOOTH** | https://booth.pm/ | 日本创作者平台，大量 Live2D 模型 |
| **Eikanyalive** 等国内代理 | 搜索「Live2D 模型 购买」 | 部分 BOOTH 模型的国内代购 |

### 购买时注意

- 确认是 **Cubism 3/4**（`.model3.json`），不是旧版 Cubism 2
- 阅读 **使用范围**：个人学习 / 直播 / 商用 / 二次发布 各不同
- 商用或开源项目发布前，务必确认模型授权允许
- 本项目默认 MIT 开源，**不要使用禁止二次分发或禁止开源的模型**

## 点击部位与语料（里程碑 2）

- 模型 `*.model3.json` 里的 `HitAreas` 必须在 **Live2D Cubism Editor** 中绘制，不能只改 JSON 增加 head/hand 等。
- 若只有 `Body`（如 hiyori），项目会用 **点击坐标** 虚拟划分 head/arms/body/legs，对应 `src/data/corpus.json` 各分区。
- 替换模型后若有多 HitArea，控制台仍会显示 Live2D 原始 HitArea 名称，语料按虚拟坐标 + 分区选取。

## 当前默认模型

- 名称：Haru（官方 Cubism 4 示例）
- 许可：Live2D 免费素材，仅供学习/测试
- 仓库：https://github.com/Live2D/CubismWebSamples
