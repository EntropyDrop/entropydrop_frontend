# From Reference Images to Minecraft Skins: Generative Model Training in Practice

**Author: EntropyDrop Dev Team**
**Date: 2026-05-12**


## Foreword

Turning a reference image into a 64x64 skin that can be imported directly into Minecraft is not as simple as "pixelating" the image. The model needs to preserve the character's facial features, hairstyle, clothing, and overall feel, while also obeying the unfolded UV layout of Minecraft skins, the inner and outer layer structure, and alpha-channel constraints.

Below are Minecraft skin generation results from the current model on several reference inputs:

![Original girl3|240](/articles/images/girl3_original.jpg)
![Generated girl3 Skin|240](/articles/images/girl3_gen.jpg)
![Original cat2|240](/articles/images/cat2_original.jpg)
![Generated cat2 Skin|240](/articles/images/cat2_gen.jpg)

![Original boy|240](/articles/images/boy_original.jpg)
![Generated boy Skin|240](/articles/images/boy_gen.jpg)
![Original Girl|240](/articles/images/girl_original.jpg)
![Generated Girl Skin|240](/articles/images/girl_gen.jpg)

![Original zx|240](/articles/images/zx_original.jpg)
![Generated zx Skin|240](/articles/images/zx_gen.jpg)
![Original boy2|240](/articles/images/boy2_original.jpg)
![Generated boy2 Skin|240](/articles/images/boy2_gen.jpg)

![Original Linux Character|240](/articles/images/linux_original.jpg)
![Generated Linux Character Skin|240](/articles/images/linux_gen.jpg)
![Original Pink Character|240](/articles/images/pink_original.jpg)
![Generated Pink Character Skin|240](/articles/images/pink_gen.jpg)

![Original Beethoven|240](/articles/images/beethoven_original.jpg)
![Generated Beethoven Skin|240](/articles/images/beethoven_gen.jpg)
![Original boy3|240](/articles/images/boy3_original.jpg)
![Generated boy3 Skin|240](/articles/images/boy3_gen.jpg)

![Original Dog|240](/articles/images/dog_original.jpg)
![Generated Dog Skin|240](/articles/images/dog_gen.jpg)
![Original Cat|240](/articles/images/cat_original.jpg)
![Generated Cat Skin|240](/articles/images/cat_gen.jpg)

From these examples, we can see that the model can capture key visual features from reference images with reasonable stability and compress them into the pixel expression of a Minecraft skin. Facial contours, hairstyles, clothing colors, and parts of the characters' expressions and demeanor are preserved. For atypical characters such as cats, dogs, and penguins, the model can also generate recognizable skin results within the limited resolution.

This article focuses on the training practice behind this model. From task structure, model selection, and dataset construction to post-processing, it outlines the complete technical path from a reference image to a usable Minecraft skin. Key topics include:
- A deep analysis of the Minecraft skin structure
- How to choose an appropriate base model
- How to design and build a high-quality training dataset
- LoRA fine-tuning parameter choices and practical lessons
- How to use post-processing techniques to accurately extract a truly usable 64x64 skin file from an AI-generated preview image

If you are also interested in training a dedicated Minecraft skin generation model, we hope this article provides useful reference points and inspiration.

## 1. Deep Analysis of the Minecraft Skin Structure

A Minecraft skin is essentially a texture map with four RGBA channels. Its common size is 64x64 pixels, while earlier versions used 64x32 pixels.
The texture map is divided into multiple regions. These regions are unfolded in a specific way, and each corresponds to one face of a certain model part.

![Minecraft Skin UV Map|900](/articles/images/skingen_uv_map.jpg)

Each body part is divided into two types: an inner layer and an outer layer. The inner layer is usually used to represent the base body, while the outer layer is usually used to express layered hair, coats, or armor. There are exceptions: when a 3D structure is relatively complex, the inner layer may also supplement the decorative layer.
The outer skin layer is slightly larger than the inner layer. With support for transparent pixels, it can describe 3D layered hairstyles, clothing silhouettes, and rich decorative details.

- **Head**: Both inner and outer layers are 8x8x8. The pixel width of the outer layer is 9/8 that of the inner layer, making it protrude by 0.5 pixels in every direction relative to the inner layer.
- **Torso**: Both inner and outer layers are 8x12x4. The pixel width of the outer layer is 8.5/8 that of the inner layer, and its height is 12.5/12 that of the inner layer, making it protrude by 0.25 pixels in every direction.
- **Arms and legs**: Both inner and outer layers are 4x12x4. The pixel width of the outer layer is 4.5/4 that of the inner layer. For the front and back faces of slim arms, it is 3.5/3. Its height is 12.5/12 that of the inner layer, making it protrude by 0.25 pixels in every direction.

