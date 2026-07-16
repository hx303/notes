---
title: "Lecture 3: Quantum Particles"
date: 2026-07-07
tags:
  - quantum-mechanics
  - lecture-notes
  - stern-gerlach
  - quantum-particles
  - analyzer-loop
---

# Lecture 3: Quantum Particles

> "We do not know how to predict what would happen in a given circumstance, and we believe now that it is impossible — that the only thing that can be predicted is the probability of different events."
>
> — **Richard P. Feynman**, 1965 Nobel Laureate

---

## Learning Goals

- Understand that quantum particles **only remember the last thing** that was measured about them
- Be able to predict the results of **repeated measurements** on quantum particles
- Analyze experiments with **<span class="qtip" data-cn="分析器：Stern-Gerlach 型自旋测量装置">analyzer</span> loops** (quantum erasers)
- Understand how quantum measurements can be **erased**

> **Prerequisites:** Understanding how Stern-Gerlach analyzers work, especially in multiple-measurement configurations.

---

## What We've Learned So Far

1. **Quantum mechanics is <span class="qtip" data-cn="随机的">stochastic</span>.** We cannot determine precisely what will happen — only the probability of different events.
2. These results are **real** and hold for all quantum systems.
3. Quantum mechanics allows **extreme precision** in certain measurements (light color, clock ticking) — verified more accurately than any other theory in science.
4. Amidst uncertainty, there is **remarkable certainty** in other quantities.

---

## "Atoms Are Stupid" — And What Comes Next

The atom is **schizophrenic** — it has more than one identity. The core theme: the atom only remembers **the last axis** it had its <span class="qtip" data-cn="投影：矢量在某方向上的分量">projection</span> measured on.

### Preview of This Module

- **Analyzer loops** — extending the SG experiment to explore quantum <span class="qtip" data-cn="干涉：多个波的叠加效应">interference</span>
- **Two-slit analog** — introducing the quantum mystery via Stern-Gerlach devices
- **John Wheeler's delayed-choice experiment** — deciding about interference *after* the particle has passed
- **Einstein-Podolsky-Rosen (EPR)** — "spooky action at a distance"
- **Bell inequalities** — proving <span class="qtip" data-cn="隐变量：试图用经典确定性解释量子力学">hidden variable</span> theories incorrect
- **Real-world applications** — NMR (nuclear magnetic resonance) and MRI

---

## The Stern-Gerlach <span class="qtip" data-cn="分析器回路：多次 SG 分析组成的闭合路径">analyzer loop</span>

### What Is It?

A new <span class="qtip" data-cn="实验装置">apparatus</span> that **erases the measurement** made by a Stern-Gerlach analyzer. It consists of two parts:

1. **Front end:** Conventional Stern-Gerlach analyzer — separates atoms into two paths
2. **Back end (quantum eraser):** Undoes what the analyzer did — brings the two paths back together in such a way that **we cannot tell which path** the atom traveled

> **Key property:** Because the two branches are constructed to be **absolutely identical**, there is no way to determine which path an atom took. The analyzer loop appears to **do nothing** — an atom enters with an unknown state and emerges with that same unknown state.

> (Video demonstration: `sge_exp_1-08_al_intro.html`)

### Why "Doing Nothing" Is Profound

- The analyzer *creates* a correlation between the atom's state and its position
- The eraser **destroys** that correlation
- The measurement of the projection is **erased**, and the atom proceeds as if the analyzer loop wasn't there

---

## Gates and Controlled Measurements

We can add **gates** on each branch to control which path atoms can take. This gives four configurations:

### Gate Configurations

| + Branch Gate | − Branch Gate | Result |
|:------------:|:------------:|--------|
| Open | Closed | Acts like a **regular analyzer** (100% to D1) |
| Closed | Open | Acts like an **upside-down analyzer** (100% to D2) |
| Closed | Closed | **All atoms blocked** — no detection |
| Open | Open | Analyzer loop appears to **do nothing** (~50% each) |

When **both branches are open**, the atoms emerge as if they were never measured at all — the analyzer loop is completely transparent. This is because we have **no which-path information**.

---

## Known-State Atom Source

To simplify further experiments, we construct a source that always emits atoms in a **known state**.

### How It Works

Chain together:
1. A random-source atom gun
2. A Stern-Gerlach analyzer
3. A half-open gate (blocking one output)

The source is marked with an **arrow** pointing in the direction corresponding to the + state. Atoms from this source always measure as + when passed through an analyzer oriented in the same direction.

> If the source is flipped upside-down, all atoms emerge in the − state instead.

---

## Experiments with Analyzer Loops and Known States

### Setup: Analyzer Loop at 90° to Source

1. **Source:** Atoms in known **+z** state
2. **Analyzer loop:** Oriented along **x** (rotated 90° from z)
3. **Final analyzer (B):** Oriented along **z**

### With One Branch Blocked

When only the **+x branch** is open (gate on −x closed):

- All atoms reaching analyzer B **must** have passed through the +x branch
- The analyzer loop acts like a **regular analyzer at 90°**
- Results: **~50% D1, ~50% D2** — exactly as if we had a single <span class="qtip" data-cn="垂直的">perpendicular</span> analyzer

When only the **−x branch** is open (gate on +x closed):
- Same results — 50/50 split

> (Video demonstration: `sge_exp_1-09_al_known_states.html`)

### With Both Branches Open — The Surprise

When **both gates are open**, something dramatically different happens:

- **100% of atoms go to D1, 0% to D2**

This cannot be explained by classical probability reasoning. The classical expectation (adding probabilities from each branch) would predict 50/50. This discrepancy is the topic of Lecture 4 — the **two-slit analog**.

---

## Key Takeaways

1. **Quantum particles are "dumb":** They only remember the last measurement — the most recent axis their projection was measured on.

2. **The Stern-Gerlach analyzer loop erases measurements:** By bringing two paths together in an indistinguishable way, the which-path information is destroyed and the atom's state reverts to what it was before the analyzer.

3. **What the atom "knows" depends on whether we can know its path:** When both branches are open and indistinguishable, the analyzer loop is completely transparent. When gates force one path, it behaves like a regular analyzer.

4. **Classical probability breaks down:** The analyzer loop with both branches open (and a known-state source) produces results that cannot be predicted by adding probabilities classically — foreshadowing quantum interference.

5. **Quantum mechanics bridges randomness and precision:** While individual events are random, quantum theory enables extraordinary predictive accuracy for measurable quantities (energy levels, frequencies, times).
