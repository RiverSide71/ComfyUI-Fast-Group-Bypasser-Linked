# Fast Groups Bypasser - Linked & Alternate Extension

This single JavaScript file adds three new linking behaviors to
rgthree's **Fast Groups Bypasser** and **Fast Groups Muter** nodes,
without modifying any existing files and without requiring a build step.

---

## Installation

1. Drop `fast_groups_bypasser_linked.js` into:

```
   ComfyUI/custom_nodes/rgthree-comfy/web/comfyui/
```
2. Restart ComfyUI completely (no browser-cache clear needed, but doesn't hurt).

That's it! - the extension auto-loads alongside the existing rgthree nodes.

---

## New Properties

After installation, right-click any **Fast Groups Bypasser** or
**Fast Groups Muter** node and open **"Properties"** (or "Properties Panel").
You will find three new fields:

| Property | Behavior |
|---|---|
| `groupLinks` | When Group A is toggled, Group B mirrors the **same** state. Multiple groups can be linked|
| `groupAlternates` | When Group A is toggled ON, Group B is forced OFF, and vice-versa. Multiple groups can be alternates of the other. Groups alternate in the sequence they are entered. |
| `groupExclusive` | When Group A is toggled ON, Group B is forced OFF, and vice-versa. Both may be OFF at the same time, but never both ON. Multiple groups can be in a group exclusive relationship.|

### Syntax

All three fields use the same format:

```
GroupName:OtherGroupName, ThirdGroup:FourthGroup, Stage1:Stage2:Stage3:Stage4
```
- Pairs and Lists are separated by **commas**.
- The group names in the link are separated by a **colon** (`:`).
- **Capitalization and spaces must match** your actual group titles exactly.
- All three, `groupLinks`, `groupAlternates` and `groupExclusive` are **bidirectional** - you only
  need to list each pair once (A:B automatically covers B:A as well).

---

## Feature 1 - Linked Groups

> *"When one group is bypassed/enabled, the other(s) is(are) also bypassed/enabled."*

### Example

You have two groups that have Load Image and Image Resize nodes in them. You always want to use them together and when not using them, you want them to share the same bypass state:

```
groupLinks = "Load Image:Image Resize"
```

Now if you click the **Load Image** group toggle to bypass it, **Image Resize** group is automatically bypassed too. Click **Load Image** to enable it, and **Image Resize** enables as well.

### Multiple linked pairs example

```
groupLinks = "Base Model:Refiner, Upscale:Hires Fix"
```

### Several linked groups example

```
groupLinks = "Group A:Group B:Group C:Group D, Group E:Group F:Group G"
```

---

## Feature 2 - Alternate Groups

> *"When one group is bypassed, the other(s) is(are) enabled, and vice-versa."*

This is the "XOR switch" pattern: exactly one of the two(or many) groups should be
active at any given time.

### Example

You want to toggle between **Load Checkpoint** and **GGUF Loader** - only one
should ever be active:

```
groupAlternates = "Load Checkpoint:GGUF Loader"
```

Clicking **Load Checkpoint** ON automatically bypasses **GGUF Loader** (and
vice-versa).

### Multiple alternate pairs example

```
groupAlternates = "Load Video:Load Image, Save Video:Save Image"
```

### Several alternate groups example

```
groupAlternates = "Load Video:Load Image:Load Webcam"
```
Enabling any member disables all others in the set. Disabling the active member enables the NEXT member in the defined order (circularly), so at least one is always ON.

## Feature 3 - Exclusive Groups

> *"Both(or all) groups cannot be turned on at the same time. Either one group is enabled, or both(all) are disabled."*

This is the "NAND switch" pattern: while both(or all) groups are in a groupAlternates link. Both(or all) can sit in the OFF state simultaneously. This is the precise distinction from groupAlternates, which always forces the inverse regardless of direction.

### Example

You want to toggle between **LoRa Pack A** and **LoRa Pack B** - only one should ever be active, however, both can be turned off for you to try generating without any LoRa.

```
groupExclusive = "LoRa Pack A:LoRa Pack B"
```

Clicking **LoRa Pack A** ON turns **LoRa Pack B** OFF and vice versa. It is also possible to turn **LoRa Pack A** OFF, keeping **LoRa Pack B** OFF as well.

### Multiple exclusive pairs example

```
groupExclusive = "LRA Pack A:LoRa Pack B, Style A:Style B"
```

### Several exclusive groups example

```
groupExclusive = "Style X:Style Y:Style Z", "LoRa Pack A:LoRa Pack B:LoRa Pack C"
```

---

##  Relationship Semantics Summary

 * ┌─────────────┬─────────────────────────────┬────────────────────────────┐
 * │             │       Source turns ON       │      Source turns OFF      │
 * ├─────────────┼─────────────────────────────┼────────────────────────────┤
 * │ LINKED      │ All others → ON             │ All others → OFF           │
 * │ ALTERNATE   │ All others → OFF            │ Circular-next member → ON  │
 * │ EXCLUSIVE   │ All others → OFF            │ (no change to others)      │
 * └─────────────┴─────────────────────────────┴────────────────────────────┘

## Combining Properties

You can use `groupLinks` and `groupAlternates` on the **same node** at the
same time, as long as a group name only appears in one of the two maps
(putting the same pair in both would create contradictory instructions).

---

## Compatibility Notes

| Updating rgthree-comfy | ✅ Safe | This file is separate; rgthree updates won't touch it.|

| Nodes 2.0 (ComfyUI beta) | ⚠️ May break | rgthree itself has known issues with Nodes 2.0; disable it in ComfyUI settings if things look wrong. |

## General Notes

> *All three relationship types are per-node: two separate Bypasser nodes do not share state.
> *Works on BOTH "Fast Groups Bypasser (rgthree)" and  "Fast Groups Muter (rgthree)".
---

## Troubleshooting

**The property fields don't appear in the Properties panel.**
: Restart ComfyUI. The extension must load before the graph shows.

**A link/alternate isn't working.**
: Open the browser console (F12 → Console). If a group name is misspelt or
  doesn't exist, a warning like
  
  `[rgthree-linked] Could not find linked group "My Group"` is logged.
  
  Check that the name in the property **exactly** matches the group title
  shown in the Bypasser widget (including capitalization and spaces).

**Both groups end up in the same state when they should alternate.**
: Make sure the pair is in `groupAlternates`, not `groupLinks`.

---