---
title: "Lecture 6: Wave or Particle? Duality"
date: 2026-07-07
tags:
  - quantum-mechanics
  - lecture-notes
  - wave-particle-duality
  - photon
  - quantum-rules
  - feynman-paths
---

# Lecture 6: Wave or Particle? Duality

> "A while back I bought an idiot's guide to quantum mechanics, from which I learned only that I hadn't yet reached the rank of an idiot." — Joe Bennett, *The Press*, Christchurch, July 4, 2007

## Learning Goals

- Describe the dual particle and wave nature of light and other quantum particles
- Forget all preconceived notions of what you have learned about light — most are wrong
- Describe what a <abbr title="量子粒子：遵循量子力学的微观粒子">quantum particle</abbr> is
- Argue how a quantum particle can create <abbr title="干涉：多个波的叠加效应">interference</abbr> patterns

---

## A Brief History of Light

| Era | Proponent | Model | Evidence |
|-----|-----------|-------|----------|
| 17th C | **Isaac Newton** | Light as **particles** | Sharp shadows; light does not curve around objects |
| Early 19th C | **Thomas Young** | Light as **waves** | Two-slit experiment showed light interfering with itself — unequivocal proof Newton was wrong |
| Late 19th–Early 20th C | **Planck, Einstein** | Light as **quantum particles** | Blackbody radiation; photoelectric effect demanded a particle description |

> The particle-wave ambigram was created by Douglas Hofstadter in 2001 — a visual representation of this duality.

---

## Light Is a Quantum Particle

### The Single-<abbr title="光子：光的量子，电磁辐射的基本粒子">photon</abbr> Experiment

