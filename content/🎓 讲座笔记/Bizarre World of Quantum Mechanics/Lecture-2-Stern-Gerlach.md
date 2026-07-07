---
title: "Lecture 2: The Classical Stern-Gerlach Experiment"
date: 2026-07-07
tags:
  - quantum-mechanics
  - lecture-notes
  - stern-gerlach
  - spin
---

# Lecture 2: The Classical <abbr title="斯特恩-盖拉赫实验：用非均匀磁场分离原子自旋态">Stern-Gerlach experiment</abbr>

## Introduction: Separating Current Loops by Their <abbr title="投影：矢量在某方向上的分量">projection</abbr>

We have a collection of very small objects that act like current loops. We want to **separate them according to the projection** of the effective magnetic needle (representing the current loop) onto the axis of an increasing magnetic field. This separation allows us to determine the different values the projection can take and helps us understand the properties of these particles.

### The Prism Analogy

This type of separation experiment is common in physics. The simplest example: shining white light into a **prism** and separating it into the spectrum of the rainbow.

- Separating light by **color** = separating by **energy** = separating by **<abbr title="频率：单位时间内的周期数">frequency</abbr>**
- Our experiment with current loops is <abbr title="类似的、可类比的">analogous</abbr>, but selecting by **projection of the effective needle** on the magnetic field axis

### The Experimental Setup

- The "current loops" are actually **atoms** — extremely small
- We shoot atoms **<abbr title="垂直的">perpendicular</abbr>** to the direction of increasing magnetic field
- They feel a push or pull for a fixed time near the magnet
- The **<abbr title="偏转：粒子偏离原路径">deflection</abbr>** of the path is <abbr title="成正比的">proportional</abbr> to the <abbr title="大小、量值">magnitude</abbr> and sign of the projection
- Collecting far enough away amplifies the differences (acts like a microscope)
- Final experiment: beam of atoms → magnet → screen

---

## Designing the Classical Stern-Gerlach Experiment

### The Stern-Gerlach <abbr title="实验装置">apparatus</abbr>

- **Otto Stern** (Nobel Prize 1943) and **Walter Gerlach** co-invented the experiment
- Gerlach was excluded from the Nobel because of his association with the Nazis
- **Silver atoms** are injected at a fixed <abbr title="速度">velocity</abbr> through a region with a **non-uniform magnetic field**
- Current loops **precess** in the field but keep their projection on the axis of increasing field constant
- Result: they feel a **push (up)** or **pull (down)** depending on the projection

### Patterns on the Screen

Three possible scenarios for what the screen might show:

1. **Random projection** of effective needle — a <abbr title="连续的">continuous</abbr> smear on the screen
2. **Only one value** — a single spot
3. **Only two values** — two <abbr title="分立的、离散的">discrete</abbr> spots

> (Video demonstration: `sge_exp_1-01_sg_current_loops.html`)

The quantum case: the atom always shows **two projections** with the same splitting amount, **regardless of field <abbr title="取向、方向">orientation</abbr>** — a result that cannot be reconciled with any classical picture.

> (Video demonstration: `sge_exp_1-02_sg_atoms.html`)

---

## Our Philosophy: Embracing the Quantum

Two key realizations emerge:

1. **Quantum mechanics is fundamentally different from classical physics.** Something unexpected has happened. We must incorporate this different behavior into a new model — we cannot keep forcing classical explanations.
2. **Quantum mechanics is random (<abbr title="随机的">stochastic</abbr>).** We cannot say what will happen to any particular particle; we can only calculate the **probability** of outcomes over many trials.

---

## The Stern-Gerlach <abbr title="分析器：Stern-Gerlach 型自旋测量装置">analyzer</abbr>

To study quantum behavior systematically, we package the Stern-Gerlach experiment into a compact device called a **Stern-Gerlach analyzer**.

> (Video demonstration: `sge_exp_1-03_analyzer_intro.html`)

### Repeated Measurements: Testing Reproducibility

**Setup:** Two analyzers (A and B) placed side-by-side. Atoms from A's + output enter B.

**Key Finding:** Once an atom is measured as **+z**, it **always** measures as +z again.

> (Video demonstration: `sge_exp_1-04_repeated_measurements.html`)

- Atoms with a -z measurement always measure as -z again
- The measurement **defines** the state; <abbr title="随后的">subsequent</abbr> identical measurements are fully reproducible

### Measurements and Quantum States

> **Key insight:** Measuring the direction of an atom's effective magnetic arrow *defines* that direction. We represent this knowledge using **blue and red cones** — because the needle precesses around a cone, any direction on the cone gives the same projection.

**State representation:**
- **Atoms from source:** No cone — we have no knowledge of the orientation (any direction equally likely)
- **Atoms leaving + output:** Red cone points **up** (along +z)
- **Atoms leaving - output:** Red cone points **down** (along -z)
- **Direction is relative** to the magnets inside the analyzer

