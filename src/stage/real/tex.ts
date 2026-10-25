// Textures for the realistic miniature look (display only). The pictures were generated with Higgsfield for this
// prototype (foliage, grass tufts, cloud, rock, soil profile) and live in public/art/ — the single-file build inlines
// them. Each texture is created once and fills in when its picture has loaded, so nothing waits for it.
import * as THREE from 'three';
import { artUrl } from '../../ui/art';

const cache = new Map<string, THREE.Texture>();

export function artTex(name: string, o: { repeat?: boolean; data?: boolean } = {}): THREE.Texture {
  const key = `${name}|${o.repeat ? 'r' : ''}|${o.data ? 'd' : ''}`;
  let t = cache.get(key);
  if (!t) {
    t = new THREE.TextureLoader().load(artUrl(name), undefined, undefined, () => { /* a missing picture just stays blank */ });
    t.colorSpace = o.data ? THREE.NoColorSpace : THREE.SRGBColorSpace;
    t.anisotropy = 8;
    t.generateMipmaps = true;
    t.minFilter = THREE.LinearMipmapLinearFilter;
    t.magFilter = THREE.LinearFilter;
    if (o.repeat) { t.wrapS = THREE.RepeatWrapping; t.wrapT = THREE.RepeatWrapping; }
    cache.set(key, t);
  }
  return t;
}

/** Depth material for alpha-cut foliage so shadows have the leaf shapes, not squares. */
export function cutoutDepth(map: THREE.Texture, alphaTest: number): THREE.MeshDepthMaterial {
  return new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map, alphaTest });
}