(Video demonstration from Anton Zeilinger's research group, University of Vienna)

When light is made dimmer and dimmer and shone onto a **single-photon <abbr title="探测器：检测粒子到达状态的装置">detector</abbr>** (CCD):

- You do **not** see a uniformly dim illumination (what a wave would produce)
- You see **bright dots** hitting only one detector at a time, randomly distributed — like raindrops falling
- **Every experiment on dim light shows this particle nature**

We call the particle of light a **photon**. But it is **not** a classical particle (like a billiard ball) — it is a **quantum particle** with complex behavior.

### Single-Slit Simulation

(Video simulation available in the course material)

When photons pass through a single wide slit:

1. At first (~200 photons), the pattern appears completely random
2. As more photons accumulate (~2000+), a structure emerges — a **particle pattern** (classical pattern) with no wave-like interference
3. Some photons appear very far from the center — a spread characteristic of <abbr title="衍射：波绕过障碍物时弯曲扩展">diffraction</abbr>, even with a <abbr title="单缝：一条狭缝的衍射实验">single slit</abbr>

> **Fundamental tenet of quantum mechanics**: We can predict the **probability** for a given event to occur, but we can **never predict precisely** what the result of a single experiment will be. Randomness is built into the fabric of nature.

---

## Feynman's Quantum Theory of Light

Richard Feynman devised a simple set of rules (the **path-integral method**) for how photons act, described in his book *QED: The Strange Theory of Light and Matter*.

> "Nothing I will tell you is incorrect, watered down, or simplified. You will be told everything about quantum mechanics the way practicing physicists view quantum mechanics."

### Two Critical Concepts

1. **An event**: Requires measurable initial and final conditions (sources and detectors)
2. **Alternative ways**: The different ways an event can occur

Developing the ability to distinguish these two concepts is critical for success.

### The Arrow Rules

Feynman's method uses **arrows** (<abbr title="振幅：波偏离平衡位置的最大值">amplitude</abbr> vectors) with rules for how they change:

| Action | Effect on Arrow |
|--------|----------------|
| **Photon travels through space** | Arrow rotates like a stopwatch hand — the rate of rotation determines the photon's color |
| **Photon reflects** | Arrow shrinks by a factor (e.g., 0.2 for glass) and rotates 6 hours (180°) |
| **Photon transmits** | Arrow shrinks by a transmission factor (e.g., 0.9798 for glass) |
| **Alternative ways to same event** | Add the arrows (vector addition), then square the length → probability |

### Key Facts About Arrow Rotation

- **Color determines rotation rate**: Blue rotates faster than green, which rotates faster than red
- The rotation rate changes continuously across the spectrum (including ultraviolet and infrared)
- In **glass**, the photon moves more slowly, so it takes more time → the arrow rotates more
- Typical rotation rate: approximately **15,000 revolutions per cm** in air

### Example: <abbr title="部分反射：光在界面按概率部分反射">partial reflection</abbr> from a Single Surface

Consider red photons reflecting off glass:

- Arrow for reflection off the **top surface**: length $0.2$, rotated by 6 hours
- Arrow for reflection off the **bottom surface**: length $0.2 \times 0.9798 \times 0.9798 = 0.192$ (transmits through top, reflects off bottom, transmits back out)

**Maximum** (arrows aligned):

$$
\text{probability} = (0.2 + 0.192)^2 = (0.392)^2 = 0.1537 = 15.37\%
$$

**Minimum** (arrows opposite):

$$
\text{probability} = (0.2 - 0.192)^2 = (0.008)^2 = 0.000064 = 0.0064\%
$$

> As glass thickness changes, the relative rotation changes → the probability of reflection **oscillates** between 0% and ~16%.

---

## The Puzzle of Partial Reflection

One problem with Newton's particle theory: **how does a particle "know" whether to reflect or transmit?**

- During the day, we see **through** windows (transmission dominates)
- At night, we see our **reflection** (reflection becomes visible when transmission light is dim)
- Partial reflection is **always present** — it's just hard to see when overwhelmed by transmitted light

### Practical Questions from the Lecture

1. **What is a source of red photons?** Laser pointers — an excellent source of <abbr title="单色的：单一波长的光">monochromatic</abbr> (single-color) light. Attenuated to one photon at a time.

2. **What is a photon detector?** CCD devices (in digital cameras and smartphones) — triggered by single photons. Before CCDs: photomultiplier tubes that amplify a single photon into billions of electrons.

3. **Why does the arrow turn like a stopwatch?** This is the quantum rule: a photon's color is determined by how fast the arrow rotates per unit distance traveled.

4. **Why does the arrow rotate more in glass?** Light travels slower in glass, so the photon takes more time to cover the same distance → more rotation.

---

## Summary & Deep Questions

- Light always arrives in **<abbr title="分立的、离散的">discrete</abbr> bundles of the same size** — called photons
- These photons are **quantum particles**, not classical particles — they follow <abbr title="奇异的、怪诞的">bizarre</abbr> quantum rules
- The arrow method provides a computational framework for predicting quantum behavior, even without advanced mathematics

### Questions to Ponder

1. How do particles interfere with each other to act like waves? Can interference disappear if light is dimmed to one photon at a time?
2. Can a single photon "interfere with itself"? What does that even mean?
3. If light acts like raindrops hitting a surface, why don't we feel them on our skin?
4. If light is a particle, what does it mean to say it has a <abbr title="波长：相邻波峰间的距离">wavelength</abbr>?

### Historical Note

The modern theory of light started with Planck (blackbody radiation), but the truly bizarre quantum nature was solved by:
- **Einstein** (photoelectric effect)
- **Bose and Einstein** (Bose-Einstein condensation → ultimately led to the laser)

---

## Key Takeaways

1. **Light is fundamentally a quantum particle (photon)**: Dim light experiments show discrete detection events, not <abbr title="连续的">continuous</abbr> dimming. Photons arrive one at a time, like raindrops — but they are not classical particles.

2. **<abbr title="波粒二象性：量子物体兼具波和粒子性质">wave-particle duality</abbr> is real but subtle**: Newton (particles), Young (waves), and modern quantum theory all captured partial truths. The photon is neither a classical particle nor a classical wave — it is a quantum object that exhibits both behaviors depending on the experiment.

3. **Feynman's arrow method provides an accessible framework**: Photon events are described by "arrows" (probability amplitudes) that rotate, shrink on reflection/transmission, and add vectorially. The probability is the squared length of the final arrow.

4. **Color is rotation rate**: A photon's color is determined by how fast its <abbr title="概率幅：复数，模方等于概率">probability amplitude</abbr> arrow rotates as it travels — a deeper, more physical definition than wavelength alone.

5. **Randomness is fundamental, not a limitation of measurement**: We can calculate probabilities precisely, but never the outcome of a single quantum event. This is a profound departure from classical determinism.
