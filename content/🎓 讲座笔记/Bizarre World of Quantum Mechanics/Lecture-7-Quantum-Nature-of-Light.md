---
title: "Lecture 7: Exploring the Quantum Nature of Light"
date: 2026-07-07
tags:
  - quantum-mechanics
  - lecture-notes
  - partial-reflection
  - feynman-paths
  - thin-film-interference
  - multiple-reflections
---

# Lecture 7: Exploring the Quantum Nature of Light

> "If quantum mechanics hasn't profoundly shocked you, you haven't understood it yet." — Niels Bohr, Nobel Prize Winner in Physics, 1922

## Learning Goals

- Determine how light, while acting as a particle, manages to **partially reflect** off glass
- Use the quantum theory to describe <span class="qtip" data-cn="部分反射：光在界面按概率部分反射">partial reflection</span>
- Determine the physical origin of the **colors on soap bubbles and oil slicks**
- Describe how one can measure the **<span class="qtip" data-cn="波长：相邻波峰间的距离">wavelength</span> of light** simply by measuring an angle

**Prerequisites**: Familiarity with the <span class="qtip" data-cn="光子：光的量子，电磁辐射的基本粒子">photon</span> as a particle of light and with the quantum rules from Lecture 6.

---

## The Problem of Partial Reflection

### Why Classical Intuition Fails

One might think glass has "holes" (like a screen) — photons pass through holes when they transmit and bounce off the mesh when they reflect. But:

- **Thicker glass can transmit more than thinner glass** — hard to explain with a hole model
- **Reflection probability oscillates with thickness** — this is what is actually observed
- **Polishing glass makes it more reflective** — inconsistent with the idea of holes letting photons through

> So if glass does not have holes, how does a particle manage partial reflection?

---

## Reflection from a Glass Slab

### Thought Experiment Setup

> This is a **thought experiment** — it cannot be actually performed, but we can imagine how it would work and use the quantum theory to explain the results.

- Light is <span class="qtip" data-cn="入射的（光/束流）">incident</span> **vertically** (normal incidence) — the diagrams show paths at small angles only for visual clarity
- We consider light reflecting off a glass slab and determine how the arrow method explains the observed behavior

### Two Paths for Reflection

For a photon to be detected above the glass (reflection event):

| Path | Description | Arrow Length |
|------|-------------|:-----------:|
| **Top surface** | Reflects directly off the top of the glass | $0.2$ |
| **Bottom surface** | Transmits through top, reflects off bottom, transmits back through top | $0.2 \times 0.9798 \times 0.9798 = 0.192$ |

The bottom path involves: **transmit (×0.9798) → reflect (×0.2) → transmit (×0.9798)**.

### Reflection Probability

**Maximum** (arrows aligned):

$$
P_{\text{max}} = (0.2 + 0.192)^2 = (0.392)^2 = 0.1537 = 15.37\%
$$

**Minimum** (arrows opposite):

$$
P_{\text{min}} = (0.2 - 0.192)^2 = (0.008)^2 = 0.000064 = 0.0064\%
$$

---

## Transmission Through Glass

### Two Paths for Transmission

For a photon to be detected below the glass (transmission event):

| Path | Description | Arrow Length |
|------|-------------|:-----------:|
| **Direct** | Transmits straight through (no reflections) | $1 \times 0.9798 \times 0.9798 = 0.9600$ |
| **Two reflections** | Transmits → reflects off bottom → reflects off top → transmits out bottom | $1 \times 0.9798 \times 0.2 \times 0.2 \times 0.9798 = 0.0384$ |

### Transmission Probability (Two-Path Approximation)

**Maximum**:

$$
P_{\text{max}} = (0.9600 + 0.0384)^2 = (0.9984)^2 = 0.9968 = 99.68\%
$$

**Minimum**:

$$
P_{\text{min}} = (0.9600 - 0.0384)^2 = (0.9216)^2 = 0.8493 = 84.93\%
$$

---

## The Probability Problem

### <span class="qtip" data-cn="守恒">conservation</span> of Probability

A photon must either reflect **or** transmit — the probabilities should sum to 100%:

| Case | Reflection | Transmission | Sum |
|------|:----------:|:------------:|:---:|
| Max reflection / Min transmission | $15.37\%$ | $84.93\%$ | $100.30\%$ |
| Min reflection / Max transmission | $0.0064\%$ | $99.68\%$ | $99.69\%$ |

> **The sums don't add up to exactly 100%!** This is not round-off error — there is a genuine problem with only considering two paths.

---

## Resolving the Problem: Multiple Reflections

### The Missing Paths

Our quantum rules say: **identify all alternative ways an event can occur**. We neglected paths with more than one internal reflection!

For **reflection** (odd number of reflections):

- 1 reflection: $0.2 \times 0.9798^2 = 0.192$ (already calculated)
- 3 reflections: $0.2^3 \times 0.9798^2 = 0.2 \times 0.2 \times 0.2 \times 0.9798^2 = 0.00768$
- 5 reflections: $0.2^5 \times 0.9798^2 = 0.0003072$
- General: $2n+1$ reflections → arrow length $0.96 \times (0.2)^{2n+1}$

