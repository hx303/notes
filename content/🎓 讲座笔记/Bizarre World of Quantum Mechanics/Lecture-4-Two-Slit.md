---
title: "Lecture 4: The Two-Slit Experiment (Stern-Gerlach Analog)"
date: 2026-07-07
tags:
  - quantum-mechanics
  - lecture-notes
  - two-slit-experiment
  - quantum-interference
  - complementarity
---

# Lecture 4: The Two-Slit Experiment (Stern-Gerlach Analog)

---

## Learning Goals

- Work confidently with Stern-Gerlach analyzers and **<span class="qtip" data-cn="分析器：Stern-Gerlach 型自旋测量装置">analyzer</span> loops**, understanding the critical differences between them
- Experience **quantum weirdness** first-hand — quantum <span class="qtip" data-cn="干涉：多个波的叠加效应">interference</span> in action
- Identify situations where **quantum interference** occurs and where it is destroyed (the principle of **<span class="qtip" data-cn="互补性：波粒二象性的本质">complementarity</span>**)

> **<span class="qtip" data-cn="先决条件、必备知识">prerequisite</span>:** Be clear on the difference between Stern-Gerlach analyzers (which measure) and analyzer loops (which erase measurements).

---

## The Two-Slit Analog: <span class="qtip" data-cn="分析器回路：多次 SG 分析组成的闭合路径">analyzer loop</span> with Both Branches Open

### The Setup

1. **Source:** Atoms in known **+z** state
2. **Analyzer loop:** Oriented along **x** (rotated 90° from z), **both branches open**
3. **Final analyzer (B):** Oriented along **z**
4. **Detectors:** D1 (top/+z exit) and D2 (bottom/−z exit)

### The Central Question

What happens when atoms go through a fully open analyzer loop? Does it truly leave the atom unchanged, or does the measurement inside the loop affect the outcome?

---

## Two Competing Analyses

### Analysis A: Classical Probability Reasoning

> **Step-by-step, treating each branch as a definite path:**

1. Atom leaves source in **+z** state
2. Enters analyzer A (oriented along x) — forced into **+x or −x** with probability ½ each
3. Passes through gate (both open), enters eraser with definite x-state
4. Eraser redirects atom — emerges with the **same x-state**
5. Enters analyzer B (oriented along z) — now measuring z on an atom with a known x-state
6. Since x ⟂ z, both outcomes equally likely: **50% D1, 50% D2**

> **Conclusion:** Both detectors should detect the same number of atoms.

### Analysis B: Quantum (Which-Path) Reasoning

> **Treating the analyzer loop as a black box:**

1. Atom leaves source in **+z** state
2. Enters analyzer loop — we **cannot know** what happens inside
3. Because both paths are indistinguishable, the analyzer loop **must leave the atom unchanged** (otherwise we could deduce which path it took)
4. Atom emerges from analyzer loop still in **+z** state
5. Enters analyzer B (oriented along z) — measured as +z every time
6. **100% D1, 0% D2**

> **Conclusion:** All atoms go to D1.

### The Confrontation

> **Monumental disagreement!** The two analyses predict completely different results. One must be wrong.

---

## The Experiment

> (Video demonstration: `sge_exp_1-10_al_classical_vs_quantum.html`)

**Result: Analysis B (quantum) is correct — 100% of atoms go to D1.**

### What's Wrong with Analysis A?

Analysis A was completely logical, but its fatal assumption was:

> "The atom goes through **one branch or the other**."

If the atom took the +x branch *or* the −x branch (not both), then Analysis A's conclusion would be inescapable. Since the experiment contradicts A, we must conclude:

> **The atom does NOT take the positive x path OR the negative x path. It somehow takes BOTH paths!**

As Sherlock Holmes said in *The Sign of Four* (1890):

> "When you have eliminated the impossible, whatever remains, however improbable, must be the truth."

---

## Watching the Atoms: Pass-Through Detectors

### Part 1: Watching Both Branches

To test the "both paths" idea, we place **pass-through detectors** on each branch — detectors that can sense an atom while letting it pass through.

