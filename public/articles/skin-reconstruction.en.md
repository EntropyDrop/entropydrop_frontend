# From Normalized Renders to Minecraft UV Reconstruction

**Author: EntropyDrop Dev Team**

**First published: July 25, 2026**

**Updated: September 21, 2026 · Production release SKING_DDJ_v101c**

> This article has been rewritten for the current production stack. SkingToolkit [`v101`](https://github.com/EntropyDrop/SkingToolkit/tree/v101) and [`v101c`](https://github.com/EntropyDrop/SkingToolkit/tree/v101c) point to the same source snapshot, [`27aa7f8`](https://github.com/EntropyDrop/SkingToolkit/commit/27aa7f8a7d8cb3242e70f605d206caeeea2659d0). `v101c` is the deployable package of the final v101 release, not a separately trained model. The v104 system described by the previous article was a later research candidate and no longer represents production.

## Introduction

Our previous article, [From Reference Images to Minecraft Skins: Generative Model Training in Practice](/public/blog/skingen), explored direct image-to-image generation of a composite containing a UV atlas and multiple renders. That approach could learn character appearance and Minecraft style, but it often reduced emblems, text, hair, and accessories as ordinary image detail. Contours disappeared, colors mixed, and inner-versus-outer layer ownership remained unstable.

The current system uses two stages. Stage One converts an arbitrary character reference into front and back Minecraft views with fixed cameras, pose, and canvas placement. Stage Two uses SkingToolkit v101 to reconstruct a 64×64 RGBA skin from those views. The deployed model is named `SKING_DDJ_v101c`.

```text
Character reference
  → normalized front/back views
  → learned foreground segmentation
  → fixed geometry candidates and Dense UV Parser
  → head semantics, accessories, and whole-headwear consistency
  → initial UV and deterministic inner-layer completion
  → visible-material fitting and crown-top correction
  → 64×64 RGBA Minecraft skin
```

The following images illustrate intermediate artifacts from an early example. They are not a quantitative comparison between v101 and another release.

Character reference:

![Character reference|240](/articles/images/input24.png)

Normalized Minecraft front and back views:

![Normalized front and back views|480](/articles/images/img24_template41_51_52.png)

Foreground, fixed geometry, semantic routing, and UV reconstruction:

![Foreground cutout|480](/articles/images/img24_cutout.png)

![Fixed geometry candidates|480](/articles/images/img24_geo.png)

![Semantic routing|480](/articles/images/img24_routed.png)

![Observed UV|480](/articles/images/parser_only_uv.png)

![UV after inner-layer completion|480](/articles/images/parser_pred_uv_simple_inpainting.png)

## 1. Related Work and the Evolution of the Pipeline

In the public material we have been able to trace, DDJ demonstrated an early version of this two-stage idea near the end of 2025 using the Banana image model. In February 2026, he trained and released a dedicated model for improved UV extraction:

- [Workflow demonstration published November 23, 2025](https://www.bilibili.com/video/BV1NqUNBVEu5)
- [UV extraction update published February 16, 2026](https://www.bilibili.com/video/BV1muZTBkE53)
- [Open model MCSkin](https://huggingface.co/d1ngdongji/MCSkin)

In March 2026, [BLOCK: An Open-Source Bi-Stage MLLM Character-to-Skin Pipeline for Minecraft](https://arxiv.org/abs/2603.03964) studied a related pipeline more systematically.

Our work focuses on two practical problems: keeping Stage One close to a fixed projection, and turning Stage Two from color and coverage heuristics into UV reconstruction driven by geometry, image semantics, multi-view agreement, and rendering error.

## 2. Version Names: v101 and v101c

The release names refer to the following artifacts:

| Name | Meaning |
| :--- | :--- |
| SkingToolkit `v101` | Final research and release branch containing training, inference, acceptance records, and the crown geometry correction |
| `crown_geometry_20260906` | Final v101 revision; its core implementation is commit [`28f548a`](https://github.com/EntropyDrop/SkingToolkit/commit/28f548a5be37868022cfbafaddbe095895e18210) |
| `SKING_DDJ_v101c` | Self-contained package for the production workers and Hugging Face, with the same model and pipeline as the final v101 release |

The “c” identifies the packaged release variant. It pins the parser, foreground model, inference code, SigLIP2 dependency, and renderer mapping checksums, so production does not assemble a model from a changing development directory.

| File | SHA-256 |
| :--- | :--- |
| `parser.pt` | `a8aa3d8cd51cc6fec28d7c525aa1b012976d7cb1206e8b00c707de76bfb205dc` |
| `pipeline.json` | `3e14b98437eba9c5189a3344f560e7183f8daad44b9c40c55e15f7e0fda27685` |
| `foreground.pt` | `8585a698d38969e6e7562e9c7d8c5f0b5e934e8f0811cf5b8678fcf05734e732` |

The templates and Stage One prompt did not change when deployment moved to the v101c name. v101c replaces only the Stage Two reconstruction runtime.

## 3. Stage One: Turn a Reference into Measurable Views

Stage One receives one character image and several templates. The templates use different skins but share the same canvas, orthographic camera, character proportions, orientation, and slight walking pose. Multiple templates constrain geometry without encouraging the model to copy one template's appearance.

The prompt requires a two-layer Minecraft player model, the same camera and placement as the templates, a background that is easy to separate, and faithful character, clothing, and accessory details within those constraints.

In practice, literal yaw, pitch, or FOV values in text do not reliably control an image model. Matching a visual template works better. The templates therefore use:

- a square canvas with the front view on the left and back view on the right;
- orthographic projection without lighting, avoiding perspective and shading in sampled colors;
- slightly separated limbs to reduce torso and arm occlusion;
- a solid background, while tolerating small generated boundary mixtures;
- a fixed `front_left`, `back_left` ordering.

![Template 41|240](/articles/images/template41.png)
![Template 42|240](/articles/images/template42.png)
![Template 43|240](/articles/images/template43.png)

Fixed views make precomputed geometry possible. They are also a hard boundary: if Stage One changes the camera, pose, or proportions, the semantic model cannot invent the correct UV correspondence afterward.

## 4. Fixed Geometry Answers “Where Could This Pixel Come From?”

The Steve model has a head, torso, two arms, and two legs. Each part has six rectangular faces and two layers, for 72 rectangular surfaces. `differentiable_minecraft_renderer` and `mc_skin_utils` produce fixed-view mappings, which SkingToolkit uses for rendering and reconstruction.

For every image pixel, geometry enumerates possible:

- body parts and cube faces;
- inner, outer, or deeper secondary surfaces;
- coordinates in the 64×64 UV atlas;
- candidates along the same ray in depth order.

Geometry alone is insufficient. A pixel may be an inner face, glasses on the outer layer, or a deeper surface visible through a transparent hole. Taking the first ray hit can write a crown side wall into a horizontal head-top texel. Treating coverage as ownership can promote skin-colored regions into accessories.

v101 therefore separates responsibilities: the renderer restricts legal candidates, learned heads infer the role supported by image evidence, and rendering error evaluates selected structural corrections.

## 5. Learned Foreground with Separate Silhouette and Color Masks

Early versions flood-filled from the top-left background seed. That works for clean solid backgrounds, but enclosed holes, clothing close to the background color, JPEG boundaries, and thin brims expose its limits.

v101 uses a separate Minecraft foreground model. It freezes a pretrained BiRefNet backbone and trains only the decoder on renderer-generated data:

- 4,096 training identities;
- 128 validation identities;
- 128 test identities, producing 256 held-out renders;
- near-foreground colors, gradients, noise, checkerboards, JPEG artifacts, and border-touching crops;
- identity separation by normalized RGBA content hash, with no real development image used for gradients.

The accepted checkpoint reaches 0.996745 IoU on the held-out set. Deployment keeps two masks:

| Purpose | Condition | Reason |
| :--- | :--- | :--- |
| Character silhouette | foreground probability ≥ 0.50 | preserve hair tips, brims, and accessory boundaries |
| UV color source | foreground probability ≥ 0.98 and a one-pixel inset | avoid writing mixed background colors into the atlas |

The strict source mask restricts RGB sampling; it does not delete thin silhouette geometry. A boundary can remain useful shape evidence without being a trustworthy material sample.

## 6. Dense UV Parser: Geometry-Anchored, Semantics-Conditioned

### 6.1 Base Routing Network

The base Dense UV Parser uses a U-Net over RGB and view identity together with frozen SigLIP2 (`google/siglip2-base-patch16-224`) features. Global multi-view features connect the front and back observations of one character, while local patch features help distinguish glasses, hair, hats, and nearby regions.

The network predicts foreground, direct inner, direct outer, secondary surface, exact surface slot, route confidence, and fixed-geometry alignment values. Body part, face, and UV coordinates remain constrained by renderer candidates. Training combines routing classification, UV consistency, and re-rendering loss, so a wrong layer assignment receives both label and reconstruction feedback.

SigLIP2 improves semantic evidence, but “semantic” does not mean open-world understanding. The system still makes decisions within fixed views, limited categories, and procedural supervision. Rare headwear, occlusion, and messy hair can fall outside that distribution.

### 6.2 v101 Head-Specific Branches

v101 retains the original v61 trunk and adds narrowly scoped head decisions:

1. An **accessory branch** recognizes glasses, hats, and outer hair instead of relying entirely on coverage rules.
2. A **hat component branch** separates inner crown, inner band, outer crown, outer band, and brim. Procedural examples include wraparound brims, front visors, and asymmetric counterexamples.
3. **Face, hair, and headphone branches** resolve cases such as a forehead promoted into glasses or headphone color leaking into inner hair. The headphone branch may correct color within reliable existing outer geometry, but it cannot freely create new outer texels.
4. A **headwear branch** represents hat body, band, brim, and crown separately, combining frozen SigLIP features with pixel distributions to decide whether a whole object is present.

Labels come from authored objects and explicit semantic relationships, not direct color-to-class mappings. Unknown native textures are not treated as negatives. The model therefore does not learn rules such as “red means hat band” or “green means headphone.”

### 6.3 Whole-Object Consistency

Independent pixel classification can split one hat band across both layers or detect only fragments of a crown. v101 aggregates evidence across both views, then chooses one layer for the character's hat body, band, or crown. A layer change is allowed only when the cross-view evidence passes its gate.

![v101 hat-band and crown layer comparison|720](/articles/images/v101_headwear_comparison.png)

This is scoped object consistency rather than general instance segmentation. The implementation aggregates one hat body, one band, and one crown per character; multiple overlapping pieces can remain ambiguous.

## 7. From Routed Pixels to a 64×64 Atlas

### 7.1 Robust Color Sampling

Routed pixels are projected into legal UV cells. `grid_mode` counts actual 8-bit RGB values from safe sources and selects the color with the most support, using distance to the UV center only to break ties. It never averages a foreground and background boundary into a new color that was absent from the input.

Ordinary outer texels need enough source pixels, local routing evidence, and cell-level consensus. Geometry-only silhouettes can use a more permissive but still constrained rescue path. The policy is intentionally conservative: persistent false outer blocks are often more damaging than leaving an uncertain outer texel transparent.

### 7.2 Deterministic Inner-Layer Completion

Two views cannot observe every inner texel. `simple_inpainting` fills only unknown inner-layer cells:

- each body part is processed independently;
- front, back, top, and bottom faces advance in rectangular rings from their boundaries;
- side faces prefer sources on the same row;
- a missing cell first checks its same-part mirror, then nearby same-part colors in canonical 3D;
- known inner cells and the complete outer layer remain byte-preserved.

This is not a generative model, and it does not create, remove, or recolor outer texels. Mirroring is a fallback under missing evidence, not a claim that real textures are symmetric.

### 7.3 Visible-Material Fitting

Creating or deleting an outer texel changes visibility. A pixel previously attributed to the face may belong to glasses, while hair beneath a headphone may need restoration. After geometry decisions, v101 re-renders both head views and performs 48 steps of isolated material fitting:

- final alpha and all body texture stay fixed;
- head colors update according to actual visible layers;
- foreground boundaries, semantic boundaries, and wrong-layer sources are excluded;
- an update is accepted only when reconstruction error decreases;
- missing reliable evidence keeps the completed color.

The next image shows the scoped fixes for a forehead promoted into glasses and headphone color leaking into inner hair. The percentage and color counts are diagnostics for those development cases, not universal accuracy estimates.

![v101 forehead and headphone-color correction|720](/articles/images/v101_layer_comparison.png)

## 8. Crown Tops: Correct Geometry with Re-Rendering Evidence

Crowns expose a problem pixel semantics cannot solve alone. A camera ray may first pass through a head-top outer texel that should be transparent, then hit a visible crown wall. Writing the “crown” label into the first UV candidate creates a false horizontal plate.

Final v101 enables `rendered_semantics`. Once whole-crown detection passes, it keeps other geometry fixed and compares two-view renders with each candidate outer head-top texel kept or removed. The loss uses crown probability and foreground silhouette evidence, and visibility is recomputed after every deletion. A cell is removed only if the rendered evidence improves.

![v101 crown-top geometry correction|720](/articles/images/v101_crown_geometry_comparison.png)

There is no color threshold, per-character exception, or rule that crown tops must always be empty. This step removes unsupported outer head-top cells; it does not invent missing crown walls. No weights were retrained: all 386 model tensors match the preceding release, while the paired inference algorithm changed.

## 9. Training, Acceptance, and Release Selection

v101 is a staged release in which the trunk was frozen, specialized branches were added, and each change was evaluated separately:

| Component | Training and primary acceptance evidence |
| :--- | :--- |
| Foreground | 4,096/128/128 training, validation, and test identities; held-out IoU 0.996745 |
| Brim and accessory continuation | 8,000 steps, validation selected step 7,000; procedural held-out precision 0.992704, recall 0.997558, complete-object rate 0.978571 |
| Face, hair, and headphone semantics | New branch trained for 1,200 + 3,000 steps and headphone presence for 1,200 steps; prior v101 parameters remained unchanged |
| Headwear consistency | Segmentation trained for 5,400 steps and whole-object detection for 1,200; held-out crown outer recall rose from 91.6251% to 99.9235% |
| Crown top | 0 training steps; false top cells on 32 procedural crowns fell from 491 to 14 while 178/182 true top cells remained |

These figures need their scope. Procedural tests measure defined geometry and categories, not semantic accuracy on arbitrary generated images. Fourteen real images were development regressions and visual checks, not an independent blind test. Some procedural crown cases reused source identities from earlier testing, so the crown result is regression evidence.

We later trained v102 through v109 and previously described v104 in this article. Batch review found that v104 improved some visible-head metrics but missed more complex hair and regressed on the head underside where the views provide no evidence. Human labels for messy hair may themselves admit more than one defensible answer. Considering real outputs, stability, and regression behavior together, production returned to v101 under the v101c deployment name. Later version numbers remain research records; a larger number is not evidence of better overall output.

## 10. Production Packaging and Open Reproduction

Production workers load the self-contained `SKING_DDJ_v101c` directory instead of the SkingToolkit development checkout. The package contains:

- the v101 parser and `pipeline.json`;
- the Minecraft foreground model and pinned BiRefNet base files;
- the SigLIP2 snapshot;
- SkingToolkit inference code and the renderer;
- SHA-256 manifests for fixed mapping files;
- `release.json` with the version, source commit, and file hashes.

The GPU worker gives v101c its own bundle and fails on a missing file, version mismatch, or checksum error rather than falling back to v61 or v104. Development acceptance, the Hugging Face package, and production therefore use the same parser, pipeline, foreground weights, and mappings.

- [SkingToolkit v101](https://github.com/EntropyDrop/SkingToolkit/tree/v101)
- [SkingToolkit v101c](https://github.com/EntropyDrop/SkingToolkit/tree/v101c)
- [Hugging Face: EntropyDrop/Sking · SKING_DDJ_v101c](https://huggingface.co/EntropyDrop/Sking/tree/main/SKING_DDJ_v101c)

## 11. Remaining Limitations

- **Stage One still relies on a closed image model.** A wrong back view, missing accessory, or camera drift propagates directly into reconstruction.
- **Views and geometry are fixed.** The system primarily targets Steve layout with ordered `front_left` and `back_left` views. Large perspective, pose, or scale errors are outside its design range.
- **Semantics remain bounded classification.** Image context helps distinguish some face, hair, and accessory regions, but the model does not possess general understanding of every object and material.
- **Unseen texture has no unique answer.** Inner completion uses mirroring and nearby same-part colors. Head undersides, occluded surfaces, and messy hair may admit several equally plausible atlases.
- **Object consistency is scoped.** Aggregating one hat body, band, and crown is not general multi-instance segmentation for overlapping accessories.
- **Structure and color need separate review.** Correct alpha does not prove correct RGB, and a plausible front render does not prove the back, sides, or UV layer ownership.

The value of v101/v101c is not replacing one collection of hard rules with a larger one. Each source of evidence has a defined job: geometry restricts legal locations, semantic branches infer ownership, multi-view aggregation maintains object consistency, the renderer checks visible consequences, and material fitting updates color only when reconstruction improves. The system remains imperfect, but it currently offers a more stable overall result than the later candidates and leaves a traceable diagnostic path for each class of error.

## References and Further Reading

- [v101 release overview](https://github.com/EntropyDrop/SkingToolkit/blob/v101/dense_uv_parser/V101.md)
- [v101 foreground model](https://github.com/EntropyDrop/SkingToolkit/blob/v101/dense_uv_parser/FOREGROUND.md)
- [v101 brim training and acceptance](https://github.com/EntropyDrop/SkingToolkit/blob/v101/dense_uv_parser/V101_RETRAIN.md)
- [v101 forehead and headphone-color correction](https://github.com/EntropyDrop/SkingToolkit/blob/v101/dense_uv_parser/V101_SEMANTIC_FIX.md)
- [v101 hat-band and crown layer consistency](https://github.com/EntropyDrop/SkingToolkit/blob/v101/dense_uv_parser/V101_HEADWEAR_FIX.md)
- [v101 crown-top geometry correction](https://github.com/EntropyDrop/SkingToolkit/blob/v101/dense_uv_parser/V101_CROWN_GEOMETRY_FIX.md)
- [Minecraft Wiki: Skin](https://minecraft.wiki/w/Skin)
- [SigLIP 2](https://arxiv.org/abs/2502.14786)
- [BLOCK](https://arxiv.org/abs/2603.03964)

## Participate and Project Links

- Online generator: [https://entropydrop.com/skin/generate](https://entropydrop.com/skin/generate)
- Hugging Face model: [https://huggingface.co/EntropyDrop/Sking](https://huggingface.co/EntropyDrop/Sking)
- GitHub: [https://github.com/EntropyDrop](https://github.com/EntropyDrop)
- Discord: [https://discord.gg/zxd8RjUyYt](https://discord.gg/zxd8RjUyYt)