For **transmission** (even number of reflections):

- 0 reflections: $0.9798^2 = 0.9600$ (already calculated)
- 2 reflections: $0.9798^2 \times 0.2^2 = 0.0384$ (already calculated)
- 4 reflections: $0.9798^2 \times 0.2^4 = 0.001536$
- 6 reflections: even smaller

### Case 1: Minimal Reflection (Complete Cancellation)

When the arrow rotations all line up (integer number of revolutions for the glass transit):

- All bottom-reflection arrows point in the **same direction**
- Their sum (geometric series):

$$
0.96 \times [0.2 + 0.2^3 + 0.2^5 + \dots] = 0.96 \times 0.2 \times \frac{1}{1 - 0.04} = 0.2
$$

- The top-reflection arrow (0.2, rotated by 6 hours) points **opposite** to this sum
- Total: $0.2 - 0.2 = 0$ → **zero reflection!**
- Transmission: $0.96 \times [1 + 0.04 + 0.04^2 + \dots] = \frac{0.96}{1 - 0.04} = 1$ → **100% transmission!**

### Case 2: Maximal Reflection

When the transit rotation corresponds to 6 hours:

- Bottom-reflection arrows alternate in direction
- Their sum:

$$
0.96 \times [0.2 - 0.2^3 + 0.2^5 - \dots] = \frac{0.96 \times 0.2}{1 + 0.04} = 0.1846
$$

- Top reflection (0.2) adds to this → total: $0.2 + 0.1846 = 0.3846$
- Probability: $0.3846^2 \approx 14.8\%$ (maximum possible for glass with 4% per-surface reflection)

**Corresponding transmission:**

$$
P = \left(\frac{0.96}{1 + 0.04}\right)^2 = 0.9231^2 \approx 85.2\%
$$

$$
14.8\% + 85.2\% = 100\% \quad \checkmark
$$

> **Probability is conserved when all multiple reflections are included!**

---

## The Physical Origin of Soap Bubble and Oil Slick Colors

(Images: soap bubble by Iman Sadeghi; oil slick by Jim Freericks)

The colors on soap bubbles and oil slicks come from **partial reflection of light** — exactly the quantum <span class="qtip" data-cn="现象">phenomenon</span> we have been analyzing.

### How It Works

1. A particular thickness of film may **reflect red light completely** while **transmitting blue or green light**
2. The color that is primarily reflected or transmitted depends on the **thickness of the film**
3. As thickness changes (due to fluid movement, evaporation, or gravity):
   - The relative rotation between different reflection paths changes
   - Different colors (different rotation rates) constructively or destructively interfere
   - Different parts of the film display different colors

### Key Facts

- Soap films and oil layers behave just like glass — they have interfaces with air and/or water
- The film thickness acts like the glass thickness in our calculations
- Different colors (photons with different rotation rates) will have different constructive/<abbr title="相消干涉：波叠加互相抵消">destructive <span class="qtip" data-cn="干涉：多个波的叠加效应">interference</span></abbr> conditions for the same thickness
- This is how **interference colors** arise in thin films

### Measuring Wavelength from an Angle

Since the constructive/destructive interference condition depends on:
- Film thickness
- Angle of observation
- Rotation rate (color) of the photon

One can determine the wavelength of light simply by measuring the angle at which a particular color constructively reflects.

---

## Summary

- The quantum arrow method successfully explains **partial reflection** — the photon explores all possible paths simultaneously
- Including **all multiple-reflection paths** is essential for probability conservation
- The oscillation of reflection probability with glass thickness is a direct consequence of the arrow rotation rule
- **Soap bubbles and oil slicks** are natural demonstrations of thin-film interference, explained by the same quantum theory
- Different colors reflect or transmit preferentially depending on film thickness — each color has a different rotation rate

---

## Key Takeaways

1. **Partial reflection is explained by quantum path integrals**: A photon does not "decide" to reflect or transmit — it takes all possible paths simultaneously, and the probability amplitudes for these paths combine (via vector addition of arrows) to determine the observable probability.

2. **Multiple reflections are essential for completeness**: The initial two-path calculation gives probabilities that don't sum to 100%. Including all possible multiple-reflection paths (using geometric series) restores probability conservation — a beautiful validation of the theory.

3. **The arrow rotation rule is the key to understanding thin-film interference**: Different colors (photon rotation rates) have different constructive/destructive interference conditions for the same film thickness, producing the vivid colors of soap bubbles and oil slicks.

4. **Transmission and reflection are complementary**: When transmission is maximized, reflection is minimized, and vice versa — the total probability is always conserved. This emerges naturally from the quantum rules.

5. **The geometric series provides exact results**: The sum of all multiple-reflection paths converges to a geometric series, yielding exact probabilities that satisfy conservation laws. This is a preview of more advanced path-integral calculations.
