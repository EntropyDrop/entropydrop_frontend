import { PageContainer } from '../components/PageContainer';
import { Icon } from '@iconify/react'
import { useState, useEffect, useRef, type ChangeEvent } from 'react'
import { useLocation } from 'react-router-dom'
import { type LangData } from '../constants/lang'
import { MC } from '../components/MC'
import { Skin2D, isSlim, convertSkinLayout } from '../components/utils'
import * as THREE from 'three'
import { showAlert, showError } from '../utils/alert'
import { apiFetch } from '../utils/api'


interface KMeansResult {
    imageData: ImageData;
    palette: string[];
}

function runKMeansQuantization(imageData: ImageData, k: number): KMeansResult {
    const data = imageData.data;
    const width = imageData.width;
    const height = imageData.height;

    const colorMap = new Map<string, number[]>();

    for (let i = 0; i < data.length; i += 4) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        const a = data[i + 3];

        if (a > 0) {
            const key = `${r},${g},${b}`;
            if (!colorMap.has(key)) {
                colorMap.set(key, []);
            }
            colorMap.get(key)!.push(i);
        }
    }

    const uniqueColors: { r: number; g: number; b: number; weight: number; indices: number[] }[] = [];
    colorMap.forEach((indices, key) => {
        const [r, g, b] = key.split(',').map(Number);
        uniqueColors.push({ r, g, b, weight: indices.length, indices });
    });

    if (uniqueColors.length <= k) {
        const palette = uniqueColors.map(c => {
            const hexR = c.r.toString(16).padStart(2, '0');
            const hexG = c.g.toString(16).padStart(2, '0');
            const hexB = c.b.toString(16).padStart(2, '0');
            return `#${hexR}${hexG}${hexB}`;
        });
        return { imageData, palette };
    }

    let centroids: { r: number; g: number; b: number }[] = [];
    const step = uniqueColors.length / k;
    for (let i = 0; i < k; i++) {
        const index = Math.min(Math.floor(i * step), uniqueColors.length - 1);
        centroids.push({ r: uniqueColors[index].r, g: uniqueColors[index].g, b: uniqueColors[index].b });
    }

    const maxIterations = 15;
    let assignments = new Array(uniqueColors.length).fill(-1);

    for (let iter = 0; iter < maxIterations; iter++) {
        let changed = false;

        for (let i = 0; i < uniqueColors.length; i++) {
            const color = uniqueColors[i];
            let minDist = Infinity;
            let bestIndex = 0;

            for (let j = 0; j < centroids.length; j++) {
                const c = centroids[j];
                const dist = (color.r - c.r) ** 2 + (color.g - c.g) ** 2 + (color.b - c.b) ** 2;
                if (dist < minDist) {
                    minDist = dist;
                    bestIndex = j;
                }
            }

            if (assignments[i] !== bestIndex) {
                assignments[i] = bestIndex;
                changed = true;
            }
        }

        if (!changed) break;

        const sumR = new Array(centroids.length).fill(0);
        const sumG = new Array(centroids.length).fill(0);
        const sumB = new Array(centroids.length).fill(0);
        const counts = new Array(centroids.length).fill(0);

        for (let i = 0; i < uniqueColors.length; i++) {
            const color = uniqueColors[i];
            const clusterIndex = assignments[i];
            sumR[clusterIndex] += color.r * color.weight;
            sumG[clusterIndex] += color.g * color.weight;
            sumB[clusterIndex] += color.b * color.weight;
            counts[clusterIndex] += color.weight;
        }

        for (let j = 0; j < centroids.length; j++) {
            if (counts[j] > 0) {
                centroids[j] = {
                    r: Math.round(sumR[j] / counts[j]),
                    g: Math.round(sumG[j] / counts[j]),
                    b: Math.round(sumB[j] / counts[j])
                };
            }
        }
    }

    const outputImageData = new ImageData(new Uint8ClampedArray(data), width, height);
    const activeCentroids = new Set<number>();

    for (let i = 0; i < uniqueColors.length; i++) {
        const color = uniqueColors[i];
        const clusterIndex = assignments[i];
        const centroid = centroids[clusterIndex];
        activeCentroids.add(clusterIndex);
        for (const idx of color.indices) {
            outputImageData.data[idx] = centroid.r;
            outputImageData.data[idx + 1] = centroid.g;
            outputImageData.data[idx + 2] = centroid.b;
        }
    }

    const palette: string[] = [];
    activeCentroids.forEach(idx => {
        const c = centroids[idx];
        const hexR = c.r.toString(16).padStart(2, '0');
        const hexG = c.g.toString(16).padStart(2, '0');
        const hexB = c.b.toString(16).padStart(2, '0');
        palette.push(`#${hexR}${hexG}${hexB}`);
    });

    return { imageData: outputImageData, palette };
}

function getUniqueColors(imageData: ImageData): string[] {
    const data = imageData.data;
    const colors = new Set<string>();
    for (let i = 0; i < data.length; i += 4) {
        if (data[i + 3] > 0) {
            const r = data[i].toString(16).padStart(2, '0');
            const g = data[i + 1].toString(16).padStart(2, '0');
            const b = data[i + 2].toString(16).padStart(2, '0');
            colors.add(`#${r}${g}${b}`);
        }
    }
    return Array.from(colors);
}


interface EditPageProps {
    current: LangData
}

