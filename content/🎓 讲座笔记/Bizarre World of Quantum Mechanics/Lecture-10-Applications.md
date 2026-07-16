---
title: "Lecture 10: Applications of the Quantum Theory of Light"
date: 2026-07-07
tags: [quantum-mechanics, lecture-notes, diffraction-grating, mirrors, lenses, normalization]
---

# Lecture 10: Applications of the Quantum Theory of Light

> *"I have been in a quandary over quantum mechanics, which, to my mind, remains impossible to define, let alone comprehend."*
>
> — **Joseph Heller**, *Now and Then* (1998)

## Learning Goals

- Apply our quantum theory of light to **mirrors**, **<span class="qtip" data-cn="衍射：波绕过障碍物时弯曲扩展">diffraction</span> gratings**, and **lenses**.
- Describe the subtle effects of **normalization**.
- **<span class="qtip" data-cn="先决条件、必备知识">prerequisite</span>:** You must have learned about and appreciated the quantum mystery of the two-slit experiment.
- **After this lesson,** you will be able to:
  - Use quantum theory to describe how mirrors, diffraction gratings, and lenses work.
- **Stretch goal:** Define the procedure called "normalization" and describe how to take the limit of an infinite number of alternative ways for an event to occur.

---

## Mirrors and Diffraction

### Why Does the Angle of Incidence Equal the Angle of Reflection?

Using the quantum theory, we can show why this classical result holds **on average**:

- A <span class="qtip" data-cn="光子：光的量子，电磁辐射的基本粒子">photon</span> reflects off a mirror by exploring **many possible paths**.
- The paths near the one where the angle of incidence equals the angle of reflection have arrows that point in nearly the same direction — they **add constructively**.
- Paths far from this geometry have arrows that spin rapidly — they **cancel out**.

> This same reasoning introduces a new <span class="qtip" data-cn="现象">phenomenon</span>: **diffraction**, which allows separating light according to its color with remarkable precision.

(Computer tutorial demonstrations)

---

## Diffraction Gratings and Spectrometers

### How Diffraction Gratings Work

A <span class="qtip" data-cn="衍射光栅：多缝结构用于分光">diffraction grating</span> is essentially a surface with **tens of thousands to hundreds of thousands of lines per inch** scraped onto a mirror surface. Each line acts as a new source of light, and the reflected light from all these lines interferes.

- Light reflected at different angles undergoes constructive or <abbr title="相消干涉：波叠加互相抵消">destructive <span class="qtip" data-cn="干涉：多个波的叠加效应">interference</span></abbr> depending on the **<span class="qtip" data-cn="波长：相邻波峰间的距离">wavelength</span>**.
- By measuring the **angle** at which light emerges from the grating, one can determine the **wavelength** of the photon.

### The Spectrometer

A **spectrometer** shines light onto a diffraction grating and measures the angle at which the light comes off. After applying simple geometry, the wavelength of the photon can be determined from that angle.

### Historical Impact

- Once spectrometers became available (mid-to-late 1800s), scientists discovered that **elements** give off **<span class="qtip" data-cn="分立的、离散的">discrete</span> spectral lines** when excited (by burning, high-voltage discharge, etc.).
- All elements were categorized and tabulated by their spectral lines.
- When the spectrometer was aimed at the **Sun**, previously unknown spectral lines were discovered → led to the discovery of **Helium** (named after *Helios*, the Greek sun god), jointly identified by British astronomer **Norman Lockyer** and French astronomer **Pierre Janssen**.

> In the United States, **Henry Rowland** (Johns Hopkins University) was renowned for making precision diffraction gratings — he became the first President of the American Physical Society.

---

## Lenses: How They Focus Light

### The Quantum Explanation

Recall from the single-slit experiment: light traveling on paths closest to a straight line (shortest distance, least time) from source to <span class="qtip" data-cn="探测器：检测粒子到达状态的装置">detector</span> contributed the most.

**Key idea:** What if we could **slow down** photons traveling on the shorter, straight-line paths so that all paths take the **same time**?

- Then all the arrows would point in the **same direction** → maximum <span class="qtip" data-cn="相长干涉：波叠加互相加强">constructive interference</span> → very bright light at the detector.

### How Do We Slow Down Photons?

