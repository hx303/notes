---
title: "RayFlare + TMM 建模原理与适用方法"
date: 2026-06-16
created: 2026-06-16
---

# RayFlare + TMM 建模原理与适用方法

## 摘要

本文档阐述 RayFlare（Python 光学模拟框架）中 TMM（Transfer Matrix Method，传输矩阵法）的
物理原理、计算流程，以及在钙钛矿/硅叠层结构中的**吸收光谱指纹**厚度测量方法。

---

## 1. TMM 物理原理

### 1.1 基本概念

TMM 是薄膜光学的标准工具，基于 Maxwell 方程组的平面波解。

对于多层薄膜结构（图 1），每层 j 的特征矩阵为：

$$
M_j = \begin{bmatrix}
\cos\delta_j & i\sin\delta_j / \eta_j \\
i\eta_j\sin\delta_j & \cos\delta_j
\end{bmatrix}
$$

其中：
- $\delta_j = \frac{2\pi}{\lambda} \tilde{n}_j d_j \cos\theta_j$ — 相位厚度
- $\tilde{n}_j = n_j + i k_j$ — 复折射率
- $\eta_j = \tilde{n}_j \cos\theta_j$ — TE 偏振导纳（垂直入射时 $\eta_j = \tilde{n}_j$）

### 1.2 全栈矩阵

N 层结构的总传输矩阵为各层矩阵的乘积：

$$
M_{\text{total}} = \prod_{j=1}^{N} M_j = \begin{bmatrix} m_{11} & m_{12} \\ m_{21} & m_{22} \end{bmatrix}
$$

反射系数和透射系数：

$$
\begin{aligned}
r &= \frac{\eta_0 B - C}{\eta_0 B + C}, \quad t = \frac{2\eta_0}{\eta_0 B + C} \\
[B; C] &= M_{\text{total}} \begin{bmatrix} 1 \\ \eta_{\text{sub}} \end{bmatrix}
\end{aligned}
$$

反射率和透射率：

$$
R(\lambda) = |r|^2, \quad T(\lambda) = \frac{\text{Re}(\eta_{\text{sub}})}{\text{Re}(\eta_0)} |t|^2
$$

**重要说明**：当结构中存在吸收层（$k > 0$）时，上述 T 公式不直接适用——$|r|^2 + T > 1$。
吸收需通过 Poynting 矢量通量法计算：$A_j = S_j^{\text{in}} - S_j^{\text{out}}$。

---

## 2. RayFlare 架构

RayFlare 提供三种光学求解器：

| 方法 | 适用场景 | 计算方式 |
|:--|:--|:--|
| **TMM** | 平面薄膜，相干/非相干 | 2×2 矩阵乘法 |
| **RT** (Ray Tracing) | 几何纹理面（> 波长尺度） | Monte Carlo + Fresnel 界面 |
| **RT_TMM** | 纹理面 + 薄层 | RT 查 TMM 预计算 LUT |

### 2.1 TMM 模式（当前方案）

```
入射光 (air, n=1)
   │
   ▼
╔═══════════════════╗
║ Perovskite 薄膜   ║  d = 100-1200 nm
║  ñ(λ) = n(λ)+ik(λ) ║  ──► 相干 TMM (干涉效应)
╚═══════════════════╝
   │
   ▼
╔═══════════════════╗
║ Silicon 衬底       ║  半无限厚
║  ñ(λ) = n(λ)+ik(λ) ║  ──► 非相干或半无限近似
╚═══════════════════╝
```

### 2.2 为什么选 TMM 而非 RT_TMM

- **平面薄膜**：钙钛矿旋涂膜表面平整（RMS < 10 nm），TMM 精度足够
- **物理坚实**：全场波解，天然包含 FP 干涉、吸收、色散
- **速度快**：每波长 O(N) 矩阵运算，比 RT 快 10³–10⁴ 倍
- **可解释**：每个光谱特征（峰、谷、包络）都有解析对应

---

## 3. 吸收光谱指纹方法

### 3.1 物理机制

钙钛矿吸收光谱 $A(\lambda; d)$ 随厚度变化的原因：

1. **Beer-Lambert 项**：$A \propto 1 - e^{-\alpha(\lambda)d}$（随 d 增加趋于饱和）
2. **Fabry-Perot 干涉**：薄膜内多次反射产生干涉条纹，条纹周期 $\Delta(1/\lambda) = 1/(2nd)$
3. **谱形演化**：UV 强吸收（表面敏感）→ NIR 弱吸收（体敏感）的过渡随 d 变缓

