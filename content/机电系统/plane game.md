---
title: "plane game"
date: 2026-06-11
created: 2026-06-11
---

# ESP32 飞机大战 — Plane Shooter

> 从 8051 汇编 (STC89C516RD+ 16×16 LED 点阵) 迁移到 ESP32 + ST7789 240×240 TFT

## 📦 硬件清单

| 模块 | 型号 | 数量 |
|------|------|:--:|
| 主控 | ESP32 DevKit (WROOM) | 1 |
| 屏幕 | ST7789 240×240 TFT | 1 |
| 键盘 | 4×4 矩阵键盘 | 1 |
| 蜂鸣器 | 无源蜂鸣器 (可选) | 1 |
| 面包板 + 杜邦线 | — | 若干 |

## 🔧 接线

### TFT → ESP32
```
TFT       ESP32
─────────────────
VCC   →   3.3V
GND   →   GND
SCL   →   GPIO18
SDA   →   GPIO23
RES   →   GPIO4
DC    →   GPIO2
CS    →   GPIO15
BLK   →   GPIO5
```

### 4×4 键盘 → ESP32
```
键盘引脚   ESP32
─────────────────
R1     →   GPIO32
R2     →   GPIO33
R3     →   GPIO25
R4     →   GPIO26
C1     →   GPIO27
C2     →   GPIO14
C3     →   GPIO12
C4     →   GPIO13
```

### 蜂鸣器 (可选)
```
BUZZ   →   GPIO19
GND    →   GND
```

## 📚 安装 TFT_eSPI 库

1. Arduino IDE → **工具 → 管理库 → 搜索 "TFT_eSPI" → 安装** (作者 Bodmer)

2. 找到 `User_Setup.h`：
   ```
   C:\Users\23012\Documents\Arduino\libraries\TFT_eSPI\User_Setup.h
   ```

3. **确认下面这些行取消注释并匹配接线**：
```cpp
#define ST7789_DRIVER     // ⭐ 取消注释

#define TFT_WIDTH  240
#define TFT_HEIGHT 240

#define TFT_MISO -1      // 不用 MISO
#define TFT_MOSI 23
#define TFT_SCLK 18
#define TFT_CS   15
#define TFT_DC    2
#define TFT_RST   4

#define SPI_FREQUENCY 40000000
```

4. 其他驱动全部注释掉（`//#define ILI9341_DRIVER` 等）

## 🎮 操作

| 按键 | 功能 |
|:--:|------|
| `4` / `A` | 左移 |
| `6` / `D` | 右移 |
| `2` `5` `8` | 射击 |
| `*` | 重新开始 (Game Over时) |

## 🚀 编译 & 烧录

1. Arduino IDE → 选择开发板：**ESP32 Dev Module**
2. 选择端口 → 上传
3. 屏幕显示 "PLANE SHOOTER" → 3 声启动音 → 开打！

## 🎨 6 项升级 (vs 8051 原版)

| 原版 (8051) | 新版 (ESP32) |
|:--|:--|
| 16×16 单色 LED | 240×240 全彩 TFT |
| 1 颗子弹 | 4 颗子弹并发 |
| 3 个敌人 | 6 个敌人 + 3 种类型 |
| 无背景 | 40 颗视差星空背景 |
| 无音效 | 射击/命中/死亡/启动 蜂鸣器 |
| 静态 2px 船 | 16×22 像素渐变飞船 |

## 📁 文件

```
esp32_plane/
├── esp32_plane.ino   ← 主程序（16.7KB）
└── README.md         ← 本文件
```

---

*从 `05_plane_game.asm` (696 行汇编) 迁移而来 — 2026-06-11*