![Minecraft Skin Inner and Outer Layer Dimensions|800](/articles/images/skingen_layers.jpg)

It is worth noting that all inner-layer skins are composed of equal-width square pixel blocks. However, to keep proportions visually balanced, the outer layers of the torso and limbs are not composed entirely of square pixel blocks. The scaling ratios for the outer layers of the head, torso, and limbs also differ slightly.
This complex spatial mapping logic, along with the structural constraints of inner and outer skins from different viewing angles, makes it difficult for general-purpose AI to consistently generate directly usable skin texture maps.

## 2. The Boundaries of General-Purpose Large Models

Before fine-tuning, we first tried using several general-purpose multimodal image models, such as OpenAI's GPT Image2 and Google's Nano Banana, to directly complete the skin generation task.

The goal of this step was not to compare the models' aesthetic ability, but to verify whether general-purpose models could simultaneously satisfy three engineering requirements:

- Output a texture map that follows the Minecraft 64x64 skin UV layout;
- Reasonably map the identity features, clothing, and colors from the reference image onto the head, torso, limbs, and outer-layer structure;
- Generate a PNG skin file that can be stably parsed by the post-processing pipeline and ultimately imported into the game.

We used a vampire character as the test case. The reference image is shown below:

![Vampire Reference Image|800](/articles/images/dracula_original.jpg)

During testing, we tried many prompt strategies: directly asking the model to generate a 64x64 UV map, providing a Minecraft skin UV structure explanation, asking it to preserve the alpha channel, and having it first describe the texture regions for the head, body, arms, and legs before generating the image. Even when combined with these prompt engineering techniques, the final results still struggled to meet a stable usable standard.

**Nano Banana 2** generation result:

![Nano Banana 2 Generation Result|800](/articles/images/nano_banana2_dracula.jpg)

**GPT Image2** generation result:

![GPT Image2 Generation Result|800](/articles/images/gpt_image2_dracula.jpg)

**Our model** generation result:

![Our Model Generation Result|800](/articles/images/ours_dracula.jpg)

Visually, general-purpose models can sometimes generate images that "look like Minecraft skins" and may even preserve part of the character's feel. But on closer inspection, they cannot even generate a strict 64x64 pixel skin texture map. That is before considering whether details such as the UV layout, direction relationships between parts, and transparent pixels are handled properly.

### Why are current general-purpose multimodal image models still unable to directly generate usable Minecraft skins?

Based on these tests, we summarize four main categories of problems:

- **First, insufficient ability to follow complex instructions.**

The UV structure constraints of a Minecraft skin are extremely strict. Every pixel in a 64x64 image has a precise spatial meaning.

The positions and directions of the head, body, arms, and legs on the UV map are strictly defined. A one-pixel deviation appears as texture misalignment on the 3D model.

These models struggle to use prompts alone, or reference images, to constrain generated images so that they consistently follow pixel-level precise structures.

- **Second, insufficient understanding of complex 3D structures.**

We need not only an accurate UV map, but also a texture that preserves features from the original image as much as possible after being mapped into 3D space. This requires accounting for occlusion from different viewing angles, occlusion between components, the distances between joints and components, and other details. For example, decorations such as scarves often span multiple components. Without a correct understanding of spatial relationships, the final result may be incomplete or misaligned.

- **Third, the missing alpha channel.**

Minecraft's outer skin layer can use the alpha channel to express which pixels should be shown and which should not.

This determines hat shapes, coat silhouettes, and hair layering.

General-purpose image models usually do not stably output a directly usable alpha channel. If a specific color is used as the background, it can also interfere with foreground-background separation when the skin color is close to the background color.

## 3. Technical Choices for Fine-Tuning

Prompt engineering alone is not enough for skin generation, so we turned to fine-tuning.

During exploration, we noticed Cory Spencer's public series of articles on Minecraft skin generation on the Monadical website. That approach designed a composite output image layout: one part is a UV map, and the other part is a 3D render. This design helps guide the model to learn the correspondence between a 2D UV map and a 3D model, and it partially alleviates the problems of pixel-level structural generation and complex 3D structure understanding. In our tests, training UV map generation alone or training 3D model render generation alone was not stable enough. Combining the two led to a clear improvement in the model's performance on this task.

