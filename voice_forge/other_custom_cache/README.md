# 第三方引擎语料缓存（other_custom_cache）

运行 **bert_vits2** 等非 Qwen 引擎时，语料预热 wav 写入本目录下按引擎名划分的子文件夹，例如：

```
other_custom_cache/
  bert_vits2/
    corpus.snapshot.json   # 本地生成，不入库
    touch_cache/           # manifest + wav，不入库
```

在桌宠 **高级设置 → 第三方引擎语料** 保存语料后触发预热。  
切换回 Qwen 时，Qwen 克隆缓存仍在各声线目录的 `touch_cache/`，与这里互不覆盖。

本 README 用于占位，便于 Git 跟踪空目录结构；**请勿提交**上述运行时生成的 snapshot / touch_cache。
