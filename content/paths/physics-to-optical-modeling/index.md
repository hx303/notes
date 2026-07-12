---
title: 从物理到光学建模
description: 从电磁场与线性代数基础出发，理解 TMM、RCWA，并把模型用于薄膜测量问题。
comments: false
learningPath:
  id: physics-to-optical-modeling
  status: published
  maintenance: maintained
  lastReviewed: 2026-07-11
  audience:
    - 已学过高中物理，正在接触大学物理或光学的学习者
    - 想理解 TMM、RCWA 为什么成立，而不只想运行现成代码的人
    - 正在处理薄膜、光栅或钙钛矿光学测量问题的初学研究者
  outcome: 能从电磁场、特征值与界面传播出发，解释 TMM 和 RCWA 的适用范围，并为实际薄膜问题选择合适的建模方法。
  estimatedTime: 8–12 小时
  prerequisites:
    - label: 高中物理中的反射、折射与干涉概念
      note: 不要求预先掌握完整电磁场理论。
    - label: 微积分基础
      slug: 📖-课堂笔记/微积分上/index
      note: 能理解导数、积分和简单微分方程即可。
  steps:
    - id: electromagnetic-field
      slug: 📖-课堂笔记/大学物理/大学物理-第八章-电磁感应与电磁场（完整版）
      purpose: 建立电场、磁场与变化电磁场的物理语言，为光作为电磁波做好准备。
      outcome: 能说明变化的电场与磁场如何相互联系，并识别后续模型使用的场量。
      duration: 90–120 分钟
    - id: eigenvalues
      slug: 📖-课堂笔记/线性代数/5.1_特征值与特征向量
      purpose: 补齐模式分解所需的线性代数工具，理解为什么传播问题会变成特征值问题。
      outcome: 能解释特征值、特征向量与传播模式之间的对应关系。
      duration: 45–60 分钟
    - id: optics-overview
      slug: notes/rcwa-from-zero
      purpose: 沿 Fresnel 方程、薄膜干涉、TMM、衍射与 RCWA 建立一条完整概念链。
      outcome: 能用自己的话复述 TMM 与 RCWA 的核心假设、数学结构和适用尺度。
      duration: 4–6 小时
    - id: tmm-deep-dive
      slug: 科研项目/TMM-建模原理与适用方法
      purpose: 把概念链落实到 RayFlare 与 TMM 的具体建模边界，理解相干和非相干处理。
      outcome: 能判断一个多层薄膜问题何时适合 TMM，并识别模型输入、输出和主要限制。
      duration: 60–90 分钟
    - id: measurement-application
      slug: 科研项目/钙钛矿金字塔绒面膜厚光学测量：两大方案对比分析
      purpose: 在真实测量问题中比较方法，连接模型假设、实验几何与误差来源。
      outcome: 能为绒面薄膜测量提出方法选择，并解释为什么简单模型可能失效。
      duration: 60–90 分钟
  branches:
    - id: finite-element-branch
      afterStep: optics-overview
      slug: 📖-课堂笔记/COMSOL-基础培训/01-基本建模流程
      label: 可选分支：用有限元视角对照
      reason: 如果你还想比较 RCWA 与通用多物理场方法，可以在总览后学习 COMSOL 的基本建模流程；跳过不会影响主线。
      duration: 45–60 分钟
---