![Monadical Approach Diagram|800](/articles/images/monadical.jpg)

However, this approach also has limitations. "Text-to-Skin" is fine-tuned from a "Text-to-Image" base model. This type of model is difficult to transfer directly to an "Image-to-Skin" task, because it is hard to fully describe every detail of an image using text alone. But "Image-to-Skin" is crucial for practical workflows: once it works, we can further build a complete "Text-to-Image -> Image-to-Skin" pipeline. Therefore, we needed to choose a base model with image-to-image capabilities for fine-tuning.

We ultimately chose Flux2 Klein Base 4B as the base model.
It is a lighter-weight member of the Flux2 series. While maintaining strong image understanding and generalization ability, it is friendlier in terms of VRAM and compute requirements, making it suitable for scenario-specific LoRA fine-tuning and rapid feasibility validation.
In the future, larger models can be used to further improve results, such as Qwen Image Edit or Flux2 Klein Base 9B.

## 4. Key Question: Dataset Design and Training Parameters

The core of dataset design is: **under limited resolution, integrate high-density multidimensional information to guide the model toward more stable learning of the abstract mapping from "realistic portrait" to "pixel texture map" and render.**

The dataset consists of paired **Control Images** and **Target Images**.

- **Control Image**: Realistic front and back photos of the subject. The left side is a full-body front-facing standing portrait, and the right side is a full-body rear view, providing complete feature references for the model. Thanks to Flux2 Klein's relatively strong image understanding ability, even if only a front-facing photo is provided during inference, the model still has a chance to generate a reasonable back side of the skin.

![Control Image Example|800](/articles/images/8880005_control_img.jpg)

- **Target Image**: The final learning target for the model. To improve the generated skin's consistency and detail expression in 3D space, it integrates the core UV map with multi-view 3D renders.

![Target Image Example|800](/articles/images/8880005.jpg)

The target image layout is designed as follows:

| Layout Position | Details | Design Intent |
| :--- | :--- | :--- |
| **Top left** | Complete UV map, including transparent pixel markers | Provides the core skin texture data; transparent pixel markers help restore the alpha channel |
| **Top right** | * Dynamic pose preview from the main perspective view<br>* High-magnification close-ups of the head and torso | Detail reinforcement: reduces asymmetry and improves generation quality for complex accessories such as hoodies and scarves |
| **Bottom half** | * Full-view displays of inner and outer skin layers, including front, back, top, and bottom<br>* Multi-angle head detail close-ups | Structural validation: helps check 3D spatial consistency and visual coherence |

In our experiments, the layout position itself did not show a decisive impact. By contrast, information density, viewing-angle coverage, and the correspondence between the UV map and 3D renders were more important.

Although fine-tuning still involves a degree of empiricism, after dozens of iterations we summarized a currently stable methodology:

1. Progressive data strategy: first try training with a small number of samples, such as 20 images. If the model learns some basic features, then increase the sample count.
   This can quickly verify whether the training pipeline is correct and avoid wasting time on a large dataset.

2. Dataset quality matters more than quantity:
   Accurate colors, reasonable abstraction of character features, and data diversity are all important. A model trained on 50 carefully selected pairs, meaning 50 control images and 50 target images, can already generate a batch of usable examples. Larger datasets need to be added cautiously, because they may improve generation quality in some scenarios while reducing it in others.

3. Targeted datasets for specific scenarios: during iteration, we found that the model needs dedicated reinforcement for certain features.
   For example, when hats, beards, glasses, and similar accessories perform poorly, we add corresponding data to the samples.
   However, overly complex skins need to be removed because they interfere with the model's learning of common features, unless a larger base model with stronger generalization is used.