**Question:** If the atom goes through both branches, wouldn't both detectors flash simultaneously?

**Result:** This **never happens.** Whenever we detect an atom, we always find it in **only one branch**.

And crucially, **the final result changes:** now D1 and D2 each get **~50%** of atoms — the classical probability result returns!

### Part 2: Watching a Single Branch

What if we watch only **one branch** (replace the other <span class="qtip" data-cn="探测器：检测粒子到达状态的装置">detector</span> with a straight pipe)?

**Result:** Exactly the same as watching both branches — 50/50. Why?

- If the atom is **detected** on the +x branch → it has a definite +x state → 50% D1, 50% D2
- If the atom is **not detected** → we still know it went through the −x branch → same result

> (Video demonstration: `sge_exp_1-11_watching.html`)

> **The crucial insight:** It's not that the detectors "disturb" the atom — it's that **any way of obtaining which-path information**, even in principle, destroys quantum interference.

---

## The "Can I Watch?" Summary

### The Quantum Mystery in a Nutshell

| Scenario | Which-path info? | Result |
|----------|:---:|--------|
| Both branches open, **no watching** | No | 100% D1 (interference) |
| Both branches open, **watching one or both** | Yes | 50% D1, 50% D2 (no interference) |

### What We've Learned

1. **When we DON'T know which path:** The atom somehow takes *both* paths, and the analyzer loop acts as if it doesn't exist. All atoms go to D1.

2. **When we DO know which path (by watching):** We see the atom go through one path or the other — but the final results change to 50/50.

3. **Nature is clever:** When we think we're clever enough to catch her in the act, she changes the results. Watched atoms behave differently than unwatched atoms.

### The Formal Name: Quantum Interference

This <span class="qtip" data-cn="现象">phenomenon</span> is called **quantum interference**. It is:

- **Incredibly strange**, but **100% true**
- We can **describe** how nature acts, but not **why**
- This led Feynman to his famous statement: *"No one understands quantum mechanics"* — meaning no one understands *how* nature can act this way, even though we can calculate the results with high accuracy

> **This is the quantum mystery.** Now you know what it is.

---

## The Principle of Complementarity

The analyzer loop experiment reveals a deep principle:

> **Complementarity:** Quantum interference and which-path information are mutually exclusive. You cannot have both simultaneously.

- If **which-path information is available** (even in principle) → no interference → classical probability applies
- If **which-path information is erased** → interference emerges → quantum behavior dominates

This is why the original analyzer loop (no watching) works: by "erasing" the which-path information through identical branches, it forces the atom to remain in its original state, and quantum interference is preserved.

---

## The Delayed-Choice Variation

As a preview of even deeper strangeness:

> We can set up a pass-through detector on one branch with **adjustable sensitivity** — so it only works some fraction of the time, disturbing the atoms less.

What happens? The results become a **weighted mixture** of the quantum and classical outcomes, <span class="qtip" data-cn="成正比的">proportional</span> to how often we obtain which-path information. This foreshadows the **Wheeler delayed-choice experiment**, where the decision to observe or not can be made *after* the particle has already passed through the region of interference.

---

## Key Takeaways

1. **The quantum two-slit analog produces interference:** When both paths through the analyzer loop are open and indistinguishable, all atoms emerge in their original state — the analyzer loop is completely transparent.

2. **Which-path information destroys interference:** Any measurement (even passive detection on a single branch) that reveals which path the atom took collapses the quantum behavior and restores classical probability (50/50).

3. **The atom takes "both paths" when unobserved:** Classical reasoning (Analysis A) fails because it assumes the atom goes through one definite branch. The correct quantum description requires accepting that in the absence of which-path information, the atom's path is *indeterminate* — it effectively traverses both.

4. **Complementarity:** You cannot simultaneously observe quantum interference *and* know which path the particle took. These are complementary aspects of reality.

5. **This is the quantum mystery:** Nature behaves in a way that defies classical intuition. We can calculate results with extraordinary precision, but *why* nature works this way remains deeply puzzling.
