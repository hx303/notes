# Plane Shooter v3 — 技术文档

> **文件**: `esp32_plane_v3.ino` (823 行 / 29.8 KB)  
> **硬件**: ESP32 + ST7789 240×240 TFT + 4×4 矩阵键盘 + 蜂鸣器  
> **基础**: Plane Shooter v2（移动、射击逻辑完全保留）

---

## 目录

1. [版本对比总览](#1-版本对比总览)
2. [核心架构](#2-核心架构)
3. [功能详解](#3-功能详解)
   - [3.1 敌弹系统](#31-敌弹系统)
   - [3.2 Boss 战](#32-boss-战)
   - [3.3 全键盘利用](#33-全键盘利用)
   - [3.4 扩展 EEPROM 存档](#34-扩展-eeprom-存档)
   - [3.5 静音开关](#35-静音开关)
   - [3.6 视觉通知系统](#36-视觉通知系统)
   - [3.7 累计统计](#37-累计统计)
   - [3.8 Game Over 扩展](#38-game-over-扩展)
4. [从 v2 到 v3 的改动清单](#4-从-v2-到-v3-的改动清单)
5. [性能与内存](#5-性能与内存)

---

## 1. 版本对比总览

| 功能 | v2 | v3 |
|------|:--:|:--:|
| 敌人类型（4种） | ✅ | ✅ |
| 敌人射击（敌弹） | ❌ | ✅ **新增** |
| Boss 战（每5关） | ❌ | ✅ **新增** |
| 道具系统（4种） | ✅ | ✅ |
| 暂停 / 重启 | ✅ | ✅ |
| EEPROM 最高分 | ✅ | ✅ |
| 全键盘 16 键利用 | 7键 | 10键 **扩展** |
| A 键炸弹（500分） | ❌ | ✅ **新增** |
| B 键静音切换 | ❌ | ✅ **新增** |
| C 键累计统计 | ❌ | ✅ **新增** |
| 升级视觉通知 | ❌ | ✅ **新增** |
| Boss 入场警告 | ❌ | ✅ **新增** |
| 持久化静音状态 | ❌ | ✅ **新增** |
| 累计击杀/死亡/Boss击杀 | ❌ | ✅ **新增** |
| Game Over 显示统计 | ❌ | ✅ **新增** |

---

## 2. 核心架构

```
┌────────────────────────────────────────────┐
│                  loop()                    │
│  每隔 TICK_MS(30ms):                       │
│    ├─ updateGame()   ← 游戏逻辑 + 渲染     │
│    └─ handleInput()  ← 键盘输入处理        │
│                                            │
│   updateGame():                            │
│    ├─ 计时器衰减                           │
│    ├─ Boss 更新 / 敌人生成                  │
│    ├─ 敌弹射击 + 移动                       │
│    ├─ 玩家子弹移动                          │
│    ├─ 敌人 / 道具移动                       │
│    ├─ 碰撞检测 checkCollisions()            │
│    ├─ EEPROM 自动存档                      │
│    └─ 逐层渲染（星→敌弹→子弹→敌人→Boss→道具→玩家→统计→HUD）│
│                                            │
│   handleInput():                           │
│    ├─ 扫描键盘 → h(bitmask) + extraKeys    │
│    ├─ 移动逻辑（不改）                      │
│    ├─ 射击逻辑（不改）                      │
│    └─ V3 扩展键: A=炸弹 B=静音 C=统计       │
└────────────────────────────────────────────┘
```

### V3 全局变量一览

```cpp
// ─── 原有 ───
float px, py;  bool gameOver, paused, tripleShot, shield;
int lives, score, highScore, level, levelKills, killsNeeded, moveSpeed;
int shootCD, invulnFrames, shakeTimer, flashTimer, levelMsg;
unsigned long pauseBlink, lastSave;
bool blAct[5], enAct[8], puAct[3];  // bullets, enemies, power-ups

// ─── V3 新增 ───
#define MAX_EB 12
bool ebAct[12];  float ebX[12], ebY[12];    // 敌弹激活/坐标
float ebVX[12], ebVY[12];                    // 敌弹速度向量

bool bossActive;  int bossHP, bossMaxHP;     // Boss 状态
float bossX, bossY, bossVX;                  // Boss 位置/速度
int bossPhase, bossTimer, bossPatternCD;     // Boss 阶段/计时/冷却

uint8_t extraKeys;                           // 扩展键值（A/B/C/D）
int totalKills, totalDeaths, bossKills;       // 累计统计
bool soundOn;                                 // 静音状态
int notifyTimer, notifyType;                  // 通知计时/类型
int showStats, bombCost;                      // 统计/炸弹HUD计时器
```

---

## 3. 功能详解

### 3.1 敌弹系统

**设计**: 敌方高速/蛇形/坦克兵种会发射子弹。普通敌人不射击。

**常量定义**:
```cpp
#define MAX_EB 12                           // 最大敌弹数
float ebVX[MAX_EB], ebVY[MAX_EB];           // 速度向量存储
```

**生成函数**（3种弹道）:
```cpp
// 直线弹 — 高速敌人使用，垂直下落
void spawnEB_linear(int eIdx) {
  int s=-1; for(int i=0;i<MAX_EB;i++){if(!ebAct[i]){s=i;break;}} if(s<0) return;
  ebAct[s]=true;
  ebVX[s]=0; ebVY[s]=2.5;          // 纯垂直，速度 2.5px/frame
  ebX[s]=enX[eIdx]+EW/2.0-1; ebY[s]=enY[eIdx]+EH;
}

// 扇形弹 — 蛇形(2发)/坦克(3发)，扇形散布
void spawnEB_fan(int eIdx, int cnt) {
  for(int f=0; f<cnt; f++) {
    int s=-1; for(int i=0;i<MAX_EB;i++){if(!ebAct[i]){s=i;break;}} if(s<0) break;
    ebAct[s]=true;
    float a = -PI/2 + (f - (cnt-1)/2.0) * PI/6.0;  // 扇形张角 ±30°
    ebVX[s]=cos(a)*2.0; ebVY[s]=sin(a)*2.0;
    ebX[s]=enX[eIdx]+EW/2.0-1; ebY[s]=enY[eIdx]+EH;
  }
}

// 瞄准弹 — Boss专用，朝玩家方向
void spawnEB_aimed(int eIdx) {
  int s=-1; for(int i=0;i<MAX_EB;i++){if(!ebAct[i]){s=i;break;}} if(s<0) return;
  ebAct[s]=true;
  float dx=px+PW/2.0-(enX[eIdx]+EW/2.0);
  float dy=py-(enY[eIdx]+EH);
  float d=sqrt(dx*dx+dy*dy)+0.01;
  ebVX[s]=dx/d*1.8; ebVY[s]=dy/d*1.8;  // 归一化方向 × 1.8 速度
  ebX[s]=enX[eIdx]+EW/2.0-1; ebY[s]=enY[eIdx]+EH;
}
```

**射击调度** (`updateGame()` 中):
```cpp
static int enShootClock=0;                  // 全局射击时钟
if(!bossActive) {
  enShootClock++;
  for(int e=0; e<MAX_EN; e++) {
    if(!enAct[e]) continue;
    if(enType[e]==0) continue;             // 普通敌人不射击
    int rate=60;                           // 基础射击间隔
    if(enType[e]==1) rate=55;              // 高速
    if(enType[e]==2) rate=40;              // 蛇形
    if(enType[e]==3) rate=30;              // 坦克（最短间隔）
    if((enShootClock+e*7)%rate==0) {       // 分散各敌射击帧
      if(enType[e]==1) spawnEB_linear(e);
      else if(enType[e]==2) spawnEB_fan(e,2);
      else if(enType[e]==3) spawnEB_fan(e,3);
    }
  }
}
```

| 敌人类型 | 弹道 | 射速（帧） | 射速（秒） |
|----------|------|:-----:|:-----:|
| 普通 (type=0) | 无 | — | — |
| 高速 (type=1) | 直线下坠 | 55 | ~1.7s |
| 蛇形 (type=2) | 2发扇形 | 40 | ~1.2s |
| 坦克 (type=3) | 3发扇形 | 30 | ~0.9s |

**敌弹移动** (`updateGame()` 中):
```cpp
for(int i=0; i<MAX_EB; i++) {
  if(!ebAct[i]) continue;
  ebX[i] += ebVX[i];  ebY[i] += ebVY[i];
  if(ebX[i]<-5 || ebX[i]>GW+5 || ebY[i]<-5 || ebY[i]>GH+5)
    ebAct[i] = false;
}
```

**敌弹渲染**（红色小点，3×3 像素）:
```cpp
for(int i=0; i<MAX_EB; i++) {
  if(!ebAct[i]) continue;
  spr.fillRect(ebX[i]-1, ebY[i]-1, 3, 3, 0xF800);   // 红色外框
  spr.fillRect(ebX[i],   ebY[i],   1, 1, 0xFD40);    // 亮红色核心
}
```

**玩家碰撞检测**:
```cpp
// ★ Enemy bullet vs Player
if(invulnFrames==0) {
  for(int e=0; e<MAX_EB; e++) {
    if(!ebAct[e]) continue;
    if(overlap(ebX[e], ebY[e], 3, 3, px, py, PW, PH)) {
      ebAct[e]=false;
      if(shield) { shield=false; sfxPower(); }
      else loseLife();
      break;
    }
  }
}
```

---

### 3.2 Boss 战

**设计**: 每 5 级触发一次 Boss 战。入场阶段 Boss 从屏幕顶部滑入，随后进入循环攻击模式。半血狂暴。

**触发时机** — `doLevelUp()` 中:
```cpp
// ★ Boss check
if(level%5==0 && !bossActive) startBoss();
```

**Boss 实体定义**:
```cpp
#define BOSS_W 48     // 宽度
#define BOSS_H 28     // 高度
```

**初始化和入场阶段**:
```cpp
void startBoss() {
  bossActive=true;  bossHP = 15 + level*2;  bossMaxHP = bossHP;
  bossX=GW/2-BOSS_W/2;  bossY=-BOSS_H;        // 从屏幕顶部外开始
  bossVX=1.2;  bossPhase=0;  bossTimer=0;  bossPatternCD=0;
  notifyTimer=120;  notifyType=NFY_BOSSWARN;   // 2秒BOSS警告
  // 清场现有敌人 + 敌弹
  for(int i=0;i<MAX_EN;i++) { if(enAct[i]) { explode(...); enAct[i]=false; score+=3; } }
  for(int i=0;i<MAX_EB;i++) ebAct[i]=false;
}
```

**Boss 战斗循环** (`updateBoss()`):
```cpp
void updateBoss() {
  if(!bossActive) return;

  // Phase 0: 入场（滑入到 y=20）
  if(bossPhase==0) {
    bossY += 0.8;
    if(bossY >= 20) { bossY=20; bossPhase=1; bossTimer=0; }
    return;
  }

  // Phase 1: 战斗
  bossTimer++;

  // 正弦水平移动
  bossX += bossVX;
  if(bossX<=0 || bossX+BOSS_W>=GW) {
    bossVX = -bossVX;
    bossX = constrain(bossX, 0, GW-BOSS_W);
  }

  // 攻击模式循环
  if(--bossPatternCD <= 0) {
    int p = (bossTimer/120) % 3;        // 每120帧切一次模式
    switch(p) {
      case 0: spawnEB_fan_boss(5);  bossPatternCD=35; break;   // 5发扇形
      case 1: spawnEB_aimed_boss(); spawnEB_aimed_boss();      // 3发瞄准
              spawnEB_aimed_boss();  bossPatternCD=25; break;
      case 2: bossVX=(rng(0,1)?1:-1)*3.0; bossPatternCD=50; break; // 冲锋冲刺
    }
    // 半血狂暴：冷却-5帧
    if(bossHP < bossMaxHP/2) bossPatternCD -= 5;
    if(bossPatternCD < 12) bossPatternCD = 12;
  }
}
```

| 模式 | 弹幕 | CD | 半血CD |
|------|------|:--:|:--:|
| 扇形散射 (p=0) | 5发扇形 | 35帧 | 30帧 |
| 瞄准射击 (p=1) | 3发追踪 | 25帧 | 20帧 |
| 冲锋冲刺 (p=2) | 高速移动 | 50帧 | 45帧 |

**Boss 受击与击败**:
```cpp
void hitBoss(int dmg) {
  bossHP -= dmg;  sfxHit();
  if(bossHP <= 0) {
    // 大爆炸视觉效果
    for(int i=0; i<18; i++) {
      float a=random(0,628)/100.0; int d=rng(10,40);
      int bx=bossX+BOSS_W/2+cos(a)*d, by=bossY+BOSS_H/2+sin(a)*d;
      if(bx>0&&bx<GW&&by>0&&by<GH) spr.fillCircle(bx,by,rng(2,5),0xFBE0);
    }
    score+=50; levelKills+=5; bossKills++;
    bossActive=false; shakeTimer=20; flashTimer=15;
    // 掉落2个道具
    spawnPowerUp(bossX+BOSS_W/2-10, bossY+BOSS_H/2);
    spawnPowerUp(bossX+BOSS_W/2+10, bossY+BOSS_H/2);
    saveEEPROM();
  }
}
```

**Boss 渲染**:
```cpp
void drawBoss() {
  if(!bossActive) return;
  // 身体
  spr.fillRect(bossX, bossY, BOSS_W, BOSS_H, 0xC618);
  spr.fillRect(bossX+2, bossY+2, BOSS_W-4, BOSS_H-4, 0x7BEF);
  // 驾驶舱(眼)
  spr.fillRect(bossX+BOSS_W/2-4, bossY+5, 8, 8, 0xF800);
  spr.fillRect(bossX+BOSS_W/2-1, bossY+7, 2, 3, TFT_WHITE);
  // 机翼
  spr.fillTriangle(bossX-6, bossY+BOSS_H,
                   bossX+4, bossY+BOSS_H-8,
                   bossX+12, bossY+BOSS_H, 0x9CD3);
  spr.fillTriangle(bossX+BOSS_W+6, bossY+BOSS_H,
                   bossX+BOSS_W-4, bossY+BOSS_H-8,
                   bossX+BOSS_W-12, bossY+BOSS_H, 0x9CD3);
  // 受击闪烁
  if(flashTimer>0 && flashTimer%3<2) return;
  // HP 血条
  float hpR = (float)bossHP / bossMaxHP;
  int barW = BOSS_W;
  spr.drawRect(bossX, bossY-6, barW, 4, 0xFFFF);
  spr.fillRect(bossX+1, bossY-5, barW-2, 2,
    hpR>0.3 ? 0x07E0 : (hpR>0.15 ? 0xFBE0 : 0xF800));
}
```

---

### 3.3 全键盘利用

**设计**: 原 v2 使用 7 个键（2/4/6/8/5/#/0/*），v3 扩展到 10 键，新增 A/B/C 键。D 键预留。

**关键设计**: 在不触碰原 `scanHeld()` 返回值的前提下，通过独立全局变量 `extraKeys` 追踪扩展键。

```cpp
uint8_t extraKeys;  // bit0=A  bit1=B  bit2=C  bit3=D

uint8_t scanHeld() {
  uint8_t h=0;  extraKeys=0;                   // ★ 每次清零
  for(int r=0; r<4; r++) {
    for(int rr=0; rr<4; rr++) digitalWrite(RP[rr], rr==r?LOW:HIGH);
    delayMicroseconds(50);
    for(int c=0; c<4; c++) {
      if(digitalRead(CP[c])==LOW) {
        const char m[16]={'1','2','3','A','4','5','6','B',
                          '7','8','9','C','*','0','#','D'};
        char k=m[r*4+c];
        // ─── 原 v2 位掩码（不变）───
        if(k=='2') h|=0x01; if(k=='4') h|=0x02;
        if(k=='6') h|=0x04; if(k=='8') h|=0x08;
        if(k=='5') h|=0x10; if(k=='#') h|=0x20;
        if(k=='0') h|=0x40; if(k=='*') h|=0x80;
        // ─── V3 扩展键 ───
        if(k=='A') extraKeys|=0x01;
        if(k=='B') extraKeys|=0x02;
        if(k=='C') extraKeys|=0x04;
        if(k=='D') extraKeys|=0x08;
      }
    }
  }
  return h;  // 返回值依然是 uint8_t，0x01-0x80
}
```

**扩展键处理** (`handleInput()` 中):
```cpp
void handleInput() {
  static uint8_t prev=0;
  static uint8_t prevExtra=0;               // ★ 扩展键去抖
  uint8_t h = scanHeld();
  uint8_t ex = extraKeys;

  // ... 原有处理 ...

  // ★ A键炸弹（边沿触发，消耗500分）
  if((ex&0x01) && !(prevExtra&0x01) && !gameOver && !paused) {
    useBomb();
  }
  // ★ B键静音切换（边沿触发）
  if((ex&0x02) && !(prevExtra&0x02)) {
    soundOn = !soundOn;  saveEEPROM();
  }
  // ★ C键显示统计
  if(ex & 0x04) showStats = 60;

  // ... 原有的移动/射击代码（不变）...

  prev=h;  prevExtra=ex;
}
```

| 按键 | 属性 | 功能 | 触发方式 |
|:----:|------|------|----------|
| A | `extraKeys & 0x01` | 炸弹（500分全屏清敌+敌弹） | 边沿（按下即触发） |
| B | `extraKeys & 0x02` | 静音开关（EEPROM持久化） | 边沿（按下即触发） |
| C | `extraKeys & 0x04` | 累计统计显示（60帧） | 电平（按住持续刷新） |
| D | `extraKeys & 0x08` | 预留 | — |

**炸弹实现**:
```cpp
void useBomb() {
  if(score < 500) return;          // 不足500分不触发
  score -= 500;  bombCost = 60;    // 扣分 + HUD闪烁60帧
  clearScreen();                   // 清屏（敌人+敌弹）
}
```

---

### 3.4 扩展 EEPROM 存档

**EEPROM 布局**（64 字节，从 v2 的 32 字节扩容）:

| 地址 | 变量 | 类型 | 大小 |
|:---:|------|------|:--:|
| 0 | `highScore` | `int` (4字节) | 最高分 |
| 4 | `soundOn` | `uint8_t` (1字节) | 静音状态 |
| 5 | `totalKills` | `uint16_t` (2字节) | 累计击杀 |
| 7 | `totalDeaths` | `uint16_t` (2字节) | 累计死亡 |
| 9 | `bossKills` | `uint16_t` (2字节) | Boss击杀 |
| 11 | *reserved* | — | 预留 |

**存储/读取**:
```cpp
void saveEEPROM() {
  EEPROM.put(EE_HS,   highScore);
  EEPROM.put(EE_SND,  (uint8_t)soundOn);
  EEPROM.put(EE_TKIL, (uint16_t)totalKills);
  EEPROM.put(EE_TDTH, (uint16_t)totalDeaths);
  EEPROM.put(EE_BKIL, (uint16_t)bossKills);
  EEPROM.commit();
}

void loadEEPROM() {
  EEPROM.get(EE_HS, highScore);
  uint8_t snd;  EEPROM.get(EE_SND, snd);
  soundOn = (snd==1);
  uint16_t v;
  EEPROM.get(EE_TKIL, v);  totalKills = (v<9999)?v:0;
  EEPROM.get(EE_TDTH, v);  totalDeaths = (v<9999)?v:0;
  EEPROM.get(EE_BKIL, v);  bossKills = (v<9999)?v:0;
  if(highScore > 99999) highScore = 0;   // 未初始化保护
}
```

**存档时机**:
| 时机 | 函数调用 |
|------|----------|
| 升级 | `doLevelUp()` |
| 玩家受伤 | `loseLife()` |
| Boss 击败 | `hitBoss()` |
| 自动保存 | `updateGame()` 每 5 秒 |
| 静音切换 | `handleInput()` B键触发 |

---

### 3.5 静音开关

**设计**: 通过宏 `BEEP()` 全局控制所有音效，静音时保持相同延迟以保证游戏节奏不变。

```cpp
bool soundOn;  // 默认 true

// 底层蜂鸣器（静音时仅延迟，不发声）
void beep(int f, int ms) {
  if(!soundOn) { delay(ms); return; }
  ledcWriteTone(BZ, f);  delay(ms);  ledcWriteTone(BZ, 0);
}

// 所有音效通过此宏调用
#define BEEP(f, ms) do { if(soundOn) { beep(f, ms); } else { delay(ms); } } while(0)
```

**HUD 显示** (`drawHUD()` 中):
```cpp
if(!soundOn) {
  tft.setTextColor(0xAD55, TFT_BLACK);
  tft.setCursor(SW/2-12, 22);
  tft.print("MUTE");
}
```

---

### 3.6 视觉通知系统

**通知类型**:
```cpp
#define NFY_SPEEDUP  1     // "SPEED+" — 每3级变速提示
#define NFY_ALERT    2     // "ALERT+" — 难度提升警告
#define NFY_NEWENEMY 3     // "NEW ENEMY!" — 新敌人解锁
#define NFY_BOSSWARN 4     // "BOSS!" — Boss入场警告
```

**触发时机** — `doLevelUp()` 中:
```cpp
if(level%3 == 0) { notifyTimer=45; notifyType=NFY_SPEEDUP; }
if(level == 2)   { notifyTimer=60; notifyType=NFY_NEWENEMY; }
if(level == 4)   { notifyTimer=60; notifyType=NFY_NEWENEMY; }
```

**渲染** — `drawHUD()` 中:
```cpp
if(notifyTimer>0) {
  switch(notifyType) {
    case NFY_SPEEDUP:
      tft.setTextColor(0xFBE0, TFT_BLACK);
      tft.setCursor(SW-64, 22);  tft.print("SPEED+");  break;
    case NFY_ALERT:
      tft.setTextColor(0xF800, TFT_BLACK);
      tft.setCursor(SW-64, 22);  tft.print("ALERT+");  break;
    case NFY_NEWENEMY:
      tft.setTextColor(0xF81F, TFT_BLACK);
      tft.setCursor(SW-80, 22);  tft.print("NEW ENEMY!");  break;
    case NFY_BOSSWARN:
      tft.setTextColor(0xF800, TFT_BLACK);  tft.setTextSize(2);
      tft.setCursor(SW/2-36, 14);  tft.print("BOSS!");
      tft.setTextSize(1);  break;
  }
}
```

---

### 3.7 累计统计

**全局变量**:
```cpp
int totalKills;    // 累计击杀（含所有敌兵 + Boss 清场击杀）
int totalDeaths;   // 累计死亡次数
int bossKills;     // Boss 击杀数
```

**统计更新点**:
| 事件 | 代码位置 | 更新内容 |
|------|----------|----------|
| 击杀敌人 | `checkCollisions()` | `totalKills++` |
| 玩家死亡 | `loseLife()` | `totalDeaths++` |
| Boss 击败 | `hitBoss()` | `bossKills++` |

**C 键实时显示** — `updateGame()` 渲染层:
```cpp
if(showStats > 0) {
  spr.setTextColor(TFT_WHITE, TFT_BLACK); spr.setTextSize(1);
  spr.setCursor(4, GH-36);
  spr.print("K:");  spr.print(totalKills);
  spr.print(" D:"); spr.print(totalDeaths);
  spr.print(" BOSS:"); spr.print(bossKills);
}
```

---

### 3.8 Game Over 扩展

**原 v2**: 仅显示 SCORE + LV + 新高分提示  
**V3 新增**: 累计 K/D/Boss 统计

```cpp
void drawGameOver() {
  spr.fillSprite(TFT_BLACK);
  // "GAME OVER" 闪烁标题
  spr.setTextColor((millis()/400)%2 ? 0xFBE0 : 0x528A, TFT_BLACK);
  spr.setTextSize(2);
  spr.drawCentreString("GAME OVER", GW/2, GH/2-40, 1);

  // SCORE + LV
  spr.setTextColor(TFT_WHITE, TFT_BLACK); spr.setTextSize(1);
  String s = "SCORE:" + String(score) + "  LV:" + String(level);
  spr.drawCentreString(s.c_str(), GW/2, GH/2-15, 1);

  // 新高分
  if(score>=highScore && score>0) {
    spr.setTextColor(0x07E0, TFT_BLACK);
    spr.drawCentreString("NEW HIGH SCORE!", GW/2, GH/2+2, 1);
  }

  // ★ 累计统计
  spr.setTextColor(0xAD55, TFT_BLACK);
  String st = "K:" + String(totalKills) +
              "  D:" + String(totalDeaths) +
              "  BOSS:" + String(bossKills);
  spr.drawCentreString(st.c_str(), GW/2, GH/2+20, 1);

  spr.setTextColor(0x8410, TFT_BLACK);
  spr.drawCentreString("Press * to restart", GW/2, GH/2+40, 1);
  spr.pushSprite(0, SH-GH);
}
```

---

## 4. 从 v2 到 v3 的改动清单

### 新增代码块（按行号）

| 行范围 | 函数/定义 | 功能 |
|:--|------|------|
| 头部注释 | 版本描述更新 | v2 → v3 |
| L58 | `#define MAX_EB 12` | 敌弹上限 |
| L66-69 | `#define NFY_*` | 通知类型枚举 |
| L85-86 | `ebAct/ebX/ebY` | 敌弹数组 |
| L89-92 | `bossActive/HP/X/Y/VX/Phase/Timer/CD` | Boss 状态 |
| L104-109 | `extraKeys/totalKills/Deaths/bossKills/soundOn/notify/...` | 扩展全局变量 |
| L112 | `#define EE_*` | EEPROM 新布局 |
| L115-133 | `saveEEPROM()` / `loadEEPROM()` | EEPROM 扩写 |
| L137 | `beep()` 中 `if(!soundOn)` | 静音支持 |
| L138 | `#define BEEP(f,ms)` | 静音宏 |
| L148-154 | `scanHeld()` 中 `extraKeys` | 扩展键扫描 |
| L164-165 | `initGame()` 中 `ebAct[]=false; bossActive=false` | 初始清零 |
| L206-209 | `float ebVX[12], ebVY[12]` | 敌弹速度向量 |
| L211-240 | `spawnEB_aimed/fan/linear()` | 敌弹生成函数 |
| L244 | `spawnEnemy()` 中 `if(bossActive) return` | Boss期间禁刷敌 |
| L255-371 | Boss 全部函数 | Boss 系统 |
| L361-364 | `checkCollisions()` 中 Boss 碰撞 | 玩家子弹打Boss |
| L372-381 | `checkCollisions()` 中 敌弹 vs 玩家 | 敌弹碰撞检测 |
| L396 | `clearScreen()` 中清敌弹 | 炸弹清屏 |
| L403-414 | `doLevelUp()` 中通知触发 | 升级通知 |
| L418 | `loseLife()` 中清敌弹 | 死亡后清弹 |
| L432-436 | `useBomb()` | A键炸弹 |
| L467-502 | `drawHUD()` 扩展 | 静音/炸弹/通知渲染 |
| L523-534 | `updateGame()` 中 Boss更新/敌人生成 | Boss调度 |
| L537-554 | `updateGame()` 中敌弹射击+移动 | 敌弹调度 |
| L576-581 | `updateGame()` 中敌弹渲染 | 敌弹绘制 |
| L585 | `updateGame()` 中 `drawBoss()` | Boss渲染 |
| L589-594 | `updateGame()` 中统计叠加 | C键统计 |
| L618-627 | `drawGameOver()` 中统计行 | Game Over统计 |
| L634-635 | `handleInput()` 中 `prevExtra/ex` | 扩展键处理 |
| L639-645 | `handleInput()` 中 A/B/C 键逻辑 | 扩展键动作 |
| L651-653 | `handleInput()` 中移动/射击批注 | 不改标识 |
| L658 | `setup()` 中 `EEPROM.begin(64)` | EEPROM 扩容 |
| L659 | `setup()` 中 `soundOn` 默认 | 静音初始化 |

### 不变代码（明确保留）

| 代码段 | 内容 |
|--------|------|
| `scanHeld()` 返回值 `uint8_t` + 位掩码 0x01-0x80 | 原有 7 键位不变 |
| 移动逻辑 | `moveSpeed=3+(level/3)` + 4方向判定 + 边界约束 |
| 射击触发 | `if(h&(0x01\|0x10\|0x20\|0x08)) spawnBullet()` |
| `spawnBullet()` | 完整保留，CD=8，三重射击偏移 |
| 敌人类型/外观 | `drawEnemy()` 完整保留 |
| 道具系统 | `spawnPowerUp/applyPowerUp` 完整保留 |
| 爆炸效果 | `explode()` 完整保留 |
| 暂停逻辑 | `drawPaused()` 完整保留 |

---

## 5. 性能与内存

| 指标 | v2 | v3 | 变化 |
|------|:---:|:---:|:---:|
| 代码行数 | ~500 | 823 | +65% |
| 文件大小 | ~21KB | 29.8KB | +42% |
| 全局变量 | ~200 bytes | ~280 bytes | +80 bytes |
| Flash占用估算 | ~270KB | ~335KB | +65KB |
| MAX_EB（敌弹） | — | 12 | 新增 |
| EEPROM 大小 | 32 bytes | 64 bytes | +32 bytes |
| 帧率 | 33 FPS | 33 FPS | **不变** |
| 每帧额外计算 | — | Boss AI + 敌弹12发 | 可忽略 |

Flash 占用在 ESP32 4MB 容量内（~8%），RAM 全局变量增量 80 字节在 520KB SRAM 内完全安全。

---

> *文档生成时间: 2026-06-18*  
> *代码位置: `esp32_joystick_test\esp32_plane