4. Rendering parameters:

   Many factors affect learning results. Rendering parameters are especially important: Voxel mode / Plane mode; perspective / orthographic projection; rendering only the inner layer / only the outer layer / both layers; character pose; rotation angles of each component; lighting on/off; wireframe on/off; and so on.

   ![Plane Mode Rendering Example|300](/articles/images/8880005_plane.jpg)
   ![Voxel Mode Rendering Example|300](/articles/images/8880005_voxel.jpg)

   The difference between Plane mode and Voxel mode lies in how the outer skin layer is rendered. Plane mode renders the outer layer as a floating plane, while Voxel mode renders each pixel of the outer layer as a block.

   ![Orthographic Projection Rendering Example|300](/articles/images/8880005_ortho.jpg)
   ![Perspective Projection Rendering Example|300](/articles/images/8880005_perspective.jpg)

   In orthographic projection versus perspective projection, perspective projection makes near objects look larger and far objects smaller, while orthographic projection keeps object size unchanged. Perhaps for this reason, perspective projection can provide additional depth information and makes it easier for the model to learn the mapping relationship between the skin and 3D space.

   ![Rendering Example with Lighting Off|300](/articles/images/8880005_light_off.jpg)
   ![Rendering Example with Lighting On|300](/articles/images/8880005_perspective.jpg)

   Comparing lighting on and off: when lighting is off, as shown on the left, each pixel block displays its original color. This makes adjacent blocks of the same color hard to distinguish. Shadows with lighting enabled make the render more three-dimensional and make it easier for the model to learn the mapping relationship. Although highlights and reflections can affect color accuracy in some areas, such as the shoulders, our observations show that enabling lighting produces more stable results.

   ![Inner Layer Only|300](/articles/images/8880005_inner.jpg)
   ![Outer Layer Only|300](/articles/images/8880005_overlay.jpg)
   ![Both Inner and Outer Layers|300](/articles/images/8880005_both.jpg)

   Rendering methods and viewing angles for the inner and outer layers also affect how the model learns texture mapping. All voxels should be displayed as completely as possible. From left to right: inner layer only, outer layer only, and both layers together. We need to combine these rendering methods to help the model fully understand the skin's structure and texture.

### Reproducible Experimental Configuration

| Item | Value |
| :--- | :--- |
| Base model | Flux2 Klein Base 4B |
| Training framework | ai-toolkit |
| Training resolution | 768x768 |
| Dataset size | 170 training pairs |
| Batch size | 1 |
| Gradient Accumulation | 1 |
| Optimizer | AdamW 8-bit |
| Learning Rate | 1e-4 |
| Steps | ~27,000, depending on dataset size |
| LoRA rank | 32 |
| Quantization | None |
| Training hardware and time | 1 x RTX Pro 6000, about 8 hours |
| Inference configuration | 100 steps; guidance: 4 |

### Training Convergence and Generation Evolution

During the LoRA fine-tuning process, we recorded the model's outputs at various training steps. The evolutionary process below clearly illustrates how the model progressively learns the complex UV layout and 3D spatial mapping of Minecraft skins from chaotic noise:

#### 1. Early Phase (Steps 500 - 2000): Layout Learning & Chaos
During this initial period, the model begins to explore the macro layout of the output. The outputs in the first 1000 steps are largely blurry color blocks and chaotic lines, where boundaries between the UV map and the renders are highly scrambled. By step 2000, the model starts to grasp the composite layout rule (UV map on the top left, 3D renders elsewhere), but fine structural details remain completely absent.

![train_500|180](/articles/images/train_500.jpg)
![train_1000|180](/articles/images/train_1000.jpg)
![train_1500|180](/articles/images/train_1500.jpg)
![train_2000|180](/articles/images/train_2000.jpg)

#### 2. Mid Phase (Steps 2500 - 4000): Structure & Color Mapping
During this stage, the model rapidly absorbs the grid-alignment characteristics of the UV map. The silhouettes of the basic 3D body parts (head, torso, limbs) become recognizable, and the primary colors of the clothing (e.g., red/blue, black/white) map correctly to their corresponding components. While pixel edges remain blurry with visible noise, the overall structural framework is firmly established.

![train_2500|180](/articles/images/train_2500.jpg)
![train_3000|180](/articles/images/train_3000.jpg)
![train_3500|180](/articles/images/train_3500.jpg)
![train_4000|180](/articles/images/train_4000.jpg)

#### 3. Late Phase (Steps 6000 - 12000): Detail & Layer Differentiation
With more training steps, the model refines intricate features. Facial contours, clothing accessories, and the 3D spatial hierarchies of the outer layer (such as hair layers and coat borders) are gradually established. The grid of transparent pixel markers (Alpha Markers) used for post-processing extraction starts to exhibit regular geometric patterns, and the generation quality and consistency improve significantly.

