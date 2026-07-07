---
title: "Lecture 5: Complementarity"
date: 2026-07-07
tags:
  - quantum-mechanics
  - lecture-notes
  - complementarity
  - which-way-information
  - wheeler-delayed-choice
---

# Lecture 5: <abbr title="互补性：波粒二象性的本质">complementarity</abbr>

> "The student suddenly says to himself, 'I understand quantum mechanics,' or rather he says, 'I understand now that there isn't anything to be understood.'" — Freeman Dyson, *Innovation in Physics*, Scientific American (1958)

## Learning Goals

- Review the two-slit experiment with <abbr title="分析器：Stern-Gerlach 型自旋测量装置">analyzer</abbr>-loops (watched and unwatched)
- Identify how one can **erase <abbr title="路径信息：粒子走哪条路径的知识">which-way information</abbr>** and restore <abbr title="干涉：多个波的叠加效应">interference</abbr>
- Describe how complementarity can be partially destroyed or reinstated

---

## Complementarity and Which-Way Information

### Bohr's Complementarity Principle

Niels Bohr developed the theory of **complementarity**, which states:

- If one designs an experiment that tests for **either** the particle **or** the wave properties of a quantum object, one **cannot** simultaneously measure the other (complementary) property.

A more modern formulation focuses on **which-way information**:

- If a quantum device has two paths that are **indistinguishable** from each other:
  - If we **know which way** the particle went → it adopts the properties associated with that path
  - If we **do not know** which way → the particle retains whatever properties it had prior to entering the device

This behavior is exactly what we exploit in the Stern-Gerlach <abbr title="分析器回路：多次 SG 分析组成的闭合路径">analyzer loop</abbr>.

### Gentle Measurement and <abbr title="叠加：同时处于多个态的量子性质">superposition</abbr>

- Historically, it was thought that "watching" a particle inevitably disturbed it enough to change the experiment.
- **Modern experiments** have found ways to determine "which way" much more gently — so gently that the particle cannot be disturbed in the old classical sense, yet the quantum behavior still changes.
- This shows that **knowing which-way information is the truly fundamental principle**, not physical disturbance.

> **Superposition of quantum states**: A particle can traverse two indistinguishable paths at the same time — not as a "half particle" splitting and rejoining, but as a whole particle simultaneously experiencing both paths, with a 50% chance to be found on each if we dared to look.

- There is no classical analog to this behavior, and the lack of a simple visualization is one reason students find quantum mechanics frustrating.

---

## Wheeler's Delayed Choice Experiment

### The Central Question

John Wheeler (Feynman's Ph.D. adviser) asked:

> **When does a <abbr title="量子粒子：遵循量子力学的微观粒子">quantum particle</abbr> realize it is being watched?**

Can we set up an experiment and **decide after the atom passes through the two paths** whether or not we want to watch? The answer is **yes**.

This raises a deep philosophical question: does the choice get communicated to the quantum particle **backward in time**? The verdict is still out.

### The Conspiracy Theory

A **classical explanation** (the "conspiracy theory") proposes:

- The atom knows the arrangement of the <abbr title="实验装置">apparatus</abbr> **in advance**
- If the final analyzer is vertical → the atom takes both paths
- If the final analyzer is horizontal → the atom chooses one path, even if unwatched

**Quantum mechanics** predicts instead: an unwatched atom simply goes through both branches regardless of how we set up the experiment.

### Four Scenarios of the Analyzer Loop

| Scenario | Trailing Analyzer | Detection | Result |
|----------|:-----------------:|:---------:|--------|
| Unwatched (V) | Vertical | All atoms → D1 | Atom preserves original $\lvert+z\rangle$ state |
| Watched (V) | Vertical | 50% → D1, 50% → D2 | Watching changes state to $\lvert+x\rangle$ or $\lvert-x\rangle$ |
| Unwatched (H) | Horizontal | 50% → D1, 50% → D2 | Atom unchanged, randomly measured in x-basis |
| Watched (H) | Horizontal | 50% → D1, 50% → D2 | No difference from watched case — tempting but misleading |

> **Key insight**: The horizontal-analyzer results alone could be explained classically (atom has definite state at all times). We need the <abbr title="垂直的">perpendicular</abbr>-analyzer results to reveal quantum behavior.

### The Delayed Choice Test

1. Start with a **horizontal** trailing analyzer
2. Atom passes through the analyzer loop (unwatched)
3. After atom exits the loop, **quickly rotate** the trailing analyzer to **vertical**

**Predictions:**

| Theory | Prediction |
|--------|-----------|
| Conspiracy | Atom chose a definite $\lvert\pm x\rangle$ state → 50% each at D1, D2 |
| Quantum Mechanics | Atom preserved $\lvert+z\rangle$ state → 100% at D1, 0% at D2 |

**Experimental result**: Every time this kind of experiment is performed, **quantum mechanics is verified to be correct**. There is no evidence for such conspiracies.

---

## Partial Destruction of Complementarity

### Classical vs. Quantum Predictions

For classical-like explanations, one can fit a classical equation to quantum observations:

$$
P(+x) = \frac{1}{2}(1 + \cot\theta)
$$

Since $P(+x) \leq 1$ (it is a probability), this requires $\theta \geq 45^\circ$. This classical constraint **does not hold** in quantum mechanics, showing we can rule out classical hidden-variable descriptions.

### Tagging Atoms

**Tagging** atoms provides a concrete way to mark which-way information:

- **Exciter**: Shine light of the right energy to excite an atom from its ground state to a higher-energy state
- **De-exciter**: Shine light on an already-excited atom to coax it to emit a <abbr title="光子：光的量子，电磁辐射的基本粒子">photon</abbr> and return to the ground state

- An excited atom is **distinguishable** from a ground-state atom — they are no longer alike
- This means we have **which-way information**, destroying interference
- If the tag is later **removed** (the which-way information is erased), interference can be **restored**

> (Video demonstration of this with light, using <abbr title="偏振：光波振动方向的空间取向">polarization</abbr> as the tag, will be shown later in the course.)

---

## Key Takeaways

1. **Complementarity is fundamentally about which-way information**: If we know which path a quantum particle took, it behaves like a particle; if we don't, it can exhibit wave-like superposition. Physical disturbance is not the root cause — information is.

2. **Superposition has no classical analog**: A quantum particle can simultaneously traverse two indistinguishable paths as a whole particle, not as a split entity. This defies classical intuition.

3. **Delayed choice experiments rule out classical conspiracy theories**: The choice of measurement can be made after the particle has passed through the interaction region, and quantum mechanics still correctly predicts the outcome — the particle does not "know in advance" which experiment will be performed.

4. **Which-way information can be erased**: Tagging atoms (making them distinguishable) destroys interference, but removing the tag can restore quantum behavior. This is the principle behind **quantum eraser** experiments.

5. **The <abbr title="概率性的：结果用概率描述">probabilistic</abbr> nature is fundamental**: We can predict probabilities of events, but never the precise outcome of a single quantum experiment.
