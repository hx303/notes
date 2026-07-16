---
title: "Lecture 9: The Double Slit Experiment"
date: 2026-07-07
tags: [quantum-mechanics, lecture-notes, double-slit, quantum-mystery, complementarity, feynman]
---

# Lecture 9: The <span class="qtip" data-cn="双缝：两条平行狭缝的干涉实验">double slit</span> Experiment

> *"We choose to examine a <span class="qtip" data-cn="现象">phenomenon</span> which is impossible, absolutely impossible to explain in any classical way, and which has in it the heart of quantum mechanics. In reality, it contains the only mystery... Any other situation in quantum mechanics, it turns out, can always be explained by saying, 'You remember the case of the experiment with the two holes? It's the same thing.'"*
>
> — **Richard Feynman**, *The Character of Physical Law* (1965)

## Learning Goals

- Articulate the <span class="qtip" data-cn="奇异的、怪诞的">bizarre</span> results of the two-slit experiment and calculate them using quantum rules.
- **<span class="qtip" data-cn="先决条件、必备知识">prerequisite</span>:** You must be familiar with quantum rules for light, <span class="qtip" data-cn="部分反射：光在界面按概率部分反射">partial reflection</span>, and single-slit <span class="qtip" data-cn="衍射：波绕过障碍物时弯曲扩展">diffraction</span>.
- **After this lesson,** you will be able to:
  - Explain what the **quantum mystery** is.
- **Stretch goal:** Generalize these techniques to more complicated situations.

---

## Demonstration: <span class="qtip" data-cn="单缝：一条狭缝的衍射实验">single slit</span> vs. Double Slit

### Single Slit
- A central broad region with additional, dimmer diffraction fringes on the wings.
- Origin of this behavior was covered in the previous lecture.

### Double Slit
- The same single-slit fringes are present, but with **additional bright fringes** within each diffraction band.
- The double-slit image is **four times brighter** than the single-slit image.

With **single-<span class="qtip" data-cn="光子：光的量子，电磁辐射的基本粒子">photon</span>-sensitive detectors**, the initially random distribution of individual photon hits gradually builds up into the <span class="qtip" data-cn="干涉：多个波的叠加效应">interference</span> fringe pattern. Each photon arrives one at a time — yet collectively, they trace out a wave interference pattern.

(Video demonstrations — MIT "Double Trouble" and University of Leiden "Photons Can Do That?")

---

## The Quantum Mystery: Part 1

When the light intensity is dimmed so that **only one photon is in the <span class="qtip" data-cn="实验装置">apparatus</span> at any given time**:

- Individual photons hit the screen at seemingly random positions.
- Over time, these individual hits **build up** to show the interference fringes that are characteristic of a wave pattern.

### The Baffling Questions

- Wave interference patterns normally arise when **two sources of waves** interfere constructively and destructively.
- If there is **only one photon** in the apparatus at a time, how does the photon interfere with **itself**?
- Does the photon go through one slit or the other? Or does it split and go through both?
- Can a particle interfere with itself?

---

## The Quantum Mystery: Part 2 — Watching the Photon

To find out what the photon is doing, we add detectors near the slits:

- **<span class="qtip" data-cn="探测器：检测粒子到达状态的装置">detector</span> A** at the top slit
- **Detector B** at the bottom slit
- **Detector D** on the screen (as before)

### The Original Experiment (No Watching)

- **One event:** Photon leaves the source → detected on the screen.
- **Two alternative ways:** Through the top slit or through the bottom slit.
- Two arrows are added → they can align (constructive) or cancel (destructive).
- Square the final arrow → probability ranges from **0 to 4%** (4× the single-slit maximum).

### The Watched Experiment

- **Two events:**
  1. Photon → Detector A + Detector D
  2. Photon → Detector B + Detector D
- Each event has **only one way** it can occur → one arrow each.
- Each arrow squared gives a constant probability. Add them → **2%** everywhere.
- **The interference fringes disappear!**

### What Actually Happens

- The photon **always** goes through either the top slit or the bottom slit.
- It **never** breaks into two and goes through both slits simultaneously.
- All three detectors **never** go off at the same time.
- But the interference pattern is **gone** — replaced by a simple particle pattern (the sum of two single-slit particle patterns).

> **The act of observing the experiment changed its results.**

---

## Why This Feels Unfair

Nature does not reveal her secrets:

- A particle acts like a wave (produces interference fringes) when **unwatched**.
- When we try to observe *how* it does this, it becomes a simple **classical particle**.

> Follow the quantum rules and you will never have a problem — just be sure to carefully determine each event and the alternative ways it can occur.

### The Heisenberg Uncertainty Principle Explanation (Niels Bohr)

If we want to localize the photon's position well enough to determine which slit it passed through:

1. We must hit it with a probe particle whose **quantum <span class="qtip" data-cn="波长：相邻波峰间的距离">wavelength</span>** is small enough to resolve the slit separation.
2. A small-wavelength particle has **large energy and momentum**.
3. When it scatters off the photon, the photon receives a huge "kick" — it is **greatly disturbed**.
4. This disturbance **destroys** the quantum interference.