![train_6000|180](/articles/images/train_6000.jpg)
![train_8000|180](/articles/images/train_8000.jpg)
![train_12000|180](/articles/images/train_12000.jpg)
![train_16000|180](/articles/images/train_16000.jpg)

#### 4. Convergence Phase (Step 18000 & Beyond): Pixel-Level Convergence & High-Fidelity Fitting
Around step 18000, the blurriness of the image gradually disappears, the pixels become sharp, and the grid boundaries are clear. The character's facial expressions and fine clothing textures (such as collar folds and accessories) achieve a relatively high level of fit. The Alpha Markers are regular and clear.

![train_18000|500](/articles/images/train_18000.jpg)

The progressive evolution from step 500 to 18000 demonstrates that the model does not generate perfect skins instantly. Instead, it first learns the macro "layout and structural mapping", then refines "features and multi-dimensional consistency", and finally converges to a usable skin model.

> Note: The evolution process above is based on an early dataset design, so the target images do not align with the design described in this article.

## 5. Building a High-Quality Dataset


The key to building a usable skin generation model is a high-quality paired **Control Image - Target Image** dataset. Target images are usually relatively easy to obtain: we can collect UV skin texture datasets from the community and then generate target images with scripts. Matched realistic-style control images are much harder to obtain. For this reason, we used the following two strategies:

#### 1. Reverse Deduction Generation

Use the visual understanding ability of multimodal image models, such as GPT Image2, to "reverse deduce" corresponding realistic portrait photos from existing skin texture maps.

**Recommended prompt example:**

> "Based on the features of this Minecraft skin, generate the corresponding full-body front-facing standing photo of a real person; on the right side of the image, generate the corresponding back view, keeping clothing and details as consistent as possible."

#### 2. Self-Evolving Data Synthesis Loop

Build an automated generation pipeline that enables self-evolving iteration through a "model-assisted model" approach:

1. **Textual feature description**: Use an LLM to randomly generate diverse descriptions of character appearance and accessories.
2. **Realistic portrait synthesis**: Call a text-to-image model to generate the corresponding full-body real-person photo.
3. **Skin generation**: Use the current version of the "Image-to-Skin" model to generate the corresponding target image.
4. **Filtering and repair**: Perform structural validation and evaluation on the generated result, manually or automatically, then remove or repair flawed data. Record flawed scenarios and prepare more data for targeted optimization.
5. **Dynamic dataset expansion**: Merge the optimized high-quality data pairs into the training set and start the next round of model iteration.

This closed-loop mechanism allows us to quickly identify weak scenarios and perform targeted data augmentation.

## 6. Post-Processing: Extracting the Skin from the Target Image

Because diffusion models generate RGB images by default and do not natively include an alpha channel, we need to accurately extract the 64x64 pixel skin texture map from the generated result and restore the transparency information of the outer skin layer.
During training, if the render background is uniformly set to gray (128, 128, 128), then when the generated skin itself contains similar gray elements, some foreground pixels may be misclassified as background. In addition, generated images often contain color blending gradients at the boundary between foreground and background, making conventional solid-color threshold extraction unreliable.

![Transparent Pixel Feature Marker Example|400](/articles/images/8880005_alpha.jpg)

**Solution: Transparent Pixel Feature Marker (Alpha Marker)**

We designed a special image encoding strategy: when constructing the training set, we pre-draw a tiny white rectangular marker at the center of each transparent pixel in the UV map. After learning, the model uses these markers in the generated result to represent transparent pixels.
During post-processing extraction, a relatively direct algorithm can detect these white "feature anchors": if the central area of a pixel is close to white and its edge area is close to the background color, the pixel can be classified as transparent. This method turns the difficult "foreground/background separation" problem into a more controllable "feature detection" problem.

The limitation is that this method only supports distinguishing two states: fully transparent and opaque. In theory, RGBA images can represent 256 levels of transparency, which is useful for scenarios such as semi-transparent glasses. How to make the model stably generate multi-level transparency still requires further exploration.

## 7. Current Limitations and Future Exploration

The current approach can already generate a batch of usable examples, but it is still some distance from stable production use. The main limitations include:

