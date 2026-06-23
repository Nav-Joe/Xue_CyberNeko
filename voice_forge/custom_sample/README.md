# 自定义配置（custom_sample）

每创建一条声线，会在此目录下生成独立子文件夹，例如：

```
custom_sample/
  vf_a1b2c3d4/
    profile.json      # displayName ↔ folderId
    reference.wav
    reference.txt
    meta.json
```

切换后会写入 `.runtime/voice-forge.json` 的 `activeSample`，并启用音色工坊模式；重启后若语料或声线与缓存 manifest 不一致会自动重新预热。
