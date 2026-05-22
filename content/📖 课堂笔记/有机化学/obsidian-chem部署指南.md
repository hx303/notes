# obsidian-chem 多端部署指南

> 生成时间: 2026-05-14
> 适用版本: obsidian-chem v0.4.1

## 每台新设备操作步骤

### 1. 安装 obsidian-chem 插件

在 Obsidian 设置 → 第三方插件 → 社区插件市场 → 搜索 "Chem"（作者 Acylation）→ 安装并启用。

**⚠️ 不要安装 chemical-structure-renderer！** 它会尝试连接境外服务器导致503报错。

### 2. 复制配置文件

将下面的 `data.json` 放到 vault 的 `.obsidian/plugins/obsidian-chem/` 目录下。

### 3. 重启 Obsidian

完成。

---

## data.json 配置

```json
{
  "version": "v3",
  "core": "smiles-drawer",
  "darkTheme": "dark",
  "lightTheme": "light",
  "sample1": "OC(=O)C(C)=CC1=CC=CC=C1",
  "sample2": "OC(C(=O)O[C@H]1C[N+]2(CCCOC3=CC=CC=C3)CCC1CC2)(C1=CC=CS1)C1=CC=CS1",
  "copy": {
    "scale": 2,
    "transparent": true,
    "theme": "default"
  },
  "dataview": false,
  "inlineSmiles": false,
  "inlineSmilesPrefix": "$smiles=",
  "commonOptions": {
    "width": 300,
    "scale": 1,
    "unifiedWidth": 300,
    "compactDrawing": false,
    "explicitHydrogens": false,
    "explicitMethyl": false
  },
  "smilesDrawerOptions": {
    "moleculeOptions": {
      "explicitHydrogens": false,
      "terminalCarbons": true,
      "compactDrawing": false,
      "bondThickness": 2.0,
      "fontSizeLarge": 13,
      "fontSizeSmall": 10
    },
    "reactionOptions": {}
  }
}
```

## 配置说明

| 选项 | 值 | 含义 |
|------|-----|------|
| `core` | `smiles-drawer` | 纯JS引擎，不联网 |
| `explicitHydrogens` | `false` | 隐藏氢原子（有机化学惯例） |
| `terminalCarbons` | `true` | 显示端基碳标注（如 =CH₂） |
| `bondThickness` | `2.0` | 加粗键线，双键更清晰 |
| `compactDrawing` | `false` | 舒展布局 |