- **Multi-level transparency remains unsolved**: Alpha markers currently only stably express two states, "fully transparent" and "opaque." They still cannot reliably generate multi-level transparent materials such as glasses, veils, or semi-transparent hair accessories.
- **Complex decorations remain unstable**: For irregular headwear, clothing, and cross-component decorations, results may be blurry, broken, misaligned, or left-right asymmetric.
- **Generalization still needs improvement**: For animals that did not appear in the training set, the model may produce artifacts or lose animal-specific features.
- **Back-side inference remains structurally unstable**: When the control image provides only a front view, the model needs to infer back-side clothing, hairstyle, and accessory structure. This inference may be inconsistent with the original design.
- **Post-processing algorithms are still imperfect**: Alpha Marker detection depends on color thresholds and pixel-region judgments, so misclassification can still occur.

Based on these limitations and our current practical experience, we plan to continue research in the following directions:

- **Reverse generation models**: Reverse deducing realistic portrait photos from skin texture maps.
- **Control image preprocessing enhancement**: Introduce preprocessing workflows in the control image stage. Use AI to automatically correct reference-image poses, such as forcing an upright stance, predict back-side features, and apply unified style processing beforehand, making it easier for the model to generate accurate skins.
- **DPO integration on top of LoRA**: Direct Preference Optimization, enhancing the stability and quality of model generation.
- **Sub-art-style control and boundary exploration**: Continue exploring the boundaries of prompt engineering and model capabilities. For the same control image, controllably generate skins in multiple art styles, such as Low-Poly style, different gender and race generation strategies, and controllable voxel boundary transitions that are sharper or smoother.
- **More stable foreground extraction techniques**: Even when special alpha markers are used to represent fully transparent and opaque states, the training data still contains only these two states. The model may still generate an "intermediate state" between solid color blocks and marked blocks, causing background noise or missing textures in the final skin.
- **Improving the self-evolving data synthesis loop**: Further improve the loop so that it can automatically generate higher-quality and more diverse datasets, continuously improving model performance.
- **Training on larger base models**: Aim for higher generation quality and stronger generalization ability.

## Summary

Minecraft skin generation may look like simply converting a reference image into a pixel-style character, but the real difficulty is that the model must simultaneously understand 2D UV maps, the 3D block-character structure, inner and outer layer transparency relationships, and identity features from the reference image. It is difficult to satisfy these constraints reliably with prompts alone, so we split the problem into several parts that are easier for the model to learn and easier to verify in engineering: image-to-image base model fine-tuning, composite target image design, and post-processing algorithms.

From the current results, composite target images, a small set of high-quality samples, and transparent pixel feature markers are the three most important parts of this approach. If automatic structural validation, failed-example feedback, and multi-level transparency handling can be further improved, Minecraft skin generation will move closer to a sustainably iterative engineering system rather than a one-off model experiment.

We also welcome anyone interested in Minecraft, generative models, data synthesis, or pixel art to push new models and methods forward. If you are familiar with model training, inference deployment, or post-processing algorithms, you can join our discussion and experiments through GitHub, Hugging Face, or Discord; if you are a non-technical enthusiast, you can also directly try our online generator. The reference images, generated results, and failure cases you share will help us observe where the model is still weak across characters, styles, and structures, and provide highly valuable real-world references for subsequent data selection, model evaluation, and training.

## References and Further Reading

- [Minecraft Wiki: Skin](https://minecraft.wiki/w/Skin): Used to cross-check game-side details about Minecraft skins, inner and outer layers, and the alpha channel.
- [Cory Spencer: Digging into Stable Diffusion-Generated Minecraft Skins](https://monadical.com/posts/mincraft-skin-generation.html): Monadical's first practical article on Minecraft-style character preview generation.
- [Cory Spencer: Even More Skin in the Game](https://monadical.com/posts/minecraft-skins-part2.html): Monadical's second practical article on usable Minecraft skin generation.
- [BLOCK: An Open-Source Bi-Stage MLLM Character-to-Skin Pipeline for Minecraft](https://arxiv.org/abs/2603.03964): A Minecraft character-to-skin generation pipeline published in 2026, useful as a recent reference for related work.
- [ostris/ai-toolkit](https://github.com/ostris/ai-toolkit): The LoRA training tool used in this article's experimental configuration.

## Join the Research and Project Links

- Online generator: [https://entropydrop.com/skin/generate](https://entropydrop.com/skin/generate)
- Hugging Face model: [https://huggingface.co/EntropyDrop/Sking](https://huggingface.co/EntropyDrop/Sking)
- GitHub: [https://github.com/EntropyDrop](https://github.com/EntropyDrop)
- Discord: [https://discord.gg/ByX7TwqDcw](https://discord.gg/ByX7TwqDcw)