> **Analogy:** Trying to track a ping-pong ball by shooting BB pellets at it — each BB strike violently changes the ball's <span class="qtip" data-cn="轨迹">trajectory</span>.

---

## Imperfect Detectors: A <span class="qtip" data-cn="连续的">continuous</span> Transition

What if we use a detector with **less than perfect efficiency** (e.g., 36%)?

- Detected photons → act like particles (constant probability curve).
- Undetected photons → act like waves (oscillating probability curve).
- The efficiency determines how we **weight** each piece.
- The pattern **continuously transitions** from full oscillation (0–4%) to flat (2%).

> This demonstrates that quantum behavior is not "all or nothing" — it exists on a **continuum** controlled by measurement strength.

---

## The Principle of <span class="qtip" data-cn="互补性：波粒二象性的本质">complementarity</span>

> **Niels Bohr (1927):** Whenever we can tell which slit the particle goes through, the quantum interference disappears and we see the particle pattern.

Key facts:

- **Every experiment** that has tried to determine how a <span class="qtip" data-cn="量子粒子：遵循量子力学的微观粒子">quantum particle</span> "interferes with itself" has **failed**.
- No experiment has ever **violated** this principle.
- Related ideas: **quantum eraser** and **delayed choice** experiments explore the boundaries of this principle.

---

## Can We Truly Understand Quantum Mechanics?

### The Pragmatic View

We have a **set of quantum rules** that work perfectly:

1. Identify the event(s).
2. Find the different alternative ways each event can occur.
3. Assign an arrow (<abbr title="概率幅：复数，模方等于概率">probability <span class="qtip" data-cn="振幅：波偏离平衡位置的最大值">amplitude</span></abbr>) to each way.
4. Sum the arrows to get the final arrow.
5. Square the final arrow to get the probability.
6. Add probabilities from all events to get the total probability.

Every experiment yields to these rules with perfect accuracy.

### The Philosophical View

- We cannot predict what will happen to **one particular photon** — only the statistical distribution of many.
- Quantum mechanics inherently contains an element of **randomness**.
- Einstein's objection: *"God does not play dice with the universe."*

> As Feynman said: *"I think I can safely say that nobody understands quantum mechanics."*
>
> He meant: no one truly understands *how* a single particle manages to "interfere with itself." But we can predict what it does with extraordinary precision.

**The takeaway:** Treat quantum mechanics as a **cookbook of rules** that quantum particles follow. The predictive power is what matters for science — understanding the *origin* of the rules is a deeper problem we haven't solved.

---

## Beyond Two Slits: Three Times the Charm

Adding a **third slit** reinforces the same lessons:

- The quantum interference effects are surprisingly **robust** — they occur in nearly every situation where we allow them.
- They are also **fragile** — it's easy to destroy them by adding a detector.

With three narrow slits (each giving 0.05 arrow size):
- Unwatched: maximum probability = **2.25%** (9× a single slit, since $3^2 \times 0.05^2 = 0.0225$)
- Shape of the pattern is the same as the two-slit case but with more complex interference structure.

---

## Summary

- The **two-slit experiment** is the preeminent example of quantum mechanics. It contains deep mysteries we may never fully unravel.
- We *can* create abstract theories that predict quantum behavior with great accuracy.
- You now possess the knowledge of **what quantum mechanics is** and **how to describe its behavior**.
- Future topics building on this: quantum teleportation, quantum computing, quantum encryption, quantum <span class="qtip" data-cn="纠缠：多粒子量子态的不可分割关联">entanglement</span>.
- Next module: quantum Zeno effect, <span class="qtip" data-cn="无相互作用测量：不接触物体也能探测其存在">interaction-free measurement</span>, and the Hong-Ou-Mandel effect.

---

## Key Takeaways

1. **Single particles produce interference patterns:** When photons pass through a double slit one at a time, they still build up an interference pattern — each photon somehow "interferes with itself."

2. **Observation destroys interference:** Placing detectors at the slits to determine which path the photon takes causes the interference pattern to <span class="qtip" data-cn="坍缩：量子态从叠加态变为确定态">collapse</span> into a simple particle pattern. The act of measurement changes the outcome.

3. **The quantum rules work perfectly:** Identify events, enumerate alternatives, assign arrows, sum, and square. This procedure predicts every experimental result with perfect accuracy, even if the underlying reality remains mysterious.

4. **Complementarity is universal:** No experiment has ever succeeded in simultaneously revealing *both* the particle's path and its wave interference. This is not a technological limitation but a fundamental principle.

5. **Imperfect measurement yields a continuum:** Quantum behavior transitions continuously from wave-like to particle-like depending on measurement strength — it is not a binary, all-or-nothing phenomenon.

> **Historical note:** While the original two-slit experiment with light dates to Thomas Young (early 1800s), it was Richard Feynman who popularized it as a teaching tool for quantum mechanics in the 1960s and beyond.