### 3.2 推荐方法：M3 光谱比

**公式**：

$$
\text{Ratio}(d) = \frac{\langle A(\lambda) \rangle_{400-500\,\text{nm}}}{\langle A(\lambda) \rangle_{750-850\,\text{nm}}}
$$

**物理含义**：
- 分子：UV 波段吸收，仅探头几个穿透深度的表面层 → 对 d 不敏感
- 分母：NIR 波段吸收，探针整个膜厚 → 随 d 增加
- 比值单调递减，拟合为指数衰减

**校准曲线**（CsBr 10% Br, ~1.6 eV, Si 衬底）：

$$
\text{Ratio}(d) = 88.5 \, e^{-0.0112\,d} + 2.56
$$

**反演公式**：

$$
d = -\frac{1}{0.0112} \ln\left(\frac{\text{Ratio} - 2.56}{88.5}\right) \quad (\text{nm})
$$

### 3.3 辅助方法

| 方法 | 公式 | 精度 | 适用范围 |
|:--|:--|:--|:--|
| M6 FP 最小位置 | $\lambda_{\min} \propto d$ | 中 | d > 500 nm |
| M5 吸收边积分 | $\int_{550}^{800} A(\lambda) d\lambda$ | 低（非单调） | 定性 |
| M1 条纹计数 | $N = 2nd \cdot \Delta(1/\lambda)$ | 高（需宽窗） | d > 800 nm |

---

## 4. 与前方案（RayFlare RT + PL）的对比

| | TMM 吸收光谱法 | RT + PL 法 |
|:--|:--|:--|
| **物理基础** | Maxwell 方程（严格） | 几何光学 + PL 自吸收模型 |
| **输入** | 仅 n,k 光学常数 | n,k + PL 谱 + 表面纹理 |
| **计算速度** | ~10⁴ λ/d 组合/秒 | ~1 λ/d 组合/秒（含 LUT 生成） |
| **膜厚范围** | 任意（TMM 无下限） | 受纹面尺寸/PL 收集限制 |
| **灵敏度** | 全光谱信息 | 仅 PL 波段（~50-100 nm 宽） |
| **适用范围** | 平面器件（已验证） | 任意纹理（需纹理测量） |
| **实验要求** | 反射/透射光谱仪 | PL 显微光谱仪 + 纹面 AFM |

---

## 5. 实施路线图

### Phase 1: ✅ 光学常数 + TMM 验证
- [x] CsBr 代理材料（n,k 已有）
- [x] TMM 单层模型（Perovskite/Si）验证 R+A+T ≡ 1
- [ ] **替换为实际钙钛矿组分的 n,k 数据**（椭偏仪测量或文献）

### Phase 2: ✅ 指纹提取
- [x] M3 光谱比方法（推荐）
- [x] M6 FP 条纹追踪（辅助）
- [ ] 多波长点联合反演（提高鲁棒性）

### Phase 3: ⏳ 实验对标
- [ ] 用已知厚度的标准样品验证校准曲线
- [ ] 不确定度分析（n,k 误差 × 仪器噪声传递）

### Phase 4: ⏳ LUT 部署
- [ ] 生成 R(λ,d)、A(λ,d)、ratio(d) 全查询表
- [ ] Python API：`d = get_thickness(R_measured)` 

---

## 6. 关键参考文献

| 文献 | 贡献 |
|:--|:--|
| **Macleod, *Thin-Film Optical Filters* (2001)** | TMM 标准教材，§2.4 矩阵推导 |
| **Ball et al., *Energy Environ. Sci.* (2015)** | TMM 用于平面钙钛矿太阳能电池的基准验证 |
| **Callies et al., *Solar RRL* (2025)** | 光学重吸收主导 PL 峰移的实验证明 |
| **Giliberti et al., *Politecnico di Torino Dataset* (2022)** | 钙钛矿/Si 叠层光学常数数据库 |

---

## 7. 代码位置

| 文件 | 内容 |
|:--|:--|
| `scripts/tmm_end_to_end.py` | TMM v4 端到端（R, A, T 计算 + PL 模型） |
| `scripts/absorption_fingerprint.py` | 吸收光谱指纹分析（5 种方法） |
| `output/tmm_results_v4.npz` | 12 厚度 × 500 波长 × 2 衬底完整数据 |
| `output/fingerprint_dashboard_v3.png` | 指纹方法可视化仪表板 |
| `output/calibration_m3.json` | M3 方法校准参数 |

---

*生成: 2026-06-16 | TMM v4 | 为导师要求准备*
