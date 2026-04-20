# Fast Groups Bypasser - Linked & Alternate Extension

This single JavaScript file adds two new linking behaviors to
rgthree's **Fast Groups Bypasser** and **Fast Groups Muter** nodes,
without modifying any existing files and without requiring a build step.

---

## Installation

1. Drop `fast_groups_bypasser_linked.js` into:

```
   ComfyUI/custom_nodes/rgthree-comfy/web/comfyui/
```
2. Restart ComfyUI completely (no browser-cache clear needed, but doesn't hurt).

That's it - the extension auto-loads alongside the existing rgthree nodes.

---

## New Properties

After installation, right-click any **Fast Groups Bypasser** or
**Fast Groups Muter** node and open **"Properties"** (or "Properties Panel").
You will find two new fields:

| Property | Behavior |
|---|---|
| `groupLinks` | When Group A is toggled, Group B mirrors the **same** state. |
| `groupAlternates` | When Group A is toggled ON, Group B is forced OFF, and vice-versa. |

### Syntax

Both fields use the same format:
```
GroupName:OtherGroupName, ThirdGroup:FourthGroup
```
- Pairs are separated by **commas**.
- The two group names in a pair are separated by a **colon** (`:`).
- **Capitalization and spaces must match** your actual group titles exactly.
- Both `groupLinks` and `groupAlternates` are **bidirectional** - you only
  need to list each pair once (A:B automatically covers B:A as well).

---

## Feature 1 - Linked Groups

> *"When one group is bypassed/enabled, the other is also bypassed/enabled."*

### Example

You have two groups that represent different SDXL and SD 1.5 pipelines and
you always want them to share the same bypass state:

```
groupLinks = "SD 1.5:SDXL"
```

Now if you click the **SD 1.5** toggle to bypass it, **SDXL** is
automatically bypassed too. Click **SDXL** to enable it and **SD 1.5**
enables as well.

### Multiple linked pairs

```
groupLinks = "Base Model:Refiner, Upscale:Hires Fix"
```

---

## Feature 2 - Alternate Groups

> *"When one group is bypassed, the other is enabled, and vice-versa."*

This is the "XOR switch" pattern: exactly one of the two groups should be
active at any given time.

### Example

You want to toggle between **Load Video** and **Load Image** - only one
should ever be active:

```
groupAlternates = "Load Video:Load Image"
```

Clicking **Load Video** ON automatically bypasses **Load Image** (and
vice-versa).

### Multiple alternate pairs

```
groupAlternates = "Load Video:Load Image, Save Video:Save Image"
```

---

## Combining Both Properties

You can use `groupLinks` and `groupAlternates` on the **same node** at the
same time, as long as a group name only appears in one of the two maps
(putting the same pair in both would create contradictory instructions).

---

## Compatibility Notes

| Updating rgthree-comfy | ✅ Safe | This file is separate; rgthree updates won't touch it. |
| Nodes 2.0 (ComfyUI beta) | ⚠️ May break | rgthree itself has known issues with Nodes 2.0; disable it in ComfyUI settings if things look wrong. |

---

## Troubleshooting

**The property fields don't appear in the Properties panel.**
: Restart ComfyUI. The extension must load before the graph hydrates.

**A link/alternate isn't working.**
: Open the browser console (F12 → Console). If a group name is misspelt or
  doesn't exist, a warning like
  `[rgthree-linked] Could not find linked group "My Group"` is logged.
  Check that the name in the property **exactly** matches the group title
  shown in the Bypasser widget (including capitalisation and spaces).

**Both groups end up in the same state when they should alternate.**
: Make sure the pair is in `groupAlternates`, not `groupLinks`.

---