# Live2D 模型目录

本目录存放 Live2D 模型（体积大，**不入库**）。

## 首次使用

```bash
npm run setup:model
```

将下载 Live2D 官方免费样例 **桃濑日和 PRO（hiyori_pro）** 到 `hiyori_pro/` 子目录。  
来源：https://www.live2d.com/download/sample-data/（Cubism 官方无偿素材）

首次安装 / 启动时也会半引导检测；缺模型会提示运行上述命令。

## 默认路径

- 磁盘：`public/models/hiyori_pro/runtime/hiyori_pro_t11.model3.json`
- 代码：`scripts/live2d-model.js`、`electron/main/live2dModel.ts` 中 `DEFAULT_MODEL_REL`

## 如何替换为自己的模型？

1. 准备 **Cubism 3/4** 模型（含 `*.model3.json`）
2. 放到 `public/models/你的模型名/` 下
3. 修改 `scripts/live2d-model.js` 的 `DEFAULT_MODEL_REL`，或让目录扫描自动发现

例如 Web 路径：`/models/MyNeko/MyNeko.model3.json`

## 模型来源

| 类型 | 说明 |
|------|------|
| [Live2D 官方样例](https://www.live2d.com/download/sample-data/) | hiyori / Haru 等，适合开发 |
| [nizima](https://nizima.com/) / [BOOTH](https://booth.pm/) | 付费模型，注意授权范围 |

替换前请确认许可证允许你的使用方式（开源发布尤其注意）。

## 点击部位与语料

- **HitArea** 需在 Cubism Editor 中绘制；hiyori 样例通常只有 `Body`。
- 项目用 **点击坐标** 虚拟划分 `head / arms / body / legs / tail`（见 `src/services/bodyPart.ts`）。
- 语料分区见 `src/data/corpus.json`；某区为空时回退到 `body`。

## 当前默认

- 名称：桃濑日和 PRO（hiyori_pro）
- 许可：Live2D 官方无偿素材，仅供学习/测试