> **Flipping analyzer B upside-down** reverses the roles of + and - outputs, but the deflection and cones remain unchanged. This means we must carefully track *what* we are measuring and *how*.

---

## Perpendicular Stern-Gerlach Analyzers

### The "Conundrum of Projections"

- Only **two results** are possible for any measurement, regardless of direction
- The **magnitude** of the effective arrow is always the same — completely at odds with the classical notion of a definite pre-existing direction
- **The act of measuring defines what the direction is**

### Experiment: Rotating Analyzer B by 90°

**Setup:** Analyzer A measures along **z**. Analyzer B is rotated to measure along **x**.

**Classical expectation:** Since x and z are perpendicular, the projection should be zero. But that's not what we see.

> (Video demonstration: `sge_exp_1-05_perpendicular_analyzers.html`)

**Result:** Atoms emerge from **both** outputs of B, with **~50% probability** each.

> An atom with a known state in the z-direction does *not* have a definite state in the x-direction. The measurement in a new direction destroys the previous state's definiteness.

---

## Three Perpendicular Stern-Gerlach Analyzers

> (Video demonstration: `sge_exp_1-06_three_analyzers.html`)

### "Atoms Are Stupid"

> **The Rule:** Atoms only remember the **last axis** their effective magnetic needle was measured on. They suffer from permanent memory loss.

- When measured on a particular axis, an atom has a projection on that axis
- Change the axis and measure again: the atom now has a projection on the *new* axis
- It **no longer** has any definite projection on the previous axis (with two special exceptions we'll encounter later)
- The atom can have a definite state in only **one direction at a time**

---

## Analyzers at an Angle

When the second analyzer is at an <abbr title="任意的">arbitrary</abbr> angle θ (not 0°, 90°, or 180°):

> (Video demonstration: `sge_exp_1-07_arbitrary_angles.html`)

The probability follows:

$$
P(+,\theta) = \cos^2\!\left(\frac{\theta}{2}\right)
$$

$$
P(-,\theta) = \sin^2\!\left(\frac{\theta}{2}\right)
$$

> **Three key angles to memorize:**

| Angle θ | $P(+,\theta)$ | $P(-,\theta)$ |
|:-------:|:------------:|:------------:|
| 0° | 1 | 0 |
| 90° | 1/2 | 1/2 |
| 180° | 0 | 1 |

Statistical fluctuations mean experimental points won't lie exactly on the curve — especially with only 100 measurements. Larger samples approach the theoretical curve more closely.

---

## Why We Must Use Probability

### Classical vs. Quantum Randomness

| Classical | Quantum |
|-----------|---------|
| Appears random due to unknown initial state | **Truly random** |
| In principle, path could be followed precisely | Cannot follow the path |
| <abbr title="确定性的：结果唯一确定">deterministic</abbr> underneath | Intrinsically <abbr title="概率性的：结果用概率描述">probabilistic</abbr> |

In the quantum case, we cannot detect atoms until they hit the screen, so we don't know their precise path. The overwhelming consensus: quantum results are **truly random**, and we can only predict probabilities — but we can predict those probabilities **precisely**.

---

## Accuracy of Quantum Measurements

> ⚠️ Don't confuse **randomness** with **imprecision** or **irreproducibility**.

Quantum mechanics is one of the **most accurately tested theories** in all of science:

- Energy levels can be measured to **more than 10 digits of accuracy**
- The NIST Yb lattice clock is accurate to **one part in $10^{18}$**
- This is like measuring the distance from Washington, DC to Los Angeles to within **the width of a single atom**

The most accurate quantum measurements typically involve:
- **Time** between two events
- **Frequency/color** of photons

---

## The End of Determinism

> Quantum <abbr title="现象（复数）">phenomena</abbr> have **no classical description**. Quantum events have **unavoidable randomness**.

These two facts undermine the philosophy of **determinism**. The quantum world is manifestly **not deterministic** — randomness is inherent whenever a measurement is performed.

---

## Key Takeaways

1. **The Stern-Gerlach experiment reveals quantization:** Silver atoms always produce exactly two discrete spots on the screen, corresponding to two possible projections — never a continuous distribution.

2. **Measurements define quantum states:** The very act of measuring a projection along a given axis *forces* the atom into a definite state along that axis. Repeated measurements along the same axis are fully reproducible.

3. **"Atoms are stupid":** An atom only remembers the last axis it was measured on. Measuring along a new axis destroys any definite projection along the previous axis.

4. **Quantum probability follows $\cos^2(\theta/2)$:** The probability for obtaining a positive result after rotation by angle $\theta$ is precisely $\cos^2(\theta/2)$. The three special cases (0°, 90°, 180°) give probabilities of 1, 1/2, and 0.

5. **Quantum randomness does not mean imprecision:** Quantum mechanics is the most accurately tested theory in science — quantities like energy levels and atomic clock frequencies can be measured to over 10 digits of precision.