export function EditPage({ current }: EditPageProps) {
    const location = useLocation();
    const passedTextureUrl = location.state?.textureUrl;
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [ctx, setCtx] = useState<CanvasRenderingContext2D | null>(null);
    const [texture, setTexture] = useState<THREE.CanvasTexture | null>(null);
    const [updateTrigger, setUpdateTrigger] = useState(0);
    const [basedOnSkinRenderUrl, setBasedOnSkinRenderUrl] = useState<string | null>(null);
    const [parentSkinId, setParentSkinId] = useState<string | null>(location.state?.passedLogId || null);
    const isParentPrivate = location.state?.isPublic === false;


    // Undo/Redo state
    const [history, setHistory] = useState<{ list: { data: ImageData, hsb: { h: number, s: number, b: number }, kmeansK: number }[], index: number }>({ list: [], index: -1 });
    const hasChangedRef = useRef(false);
    const hoverRef = useRef<{ x: number, y: number, savedData: ImageData } | null>(null);

    const [modelType, setModelType] = useState<'steve' | 'alex'>('steve');
    const [currentColor, setCurrentColor] = useState('#ff0000');
    const [isEmptyModel, setIsEmptyModel] = useState(!passedTextureUrl);
    const [tool, setTool] = useState<'pencil' | 'eraser' | 'picker'>('pencil');
    const [recentColors, setRecentColors] = useState<string[]>([]);
    const previewMode = 'plane';
    const [previewAction] = useState<'idle' | 'walking' | 'dance'>('idle');

    const [visibleParts, setVisibleParts] = useState({
        head: true,
        body: true,
        leftArm: true,
        rightArm: true,
        leftLeg: true,
        rightLeg: true
    });
    const [showOverlay, setShowOverlay] = useState(true);
    const [isDropdownOpen, setIsDropdownOpen] = useState(false);
    const [isSavingToCreation, setIsSavingToCreation] = useState(false);
    const [isAdjustPanelOpen, setIsAdjustPanelOpen] = useState(false);
    const [hsb, setHsb] = useState({ h: 0, s: 0, b: 0 });
    const originalImageDataRef = useRef<ImageData | null>(null);
    const startHsbRef = useRef({ h: 0, s: 0, b: 0 });

    const handleHSBStart = () => {
        if (!ctx) return;
        originalImageDataRef.current = ctx.getImageData(0, 0, 64, 64);
        startHsbRef.current = { ...hsb };
    };

    const applyHSB = (h: number, s: number, b: number) => {
        if (!ctx || !originalImageDataRef.current) return;
        const base = originalImageDataRef.current;
        const imgData = new ImageData(new Uint8ClampedArray(base.data), 64, 64);

        // Relative offset from drag start
        const dh = h - startHsbRef.current.h;
        const ds = s - startHsbRef.current.s;
        const db = b - startHsbRef.current.b;

        for (let i = 0; i < imgData.data.length; i += 4) {
            const a = imgData.data[i + 3];
            if (a === 0) continue;

            const r = imgData.data[i] / 255;
            const g = imgData.data[i + 1] / 255;
            const bv = imgData.data[i + 2] / 255;

            // RGB to HSL
            const max = Math.max(r, g, bv), min = Math.min(r, g, bv);
            let hVal = 0, sVal = 0, lVal = (max + min) / 2;

            if (max !== min) {
                const d = max - min;
                sVal = lVal > 0.5 ? d / (2 - max - min) : d / (max + min);
                switch (max) {
                    case r: hVal = (g - bv) / d + (g < bv ? 6 : 0); break;
                    case g: hVal = (bv - r) / d + 2; break;
                    case bv: hVal = (r - g) / d + 4; break;
                }
                hVal /= 6;
            }

            // Apply relative offsets
            let adjustedH = (hVal + (dh / 360)) % 1;
            if (adjustedH < 0) adjustedH += 1;

            let adjustedS = Math.max(0, Math.min(1, sVal + (ds / 100)));
            let adjustedL = Math.max(0, Math.min(1, lVal + (db / 100)));

            // HSL to RGB
            let nr, ng, nb;
            if (adjustedS === 0) {
                nr = ng = nb = adjustedL; // achromatic
            } else {
                const hue2rgb = (p: number, q: number, t: number) => {
                    if (t < 0) t += 1;
                    if (t > 1) t -= 1;
                    if (t < 1 / 6) return p + (q - p) * 6 * t;
                    if (t < 1 / 2) return q;
                    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
                    return p;
                };

                const q = adjustedL < 0.5 ? adjustedL * (1 + adjustedS) : adjustedL + adjustedS - adjustedL * adjustedS;
                const p = 2 * adjustedL - q;
                nr = hue2rgb(p, q, adjustedH + 1 / 3);
                ng = hue2rgb(p, q, adjustedH);
                nb = hue2rgb(p, q, adjustedH - 1 / 3);
            }

            imgData.data[i] = Math.round(nr * 255);
            imgData.data[i + 1] = Math.round(ng * 255);
            imgData.data[i + 2] = Math.round(nb * 255);
        }

        ctx.putImageData(imgData, 0, 0);
        if (texture) {
            texture.needsUpdate = true;
            setUpdateTrigger(prev => prev + 1);
        }
    };

    const handleHSBChange = (type: 'h' | 's' | 'b', val: number) => {
        const newHsb = { ...hsb, [type]: val };
        setHsb(newHsb);
        applyHSB(newHsb.h, newHsb.s, newHsb.b);
    };

    const handleHSBEnd = () => {
        saveState(hsb);
        originalImageDataRef.current = null;
    };

    const [kmeansK, setKmeansK] = useState(16);
    const [kmeansPalette, setKmeansPalette] = useState<string[]>([]);
    const originalKMeansImageDataRef = useRef<ImageData | null>(null);

    const handleKMeansStart = () => {
        if (!ctx) return;
        originalKMeansImageDataRef.current = ctx.getImageData(0, 0, 64, 64);
    };

    const applyKMeans = (k: number) => {
        if (!ctx || !originalKMeansImageDataRef.current) return;
        const res = runKMeansQuantization(originalKMeansImageDataRef.current, k);
        ctx.putImageData(res.imageData, 0, 0);
        setKmeansPalette(res.palette);
        if (texture) {
            texture.needsUpdate = true;
            setUpdateTrigger(prev => prev + 1);
        }
    };

    const handleKMeansChange = (k: number) => {
        setKmeansK(k);
        applyKMeans(k);
    };

    const handleKMeansEnd = () => {
        saveState();
        originalKMeansImageDataRef.current = null;
    };

    // Initialize K and palette when panel opens
    useEffect(() => {
        if (isAdjustPanelOpen && ctx) {
            const imgData = ctx.getImageData(0, 0, 64, 64);
            const initialPalette = getUniqueColors(imgData);
            setKmeansPalette(initialPalette);

            const defaultK = Math.min(48, Math.max(2, initialPalette.length));
            setKmeansK(defaultK);
        }
    }, [isAdjustPanelOpen, ctx]);

    // Keep palette preview in sync when painting or undoing/redoing
    useEffect(() => {
        if (isAdjustPanelOpen && ctx) {
            const imgData = ctx.getImageData(0, 0, 64, 64);
            const currentPalette = getUniqueColors(imgData);
            setKmeansPalette(currentPalette);
        }
    }, [updateTrigger]);

    const handleSaveToCreation = async (isPublic: boolean) => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        setIsSavingToCreation(true);
        canvas.toBlob(async (blob) => {
            if (!blob) {
                setIsSavingToCreation(false);
                return;
            }
            const formData = new FormData();
            formData.append('file', blob, 'skin.png');
            formData.append('mode', 'human_edit');
            if (parentSkinId) {
                formData.append('parent', parentSkinId);
            }

            const targetCol = isPublic ? 'creations_public' : 'creations_private';
            try {
                const res = await apiFetch(`/api/collections/${targetCol}/upload`, {
                    method: 'POST',
                    body: formData
                });
                if (res.ok) {
                    showAlert(current.edit.saveSuccess);
                    setIsDropdownOpen(false);
                } else {
                    showError(current.edit.saveFailed);
                }
            } catch (e) {
                console.error(e);
                showError(current.edit.saveFailed);
            } finally {

                setIsSavingToCreation(false);
            }
        }, 'image/png');
    };

    const togglePart = (part: keyof typeof visibleParts) => {
        setVisibleParts(prev => ({ ...prev, [part]: !prev[part] }));
    };

    // Initial setup
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        canvas.width = 64;
        canvas.height = 64;
        const c = canvas.getContext('2d', { willReadFrequently: true });
        if (!c) return;

        if (!passedTextureUrl) {
            c.clearRect(0, 0, 64, 64);
            setCtx(c);
            setIsEmptyModel(true);
            setModelType('steve');
            const initialData = c.getImageData(0, 0, 64, 64);
            setHistory({ list: [{ data: initialData, hsb: { h: 0, s: 0, b: 0 }, kmeansK: Math.min(48, Math.max(2, getUniqueColors(initialData).length)) }], index: 0 });
            const tex = new THREE.CanvasTexture(canvas);
            tex.magFilter = THREE.NearestFilter;
            tex.minFilter = THREE.NearestFilter;
            tex.colorSpace = THREE.SRGBColorSpace;
            setTexture(tex);
            return;
        }

        const img = new Image();
        img.crossOrigin = "anonymous";
        img.src = passedTextureUrl;
        img.onload = () => {
            setIsEmptyModel(false);
            c.clearRect(0, 0, 64, 64);
            if (img.width === 64 && img.height === 32) {
                c.drawImage(img, 0, 0);
                c.drawImage(canvas, 40, 16, 16, 16, 32, 48, 16, 16);
                c.drawImage(canvas, 0, 16, 16, 16, 16, 48, 16, 16);
            } else {
                c.drawImage(img, 0, 0, 64, 64);
            }
            setCtx(c);
            setModelType(isSlim(img) ? 'alex' : 'steve');

            // Save initial state for undo
            const initialData = c.getImageData(0, 0, 64, 64);
            setHistory({ list: [{ data: initialData, hsb: { h: 0, s: 0, b: 0 }, kmeansK: Math.min(48, Math.max(2, getUniqueColors(initialData).length)) }], index: 0 });

            // Create CanvasTexture
            const tex = new THREE.CanvasTexture(canvas);
            tex.magFilter = THREE.NearestFilter;
            tex.minFilter = THREE.NearestFilter;
            tex.colorSpace = THREE.SRGBColorSpace;
            setTexture(tex);
        };
    }, [passedTextureUrl]);

    useEffect(() => {
        if (parentSkinId && passedTextureUrl) {
            Skin2D(passedTextureUrl)
                .then(canvas => setBasedOnSkinRenderUrl(canvas.toDataURL('image/png')))
                .catch(e => console.error('Failed to render based on skin', e));
        } else {
            setBasedOnSkinRenderUrl(null);
        }
    }, [parentSkinId, passedTextureUrl]);

    const paintPixel = (x: number, y: number) => {
        if (!ctx) return;
        if (x >= 0 && x < 64 && y >= 0 && y < 64) {
            ctx.imageSmoothingEnabled = false;

            // Restore hover preview pixel before actual painting
            if (hoverRef.current) {
                ctx.putImageData(hoverRef.current.savedData, hoverRef.current.x, hoverRef.current.y);
                hoverRef.current = null;
            }

            if (tool === 'picker') {
                let pixel = ctx.getImageData(x, y, 1, 1).data;

                if (pixel[3] === 0) {
                    // If the overlay layer is transparent, try to convert to the corresponding inner layer coordinates for secondary color picking
                    let pickX = x;
                    let pickY = y;

                    if (x >= 32 && x < 64 && y >= 0 && y < 16) {
                        pickX = x - 32; // Head overlay -> Head
                    } else if (y >= 32 && y < 48) {
                        if (x >= 0 && x < 16) pickY = y - 16;    // Right leg overlay -> Right leg
                        else if (x >= 16 && x < 40) pickY = y - 16; // Torso overlay -> Torso
                        else if (x >= 40 && x < 56) pickY = y - 16; // Right arm overlay -> Right arm
                    } else if (y >= 48 && y < 64) {
                        if (x >= 0 && x < 16) pickX = x + 16;    // Left leg overlay -> Left leg
                        else if (x >= 48 && x < 64) pickX = x - 16; // Left arm overlay -> Left arm
                    }

                    if (pickX !== x || pickY !== y) {
                        pixel = ctx.getImageData(pickX, pickY, 1, 1).data;
                    }
                }

                if (pixel[3] === 0) {
                    setTool('eraser');
                } else {
                    const r = pixel[0].toString(16).padStart(2, '0');
                    const g = pixel[1].toString(16).padStart(2, '0');
                    const b = pixel[2].toString(16).padStart(2, '0');
                    const hex = `#${r}${g}${b}`;
                    setCurrentColor(hex);
                    setTool('pencil');
                }
                return;
            }

            let changed = false;
            if (tool === 'pencil') {
                ctx.fillStyle = currentColor;
                ctx.fillRect(x, y, 1, 1);
                changed = true;

                // Add to recent colors
                setRecentColors(prev => {
                    if (prev[0]?.toLowerCase() === currentColor.toLowerCase()) return prev;
                    const filtered = prev.filter(c => c.toLowerCase() !== currentColor.toLowerCase());
                    return [currentColor, ...filtered].slice(0, 10);
                });
            } else if (tool === 'eraser') {
                const isOverlay =
                    (x >= 32 && x < 64 && y >= 0 && y < 16) || // Head overlay
                    ((y >= 32 && y < 48) && (
                        (x >= 0 && x < 16) ||    // Right leg overlay
                        (x >= 16 && x < 40) ||   // Torso overlay
                        (x >= 40 && x < 56)      // Right arm overlay
                    )) ||
                    ((y >= 48 && y < 64) && (
                        (x >= 0 && x < 16) ||    // Left leg overlay
                        (x >= 48 && x < 64)      // Left arm overlay
                    ));

                if (isOverlay) {
                    ctx.clearRect(x, y, 1, 1);
                    changed = true;
                } else {
                    return; // Clearing inner layer pixels is forbidden
                }
            }

            if (changed) {
                hasChangedRef.current = true;
                setIsEmptyModel(false);
                if (texture) {
                    texture.needsUpdate = true;
                    setUpdateTrigger(prev => prev + 1);
                }
            }
        }
    };

    const saveState = (currentHsb = { h: 0, s: 0, b: 0 }, currentK = kmeansK) => {
        if (!ctx) return;
        const canvas = canvasRef.current;
        if (!canvas) return;
        const imageData = ctx.getImageData(0, 0, 64, 64);
        setHistory(prev => {
            const newList = prev.list.slice(0, prev.index + 1);
            newList.push({ data: imageData, hsb: { ...currentHsb }, kmeansK: currentK });
            const maxHistory = 50;
            if (newList.length > maxHistory) {
                newList.shift();
            }
            return {
                list: newList,
                index: newList.length - 1
            };
        });
    };

    const undo = () => {
        if (history.index <= 0) return;
        restoreState(history.index - 1);
    };

    const redo = () => {
        if (history.index >= history.list.length - 1) return;
        restoreState(history.index + 1);
    };

    const restoreState = (index: number) => {
        if (!ctx || index < 0 || index >= history.list.length) return;
        const item = history.list[index];
        ctx.putImageData(item.data, 0, 0);
        setHistory(prev => ({ ...prev, index }));

        // Restore HSB sliders from history
        setHsb({ ...item.hsb });
        originalImageDataRef.current = null;

        // Restore KMeans K value from history
        if (item.kmeansK !== undefined) {
            setKmeansK(item.kmeansK);
        }
        originalKMeansImageDataRef.current = null;

        if (texture) {
            texture.needsUpdate = true;
            setUpdateTrigger(prev => prev + 1);
        }
    };


    const handlePaintEnd = () => {
        if (hasChangedRef.current) {
            saveState();
            hasChangedRef.current = false;
        }
    }

    const handleHover = (x: number, y: number) => {
        if (!ctx || tool === 'picker') return;
        if (x < 0 || x >= 64 || y < 0 || y >= 64) return;

        // Skip if same pixel
        if (hoverRef.current && hoverRef.current.x === x && hoverRef.current.y === y) return;

        // Restore previous hover pixel
        if (hoverRef.current) {
            ctx.putImageData(hoverRef.current.savedData, hoverRef.current.x, hoverRef.current.y);
        }

        // Save current pixel
        const savedData = ctx.getImageData(x, y, 1, 1);
        hoverRef.current = { x, y, savedData };

        // Draw preview
        if (tool === 'pencil') {
            ctx.fillStyle = currentColor;
            ctx.fillRect(x, y, 1, 1);
        } else if (tool === 'eraser') {
            ctx.clearRect(x, y, 1, 1);
        }

        // Update texture for 3D preview
        if (texture) {
            texture.needsUpdate = true;
            setUpdateTrigger(prev => prev + 1);
        }
    };

    const handleHoverEnd = () => {
        if (!ctx || !hoverRef.current) return;
        ctx.putImageData(hoverRef.current.savedData, hoverRef.current.x, hoverRef.current.y);
        hoverRef.current = null;
        if (texture) {
            texture.needsUpdate = true;
            setUpdateTrigger(prev => prev + 1);
        }
    };


    const handleImport = (e: ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        // TODO Check if it is a valid 64x64 texture
        const reader = new FileReader();
        reader.onload = (event) => {
            const img = new Image();
            img.onload = () => {
                const isValidDimension = (img.width === 64 && img.height === 64);
                if (!isValidDimension) {
                    showError(current.edit.invalidDimensions);
                    return;
                }
                if (!ctx) return;

                const tempCanvas = document.createElement('canvas');
                const tempCtx = tempCanvas.getContext('2d');
                if (!tempCtx) return;
                tempCanvas.width = img.width;
                tempCanvas.height = img.height;
                tempCtx.drawImage(img, 0, 0);

                ctx.clearRect(0, 0, 64, 64);

                if (img.width === 64 && img.height === 32) {
                    ctx.drawImage(img, 0, 0);

                    const armData = tempCtx.getImageData(40, 16, 16, 16);
                    ctx.putImageData(armData, 32, 48);

                    const legData = tempCtx.getImageData(0, 16, 16, 16);
                    ctx.putImageData(legData, 16, 48);
                } else {
                    ctx.drawImage(img, 0, 0, 64, 64);
                }

                if (texture) {
                    texture.dispose();
                }
                const canvas = canvasRef.current;
                if (canvas) {
                    const tex = new THREE.CanvasTexture(canvas);
                    tex.magFilter = THREE.NearestFilter;
                    tex.minFilter = THREE.NearestFilter;
                    tex.colorSpace = THREE.SRGBColorSpace;
                    setTexture(tex);
                }
                setUpdateTrigger(prev => prev + 1);
                setIsEmptyModel(false);

                setParentSkinId(null);
                setBasedOnSkinRenderUrl(null);
                setModelType(isSlim(img) ? 'alex' : 'steve');
                const imageData = ctx.getImageData(0, 0, 64, 64);
                setHistory({ list: [{ data: imageData, hsb: { h: 0, s: 0, b: 0 }, kmeansK: Math.min(48, Math.max(2, getUniqueColors(imageData).length)) }], index: 0 });
                e.target.value = '';
            };
            img.src = event.target?.result as string;
        };
        reader.readAsDataURL(file);
    };

    const convertModel = (target: 'steve' | 'alex') => {
        if (!ctx || modelType === target) return;
        const canvas = canvasRef.current;
        if (!canvas) return;

        convertSkinLayout(canvas, target);

        setModelType(target);
        if (texture) {
            texture.needsUpdate = true;
            setUpdateTrigger(prev => prev + 1);
        }
        saveState();
    };

    const handleSave = () => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const link = document.createElement('a');
        link.download = 'skin_edited.png';
        link.href = canvas.toDataURL();
        link.click();
    };

    const colors = [
        // Row 1: Rainbow Brights
        '#FF595E', '#FF9F1C', '#FFCA3A', '#8AC926', '#1982C4', '#6A4C93',
        // Row 2: Earth & Skin Tones (Crucial for MC skins)
        '#F3D5C0', '#DDBEA9', '#CB997E', '#A5A58D', '#6B705C', '#34251F',
        // Row 3: Grayscale
        '#FFFFFF', '#D1D5DB', '#6B7280', '#4B5563', '#1F2937',
    ];

    return (
        <PageContainer
            innerPadding="p-0"
            gap="gap-4"
            overflow="overflow-visible lg:overflow-hidden"
            animate="animate-in fade-in zoom-in duration-300"
        >

            {/* Top Section: Previews */}
            <div className="flex-1 flex min-h-0">
                {/* 3D Preview */}
                <div className="w-full flex-1 bg-black/30 border border-white/5 flex flex-col items-center justify-center relative overflow-hidden min-w-0">


                    <div
                        className={`w-full h-full bg-[#1a1a1a] overflow-hidden flex items-center justify-center shadow-inner relative ${tool === 'picker' ? 'cursor-crosshair' : ''}`}
                        onPointerLeave={handleHoverEnd}
                    >
                        <input
                            id="import-input"
                            type="file"
                            accept="image/*"
                            style={{ display: 'none' }}
                            onChange={handleImport}
                        />

                        {isEmptyModel ? (
                            <div className="flex flex-col items-center gap-4 z-20">
                                <button
                                    onClick={() => document.getElementById('import-input')?.click()}
                                    className="px-6 py-3 bg-[#3c8527] hover:bg-[#4ea632] text-white font-pixel-hans text-xs cursor-pointer flex items-center gap-2 transition-all shadow-lg border border-black active:translate-y-px"
                                >
                                    <Icon icon="pixelarticons:upload" className="text-base" />
                                    {current.edit.importTitle}
                                </button>
                                <div className="text-white/40 font-pixel-hans text-[11px] text-center max-w-xs mt-2 leading-relaxed">
                                    {current.edit.importDesc}
                                </div>
                            </div>
                        ) : null}

                        {!isEmptyModel && texture && (
                            <>
                                <MC texture={texture} updateTrigger={updateTrigger} mode={previewMode} action={previewAction} visibleParts={visibleParts} showOverlay={showOverlay} onPaint={paintPixel} onPaintEnd={handlePaintEnd} onHover={handleHover} onHoverEnd={handleHoverEnd} />
                                {/* Floating Tools on Left-Center (Desktop) or Bottom-Left Above Palette (Mobile) */}
                                <div className="absolute z-20 flex flex-col items-start gap-1.5 pointer-events-auto lg:left-4 lg:top-1/2 lg:-translate-y-1/2 max-lg:bottom-20 max-lg:left-4">
                                    <button
                                        onClick={() => setShowOverlay(!showOverlay)}
                                        className={`p-1.5 px-2 bg-black/60 backdrop-blur-md border text-white cursor-pointer hover:bg-black/80 flex items-center gap-1.5 transition-all outline-none ${current.fontClass} ${showOverlay ? 'border-[#4ea632]/80 bg-[#4ea632]/10' : 'border-white/10'}`}
                                    >
                                        <div className={`w-4 h-4 border flex items-center justify-center transition-all duration-200 ${showOverlay ? 'border-white bg-[#4ea632]' : 'border-white/20 bg-transparent'}`}>
                                            <Icon icon="pixelarticons:check" className={`text-xs text-white animate-in zoom-in duration-100 ${showOverlay ? 'block' : 'hidden'}`} />
                                        </div>
                                        <span className={`text-xs ${showOverlay ? 'text-white' : 'text-white/60'}`}>
                                            {current.edit.overlay}
                                        </span>
                                    </button>

                                    <div className="flex flex-col gap-2 bg-black/60 backdrop-blur-md p-2 border border-white/10">
                                        <button
                                            onClick={() => setTool('pencil')}
                                            className={`p-2 border cursor-pointer ${tool === 'pencil' ? 'bg-[#3c8527] border-black text-white' : 'bg-white/5 border-white/10 text-white/60 hover:bg-white/10'}`}
                                            title={current.edit.pencil}
                                        >
                                            <Icon icon="pixelarticons:edit" className="text-base" />
                                        </button>
                                        <button
                                            onClick={() => setTool('eraser')}
                                            className={`p-2 border cursor-pointer ${tool === 'eraser' ? 'bg-[#3c8527] border-black text-white' : 'bg-white/5 border-white/10 text-white/60 hover:bg-white/10'}`}
                                            title={current.edit.eraser}
                                        >
                                            <Icon icon="pixelarticons:close" className="text-base" />
                                        </button>
                                        <button
                                            onClick={() => setTool('picker')}
                                            className={`p-2 border cursor-pointer ${tool === 'picker' ? 'bg-[#3c8527] border-black text-white' : 'bg-white/5 border-white/10 text-white/60 hover:bg-white/10'}`}
                                            title={current.edit.colorPicker}
                                        >
                                            <Icon icon="pixelarticons:pipette" className="text-base" />
                                        </button>
                                        <div className="w-full h-px bg-white/5 my-1" />
                                        <button
                                            onClick={() => setIsAdjustPanelOpen(!isAdjustPanelOpen)}
                                            className={`p-2 border cursor-pointer ${isAdjustPanelOpen ? 'bg-[#3c8527] border-black text-white' : 'bg-white/5 border-white/10 text-white/60 hover:bg-white/10'}`}
                                            title={current.edit.adjust}
                                        >
                                            <Icon icon="pixelarticons:sliders" className="text-base" />
                                        </button>
                                    </div>

                                    {isAdjustPanelOpen && (
                                        <div className="absolute left-16 top-0 z-30 bg-black/90 backdrop-blur-lg p-4 border border-white/10 flex flex-col gap-4 min-w-[240px] max-w-[300px] shadow-2xl animate-in slide-in-from-left-4 fade-in duration-300 pointer-events-auto">
                                            <div className="flex justify-between items-center mb-1">
                                                <span className={`text-[10px] text-white/40 uppercase tracking-widest ${current.fontClass}`}>{current.edit.adjust}</span>
                                                <button onClick={() => setIsAdjustPanelOpen(false)} className="text-white/30 hover:text-white transition-colors cursor-pointer">
                                                    <Icon icon="pixelarticons:close" className="text-sm" />
                                                </button>
                                            </div>

                                            {/* HSB Color Adjust Section */}
                                            <div className="flex flex-col gap-3">
                                                <div className="text-[9px] text-white/40 uppercase tracking-widest font-pixel-hans pb-1 border-b border-white/5">
                                                    {current.edit.adjust} (HSB)
                                                </div>

                                                {/* Hue */}
                                                <div className="flex flex-col gap-1.5">
                                                    <div className="flex justify-between text-[11px] font-pixel-hans">
                                                        <span className="text-white/60">{current.edit.hue}</span>
                                                        <span className="text-[#4ea632]">{hsb.h}°</span>
                                                    </div>
                                                    <input
                                                        type="range"
                                                        min="-180"
                                                        max="180"
                                                        value={hsb.h}
                                                        onPointerDown={handleHSBStart}
                                                        onChange={(e) => handleHSBChange('h', parseInt(e.target.value))}
                                                        onPointerUp={handleHSBEnd}
                                                        className="w-full h-1.5 bg-white/10 rounded-none appearance-none cursor-pointer accent-[#4ea632]"
                                                    />
                                                </div>

                                                {/* Saturation */}
                                                <div className="flex flex-col gap-1.5">
                                                    <div className="flex justify-between text-[11px] font-pixel-hans">
                                                        <span className="text-white/60">{current.edit.saturation}</span>
                                                        <span className="text-[#4ea632]">{hsb.s > 0 ? '+' : ''}{hsb.s}%</span>
                                                    </div>
                                                    <input
                                                        type="range"
                                                        min="-100"
                                                        max="100"
                                                        value={hsb.s}
                                                        onPointerDown={handleHSBStart}
                                                        onChange={(e) => handleHSBChange('s', parseInt(e.target.value))}
                                                        onPointerUp={handleHSBEnd}
                                                        className="w-full h-1.5 bg-white/10 rounded-none appearance-none cursor-pointer accent-[#4ea632]"
                                                    />
                                                </div>

                                                {/* Brightness */}
                                                <div className="flex flex-col gap-1.5">
                                                    <div className="flex justify-between text-[11px] font-pixel-hans">
                                                        <span className="text-white/60">{current.edit.brightness}</span>
                                                        <span className="text-[#4ea632]">{hsb.b > 0 ? '+' : ''}{hsb.b}%</span>
                                                    </div>
                                                    <input
                                                        type="range"
                                                        min="-100"
                                                        max="100"
                                                        value={hsb.b}
                                                        onPointerDown={handleHSBStart}
                                                        onChange={(e) => handleHSBChange('b', parseInt(e.target.value))}
                                                        onPointerUp={handleHSBEnd}
                                                        className="w-full h-1.5 bg-white/10 rounded-none appearance-none cursor-pointer accent-[#4ea632]"
                                                    />
                                                </div>
                                            </div>


                                            {/* KMeans Color Quantization Section */}
                                            <div className="flex flex-col gap-3">
                                                <div className="text-[9px] text-white/40 uppercase tracking-widest font-pixel-hans pb-1 border-b border-white/5">
                                                    {current.edit.kmeans}
                                                </div>

                                                <div className="text-[10px] text-white/50 leading-relaxed font-pixel-hans">
                                                    {current.edit.kmeansDescription}
                                                </div>

                                                <div className="flex flex-col gap-1.5">
                                                    <div className="flex justify-between text-[11px] font-pixel-hans">
                                                        <span className="text-white/60">{current.edit.kmeansClusters}</span>
                                                        <span className="text-[#4ea632] font-bold">{kmeansK}</span>
                                                    </div>
                                                    <input
                                                        type="range"
                                                        min="2"
                                                        max="48"
                                                        value={kmeansK}
                                                        onPointerDown={handleKMeansStart}
                                                        onChange={(e) => handleKMeansChange(parseInt(e.target.value))}
                                                        onPointerUp={handleKMeansEnd}
                                                        className="w-full h-1.5 bg-white/10 rounded-none appearance-none cursor-pointer accent-[#4ea632]"
                                                    />
                                                </div>

                                                {kmeansPalette.length > 0 && (
                                                    <div className="flex flex-col gap-1.5 mt-1">
                                                        <div className="text-[9px] text-white/40 uppercase tracking-widest font-pixel-hans">
                                                            {current.edit.kmeansPalettePreview} ({kmeansPalette.length})
                                                        </div>
                                                        <div className="flex flex-wrap gap-1 p-1 bg-black/20 border border-white/5 max-h-[72px] overflow-y-auto custom-scrollbar">
                                                            {kmeansPalette.map((c, idx) => (
                                                                <div
                                                                    key={idx}
                                                                    style={{ backgroundColor: c }}
                                                                    className="w-4 h-4 border border-black/50 shrink-0 cursor-pointer transform hover:scale-110 transition-transform"
                                                                    onClick={() => setCurrentColor(c)}
                                                                    title={c}
                                                                />
                                                            ))}
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    )}
                                </div>

                                {/* Floating Controls Top Right */}
                                <div className="absolute top-4 right-4 z-20 flex gap-1.5 bg-black/60 backdrop-blur-md p-1 border border-white/10 items-center">
                                    {!isEmptyModel && (
                                        <>
                                            <button
                                                onClick={undo}
                                                disabled={history.index <= 0}
                                                className={`p-1.5 border cursor-pointer ${history.index <= 0 ? 'opacity-30 cursor-not-allowed' : 'bg-white/10 border-white/20 text-white hover:bg-white/20'}`}
                                                title={current.edit.undo}
                                            >
                                                <Icon icon="pixelarticons:undo" className="text-sm text-white" />
                                            </button>
                                            <button
                                                onClick={redo}
                                                disabled={history.index >= history.list.length - 1}
                                                className={`p-1.5 border cursor-pointer ${history.index >= history.list.length - 1 ? 'opacity-30 cursor-not-allowed' : 'bg-white/10 border-white/20 text-white hover:bg-white/20'}`}
                                                title={current.edit.redo}
                                            >
                                                <Icon icon="pixelarticons:redo" className="text-sm text-white" />
                                            </button>

                                            <div className="w-px h-3 bg-white/10" />
                                        </>
                                    )}

                                    <button
                                        onClick={() => document.getElementById('import-input')?.click()}
                                        className={`p-1.5 px-2.5 bg-[#555] hover:bg-[#666] text-white border border-black cursor-pointer flex items-center gap-1.5 transition-colors active:translate-y-px ${current.fontClass}`}
                                        title={current.edit.import}
                                    >
                                        <Icon icon="pixelarticons:upload" className="text-sm" />
                                        <span className="text-[11px] font-bold">{current.edit.import}</span>
                                    </button>

                                    {!isEmptyModel && (
                                        <>
                                            <button
                                                onClick={handleSave}
                                                className={`p-1.5 px-2.5 bg-[#555] hover:bg-[#666] text-white border border-black cursor-pointer flex items-center gap-1.5 transition-colors active:translate-y-px ${current.fontClass}`}
                                                title={current.edit.export}
                                            >
                                                <Icon icon="pixelarticons:download" className="text-sm" />
                                                <span className="text-[11px] font-bold">{current.edit.export}</span>
                                            </button>

                                            <div className="relative">
                                                <button
                                                    onClick={() => setIsDropdownOpen(prev => !prev)}
                                                    className={`p-1.5 px-2.5 bg-[#e09f3e] hover:bg-[#9e2a2b] text-white border border-black cursor-pointer flex items-center gap-1.5 transition-colors active:translate-y-px ${current.fontClass}`}
                                                    title={current.edit.collect}
                                                >
                                                    <Icon icon="pixelarticons:bookmark" className="text-sm" />
                                                    <span className="text-[11px] font-bold">{current.edit.collect}</span>
                                                </button>

                                                {isDropdownOpen && (
                                                    <div className="absolute top-full right-0 mt-1 z-30 bg-[#121212] border border-white/10 p-2 flex flex-col gap-1 w-48 shadow-lg">
                                                        <div className="flex flex-col gap-2 p-1">
                                                            <div className="text-[10px] text-white/60 pb-1 border-b border-white/5 mb-1 font-pixel-hans">
                                                                {current.edit.saveToCreations}
                                                            </div>
                                                            <button
                                                                onClick={() => !isParentPrivate && handleSaveToCreation(true)}
                                                                disabled={isSavingToCreation || isParentPrivate}
                                                                className={`text-left p-1.5 text-[10px] cursor-pointer flex items-center gap-1 transition-colors ${isParentPrivate
                                                                    ? 'opacity-40 cursor-not-allowed bg-white/5 border border-white/5 text-white/30'
                                                                    : 'bg-[#3c8527]/20 border border-[#3c8527]/40 hover:bg-[#3c8527]/40 text-white/80'
                                                                    }`}
                                                            >
                                                                <Icon icon="pixelarticons:folder" className="text-[#4ea632]" />
                                                                <span className={current.fontClass}>{current.edit.saveAsPublic}</span>
                                                            </button>
                                                            {isParentPrivate && (
                                                                <div className="text-[9px] text-yellow-500/80 px-1.5 py-0.5 font-pixel-hans">
                                                                    {current.edit.privateModelWarning}
                                                                </div>
                                                            )}
                                                            <button
                                                                onClick={() => handleSaveToCreation(false)}
                                                                disabled={isSavingToCreation}
                                                                className="text-left p-1.5 hover:bg-white/10 text-[10px] text-white/80 cursor-pointer flex items-center gap-1 bg-white/5 border border-white/10 hover:bg-white/10 transition-colors"
                                                            >
                                                                <Icon icon="pixelarticons:folder" className="text-white/60" />
                                                                <span className={current.fontClass}>{current.edit.saveAsPrivate}</span>
                                                            </button>
                                                            {isSavingToCreation && <div className="text-[9px] text-white/40 text-center animate-pulse">{current.edit.saving}</div>}
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        </>
                                    )}
                                </div>

                                {/* Floating Palette Bottom Center */}
                                <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 flex flex-row items-center gap-1.5 bg-black/60 backdrop-blur-md p-1.5 border border-white/10 pointer-events-auto w-[92%] max-w-[300px] sm:w-auto sm:max-w-xl shadow-2xl">
                                    {/* Large Color Picker Square */}
                                    <div className="relative w-12 h-12 border border-white/20 bg-transparent flex-shrink-0 shadow-lg">
                                        <input
                                            type="color"
                                            value={currentColor}
                                            onChange={(e) => setCurrentColor(e.target.value)}
                                            className="absolute inset-0 w-full h-full cursor-pointer opacity-0 z-10"
                                        />
                                        <div
                                            className="absolute inset-0 border border-black/50"
                                            style={{ backgroundColor: currentColor }}
                                        />
                                    </div>

                                    <div className="flex-1 flex flex-row items-center gap-1 p-1 bg-black/20 border border-white/5 overflow-x-auto custom-scrollbar min-w-0">
                                        {recentColors.map(c => (
                                            <button
                                                key={c}
                                                style={{ backgroundColor: c }}
                                                onClick={() => setCurrentColor(c)}
                                                className={`w-8 h-8 sm:w-6 sm:h-6 shrink-0 border border-black cursor-pointer transform hover:scale-110 transition-transform ${currentColor === c ? 'ring-2 ring-white/60' : ''}`}
                                            />
                                        ))}
                                        {recentColors.length > 0 && <div className="w-px h-4 bg-white/20 shrink-0 mx-1" />}
                                        {colors.map(c => (
                                            <button
                                                key={c}
                                                style={{ backgroundColor: c }}
                                                onClick={() => setCurrentColor(c)}
                                                className={`w-8 h-8 sm:w-6 sm:h-6 shrink-0 border border-black cursor-pointer transform hover:scale-110 transition-transform ${currentColor === c ? 'ring-2 ring-white/60' : ''}`}
                                            />
                                        ))}
                                    </div>
                                </div>

                                {/* Simplified Character Toggler (Desktop Bottom-Right, Mobile Above Palette) */}
                                <div className="absolute z-20 flex flex-col items-center gap-2 pointer-events-auto lg:bottom-4 lg:right-4 max-lg:bottom-20 max-lg:right-4">
                                    <div className="flex bg-black/60 backdrop-blur-md border border-white/10 p-0.5">
                                        <button
                                            onClick={() => convertModel('steve')}
                                            className={`px-2 py-1 text-[9px] cursor-pointer transition-colors ${current.fontClass} ${modelType === 'steve' ? 'bg-[#3c8527] text-white' : 'text-white/40 hover:text-white/60'}`}
                                        >
                                            {current.edit.strongMode}
                                        </button>
                                        <button
                                            onClick={() => convertModel('alex')}
                                            className={`px-2 py-1 text-[9px] cursor-pointer transition-colors ${current.fontClass} ${modelType === 'alex' ? 'bg-[#3c8527] text-white' : 'text-white/40 hover:text-white/60'}`}
                                        >
                                            {current.edit.slimMode}
                                        </button>
                                    </div>

                                    <div className="bg-black/40 backdrop-blur-md p-4 border border-white/10 flex flex-col items-center gap-1.5 w-fit">
                                        <div
                                            onClick={() => togglePart('head')}
                                            className={`w-6 h-6 cursor-pointer border-2 transition-colors ${visibleParts.head ? 'bg-[#4ea632] border-[#4ea632]' : 'bg-transparent border-white/20'}`}
                                        />
                                        <div className="flex gap-1.5">
                                            <div onClick={() => togglePart('rightArm')} className={`w-3 h-9 cursor-pointer border-2 transition-colors ${visibleParts.rightArm ? 'bg-[#4ea632] border-[#4ea632]' : 'bg-transparent border-white/20'}`} />
                                            <div onClick={() => togglePart('body')} className={`w-6 h-9 cursor-pointer border-2 transition-colors ${visibleParts.body ? 'bg-[#4ea632] border-[#4ea632]' : 'bg-transparent border-white/20'}`} />
                                            <div onClick={() => togglePart('leftArm')} className={`w-3 h-9 cursor-pointer border-2 transition-colors ${visibleParts.leftArm ? 'bg-[#4ea632] border-[#4ea632]' : 'bg-transparent border-white/20'}`} />
                                        </div>
                                        <div className="flex gap-1.5">
                                            <div onClick={() => togglePart('rightLeg')} className={`w-3 h-9 cursor-pointer border-2 transition-colors ${visibleParts.rightLeg ? 'bg-[#4ea632] border-[#4ea632]' : 'bg-transparent border-white/20'}`} />
                                            <div onClick={() => togglePart('leftLeg')} className={`w-3 h-9 cursor-pointer border-2 transition-colors ${visibleParts.leftLeg ? 'bg-[#4ea632] border-[#4ea632]' : 'bg-transparent border-white/20'}`} />
                                        </div>
                                    </div>
                                </div>
                            </>
                        )}

                    </div>

                    {parentSkinId && (
                        <div className="absolute z-30 bg-black/60 backdrop-blur-md p-1.5 border border-white/10 flex items-center gap-2 pointer-events-auto lg:top-10 lg:left-10 max-lg:top-16 max-lg:right-4">
                            {basedOnSkinRenderUrl ? (
                                <div key="based-on-image" className="w-10 h-10 bg-black/40 border border-white/5 overflow-hidden flex items-center justify-center">
                                    <img
                                        src={basedOnSkinRenderUrl}
                                        className="w-full h-full object-contain"
                                        style={{ imageRendering: 'pixelated' }}
                                        alt="Based On"
                                    />
                                </div>
                            ) : (
                                <div key="based-on-loading" className="w-10 h-10 bg-black/40 border border-white/5 flex items-center justify-center">
                                    <Icon icon="pixelarticons:reload" className="text-white/20 animate-spin" />
                                </div>
                            )}
                            <div className="flex flex-col">
                                <span className="text-white/30 text-[8px] font-pixel-hans uppercase tracking-widest">Based on</span>
                                <span className="text-[#4ea632] font-pixel-hans text-[11px] font-bold" title={parentSkinId}>
                                    {parentSkinId.substring(0, 8).toUpperCase()}
                                </span>
                            </div>
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setParentSkinId(null);
                                    setBasedOnSkinRenderUrl(null);
                                    setIsEmptyModel(true);
                                    setTexture(null);
                                }}
                                className="p-1 hover:bg-white/10 text-white/40 hover:text-white/80 transition-colors cursor-pointer border border-transparent hover:border-white/10 flex items-center justify-center ml-1"
                                title={current.edit.exitReference}
                            >
                                <Icon icon="pixelarticons:close" className="text-base" />
                            </button>
                        </div>
                    )}
                </div>

                <canvas ref={canvasRef} style={{ display: 'none' }} />
            </div>
        </PageContainer>
    );
}
