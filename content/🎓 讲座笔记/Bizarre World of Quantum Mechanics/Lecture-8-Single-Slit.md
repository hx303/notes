---
title: "Lecture 8: The Single Slit"
date: 2026-07-07
tags: [quantum-mechanics, lecture-notes, single-slit, diffraction, feynman]
---

# Lecture 8: The <span class="qtip" data-cn="单缝：一条狭缝的衍射实验">single slit</span>

## Learning Goals

- Develop Feynman's model for how light travels from one point to another employing the rules of quantum mechanics.
- **<span class="qtip" data-cn="先决条件、必备知识">prerequisite</span>:** You should be familiar with the quantum model for how light partially reflects from the surface of glass.
- **After this lesson,** you will be able to:
  - Describe how light appears to travel in straight lines.
  - Explain what happens when light is forced to travel through a narrow slit.
  - Understand how slit width depends on the color of the light.
- **Stretch goal:** You may be able to explain the single-slit <span class="qtip" data-cn="衍射：波绕过障碍物时弯曲扩展">diffraction</span> patterns that develop when light travels through a narrow slit.

---

## Introduction: Why Single and Multiple Slits?

Having mastered **<span class="qtip" data-cn="部分反射：光在界面按概率部分反射">partial reflection</span>** and the concept of a <span class="qtip" data-cn="光子：光的量子，电磁辐射的基本粒子">photon</span> undergoing **quantum <span class="qtip" data-cn="干涉：多个波的叠加效应">interference</span>**, we now move to a different series of experiments — ones that will ultimately unveil the quantum mystery.

The experiment is simple:

> Shine light at a dark screen that has one or more slits cut into it, and look at the pattern of light that hits a second screen far away.

Despite its apparent simplicity, this experiment holds the key to understanding **both quantum mechanics and the behavior of light**.

Light traveling through a single slit can be thought of as a test of the question: **Does light travel in a straight line?** — and *why*.

---

## Feynman's Quantum Model for Light Travel

### Key Insight

In the quantum theory, **many paths** contribute to the light that goes through a narrow slit — not just the path with the shortest length (the straight-line path).

- For paths **near** the shortest-distance path, the length changes **slowly**, so the arrows (probability amplitudes) do not turn significantly more. These paths contribute strongly to the final arrow.
- When there is **no straight-line path**, the times for different paths increase **more rapidly**, so the arrows for different alternatives tend to spin around, and their sum goes nowhere — resulting in a **small final arrow**.

> If these facts are not clear, revisit the computer tutorial and pay close attention to these two ideas.

---

## The Role of Color (<span class="qtip" data-cn="波长：相邻波峰间的距离">wavelength</span>)

The **color of light** determines how fast the stopwatch hand rotates:

| Color | Relative Rotation Rate | Relative Wavelength | Relative Energy |
|-------|----------------------|---------------------|-----------------|
| Red | Slowest (~36,000 rotations/inch) | Longest (~1/36,000 inch ≈ 0.7 μm) | Lowest |
| Green | ~50% faster than red | ~50% less than red | Medium |
| Blue | ~2× faster than red | ~2× less than red | Highest |

### Key Relationships

- **Photon energy is <span class="qtip" data-cn="成正比的">proportional</span> to rotation rate** — blue light carries more energy than green, which carries more than red.
- **Wavelength** is defined as the distance the photon travels during **one full revolution of the clock**.

### Practical Consequences

- **Ultraviolet light** (even faster rotation / higher energy) is used to initiate chemical processes.
- UV light causes **sunburns**; infrared light (slower rotation / lower energy) makes sunlight feel hot on your skin.

(Video demonstration — "Squeezing Photons Through a Narrow Slit," MIT Physics Department)

---

## Changing the Slit Width

- A **red laser** is used in the demonstration, and the slit width is varied.
- When the slit is **wide** → light travels in nearly straight lines (predictable, particle-like).
- When the slit is **narrow** → light **spreads out** dramatically (wave-like diffraction).

> The pattern seen when the slit is made extremely narrow is relevant to the famous debate in the movie *Big Bang*.

Changing the **color of light** acts similarly to changing the **width of the slit opening** — increasing <span class="qtip" data-cn="频率：单位时间内的周期数">frequency</span> (red → blue) is comparable to narrowing the slit.

---

## Open Exploration Questions

After working through the compute engine tutorials, consider these questions:

1. **Straight lines vs. spreading:** How can light tend to travel in straight lines, yet spread out when squeezed through a narrow slit? Does this relate to **Heisenberg's uncertainty principle**?

2. **Color-slit equivalence:** Explore how increasing the frequency of light (red → blue) compares with narrowing the slit.

3. **Diffraction fringes:** The video shows interesting diffraction patterns at the outer edges. Use the compute engine to see if you can find an arrangement that describes this behavior.

4. **Slit width as a microscope:** Since narrowing the slit expands the pattern, could you measure slit width from the pattern size if you know the wavelength? In this sense, the single-slit experiment is like a microscope.

5. **What's next?** What will happen when we add a **second slit**?

---

## Key Takeaways

1. **Many paths contribute:** In quantum mechanics, light does *not* simply follow the shortest path. All paths contribute, but those near the straight-line path contribute the most because their arrows point in similar directions.

2. **Color = rotation rate = energy:** The color of light directly encodes the photon's energy and wavelength. Blue light has higher energy and shorter wavelength than red light.

3. **Slit width controls diffraction:** Narrowing the slit causes light to spread out more — a direct manifestation of quantum interference among the available paths.

4. **Color and slit width are linked:** Changing the color of light has a similar effect to changing the slit width. This connection is fundamental to understanding diffraction.

5. **The single slit is just the beginning:** This setup prepares us for the two-slit experiment, which contains the central mystery of quantum mechanics.

> **Historical note:** Joseph von Fraunhofer (1787–1826) is generally credited with first solving the problem of diffraction from a single slit.