- Einstein's special relativity says the speed of light in a **vacuum** is constant — but says nothing about light in materials.
- Photons move about **50% slower** in glass than in air.
- By engineering a glass sheet that is **thicker in the center and thinner at the edges**, photons on the shorter (straight-line) path spend more time in the glass and are slowed down.
- Result: **all paths take the same time**, all arrows add constructively, and light is focused to a bright point.

> This is how a **<span class="qtip" data-cn="透镜：折射光线聚焦的光学元件">lens</span> focuses light** in the quantum picture.

(Computer demonstration — "Through the Looking Glass")

### Historical Note

- First commercial glass lenses: late 13th century Italy (eyeglasses).
- Lenses without color distortion invented in the late 16th century Netherlands.
- Enabled the invention of the **microscope** and **telescope**.
- **Galileo** popularized the telescope and revolutionized our understanding of the solar system.

---

## Normalization

### What Is Normalization?

Normalization is the requirement that the **total probability** for everything that might happen must equal **1** (or 100%).

> The reason is simple: there is nothing else that can occur, so this includes *all* possibilities.

### Why It Matters

In our earlier simplified treatments:

- Drawing a set of lines for alternative ways an event could occur, we didn't account for the fact that **doubling the number of lines** would appear to increase the probability by almost a factor of **four**.
- When normalization is properly applied, this does *not* happen — the probabilities change, but only **slightly**.

### Taking the Limit

To get the exact answer, we must continue adding more and more paths until we reach the **limit of an infinite number of paths**.

- This may sound intimidating, but we've already done something similar: the **geometric series** used in the multiple-reflections lesson.
- The procedure for other quantum problems is very similar.

> The computer tutorials handle these details for us. To become a practicing physicist, you would spend years learning the mathematics — but you don't need that complexity to understand the **basic idea**.

---

## Course Conclusion

We have reached the end of the course. You have learned more about quantum mechanics than you may have thought possible — your knowledge is now beyond that of more than **99% of the population**.

### What Was Covered

| Module | Topic |
|--------|-------|
| <span class="qtip" data-cn="部分反射：光在界面按概率部分反射">partial reflection</span> | How light partially reflects from glass; quantum probability rules |
| <span class="qtip" data-cn="单缝：一条狭缝的衍射实验">single slit</span> | Why light travels in straight lines; diffraction from single slits |
| <span class="qtip" data-cn="双缝：两条平行狭缝的干涉实验">double slit</span> | The quantum mystery; <span class="qtip" data-cn="互补性：波粒二象性的本质">complementarity</span>; measurement and observation |
| Applications | Mirrors, diffraction gratings, lenses, normalization |

### What Lies Ahead

Topics beyond this course that build on these foundations:

- Quantum teleportation
- Quantum computing
- Quantum encryption
- Quantum <span class="qtip" data-cn="纠缠：多粒子量子态的不可分割关联">entanglement</span>
- Quantum Zeno effect
- <span class="qtip" data-cn="无相互作用测量：不接触物体也能探测其存在">interaction-free measurement</span> ("quantum seeing in the dark")
- The Hong-Ou-Mandel effect (identical quantum particles)

> *"Keep reading, keep studying, keep learning about quantum mechanics. You will always find it to be enriching."*

---

## Key Takeaways

1. **Mirrors work by quantum interference:** The angle of incidence equals the angle of reflection because paths near that geometry have arrows that add constructively — a direct consequence of the same quantum rules used throughout the course.

2. **Diffraction gratings separate light by color:** By creating thousands of regularly spaced scattering centers, diffraction gratings cause different wavelengths to interfere constructively at different angles, enabling precise spectroscopy and the discovery of elements like Helium.

3. **Lenses focus light by equalizing path times:** A lens slows down photons on shorter paths (by making them travel through more glass), so all paths from source to focus take the same time and their arrows add constructively.

4. **Normalization is essential but subtle:** Total probability must always equal 1. Adding more alternative paths doesn't arbitrarily increase probability — the amplitudes must be properly normalized, a process best handled computationally.

5. **The quantum rules extend everywhere:** From the simplest reflection off a mirror to the most sophisticated diffraction grating, the same framework — enumerating paths, assigning arrows, summing, and squaring — explains all optical <span class="qtip" data-cn="现象（复数）">phenomena</span>.

> **Course credit:** This two-week class took over *three years* to develop by the **Quantum Mechanics for Everyone Team** at Georgetown University.
