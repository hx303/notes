---
title: "🎨 Mermaid 图表功能演示"
tags: [demo, mermaid, feature]
date: 2026-06-12
subject: 跨学科工具
topic: 可视化
difficulty: 入门
---

# 🎨 Mermaid 图表功能演示

> wouldkeep.com 现已支持 **Mermaid** 图表渲染！在任何笔记中用 ` ```mermaid ` 代码块即可画图。

---

## 流程图（Flowchart）

```mermaid
graph TD
    A[开始学习] --> B{有基础吗?}
    B -->|有| C[直接看教材]
    B -->|没有| D[先看前置课程]
    D --> E[看视频讲解]
    C --> F[做习题]
    E --> F
    F --> G{正确率 > 80%?}
    G -->|是| H[进入下一章]
    G -->|否| I[复习薄弱点]
    I --> F
```

---

## 知识图谱（概念关系）

```mermaid
graph LR
    极限 --> 导数
    极限 --> 连续
    导数 --> 微分
    导数 --> 中值定理
    微分 --> 不定积分
    中值定理 --> 泰勒公式
    不定积分 --> 定积分
    定积分 --> 重积分
    重积分 --> 曲线积分
```

---

## 时间线（甘特图）

```mermaid
gantt
    title 期末复习计划
    dateFormat  YYYY-MM-DD
    section 微积分
    极限与连续     :a1, 2026-06-15, 2d
    导数与微分     :a2, after a1, 2d
    积分           :a3, after a2, 3d
    section 线性代数
    矩阵与行列式   :b1, 2026-06-15, 2d
    向量空间       :b2, after b1, 2d
    特征值         :b3, after b2, 2d
    section 大学物理
    力学           :c1, 2026-06-19, 2d
    电磁学         :c2, after c1, 3d
```

---

## 序列图

```mermaid
sequenceDiagram
    participant S as 学生
    participant N as 笔记
    participant T as 测验
    S->>N: 阅读概念
    N->>S: 理解定义
    S->>T: 做练习题
    T->>S: 反馈正确率
    alt 正确率 > 80%
        S->>N: 进入下一章
    else 正确率 < 80%
        S->>N: 返回复习
    end
```

---

## 数学分类（思维导图）

```mermaid
mindmap
  root((大学数学))
    微积分
      极限与连续
      一元微分学
      一元积分学
      多元微积分
      级数
    线性代数
      矩阵运算
      行列式
      向量空间
      特征值与特征向量
      二次型
    概率统计
      概率论基础
      随机变量
      数理统计
```

---

## 状态图

```mermaid
stateDiagram-v2
    [*] --> 未学习
    未学习 --> 学习中 : 开始
    学习中 --> 已理解 : 掌握概念
    学习中 --> 困惑 : 遇到难点
    困惑 --> 学习中 : 查资料/问老师
    已理解 --> 已掌握 : 做对习题
    已理解 --> 学习中 : 做题出错
    已掌握 --> [*]
```

---

> [!tip] 使用提示
> - Mermaid 代码块支持**缩放**和**拖拽平移**（右下角按钮）
> - 点击`⊕`按钮可以**全屏查看**大图
> - 暗色模式下图表会**自动适配**配色
> - 更多图表类型：[Mermaid 官方文档](https://mermaid.js.org/)
