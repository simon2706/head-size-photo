// Local, in-browser MediaPipe Face Landmarker. Model and WASM are served from
// /public, so no image or inference request ever leaves the machine.
import { FaceLandmarker, FilesetResolver, type FaceLandmarkerResult } from '@mediapipe/tasks-vision'
import { landmarksPlausible } from './detection'

export const MODEL_PATH = '/models/face_landmarker.task'
export const WASM_PATH = '/mediapipe/wasm'
export const MODEL_DESCRIPTION = 'face_landmarker.task (float16, MediaPipe Face Landmarker)'

type Mode = 'IMAGE' | 'VIDEO'
type Delegate = 'GPU' | 'CPU'

interface Instance {
  landmarker: FaceLandmarker
  delegate: Delegate
}

/** GPU unless `?delegate=cpu` forces CPU (for debugging on devices with a broken GPU delegate). */
let delegate: Delegate =
  typeof location !== 'undefined' && new URLSearchParams(location.search).get('delegate')?.toLowerCase() === 'cpu'
    ? 'CPU'
    : 'GPU'

const cache = new Map<Mode, Promise<Instance>>()
/** Resolved entries of `cache`, so that a broken instance can be dropped synchronously. */
const ready = new Map<Mode, Instance>()

async function create(mode: Mode): Promise<Instance> {
  const fileset = await FilesetResolver.forVisionTasks(WASM_PATH)
  const options = {
    baseOptions: { modelAssetPath: MODEL_PATH },
    runningMode: mode,
    // 2 so that "exactly one face" can be checked; only the first face is measured.
    numFaces: 2,
    outputFaceBlendshapes: true,
    outputFacialTransformationMatrixes: true,
  } as const
  const make = async (d: Delegate): Promise<Instance> => ({
    landmarker: await FaceLandmarker.createFromOptions(fileset, {
      ...options,
      baseOptions: { ...options.baseOptions, delegate: d },
    }),
    delegate: d,
  })
  if (delegate === 'CPU') return make('CPU')
  try {
    return await make('GPU')
  } catch (err) {
    console.warn('[mediapipe] GPU delegate unavailable, falling back to CPU', err)
    delegate = 'CPU'
    return make('CPU')
  }
}

function getInstance(mode: Mode): Promise<Instance> {
  let p = cache.get(mode)
  if (!p) {
    const created = create(mode)
    created.then(
      (i) => cache.get(mode) === created && ready.set(mode, i),
      () => cache.delete(mode),
    )
    cache.set(mode, created)
    p = created
  }
  return p
}

/** Drop (and close) the cached instance, if it is still the one given. */
function discard(mode: Mode, instance: Instance) {
  if (ready.get(mode) !== instance) return
  ready.delete(mode)
  cache.delete(mode)
  instance.landmarker.close()
}

/** Lazily created landmarker per running mode (IMAGE for stills, VIDEO for the webcam). */
export async function getFaceLandmarker(mode: Mode): Promise<FaceLandmarker> {
  return (await getInstance(mode)).landmarker
}

/**
 * Run `detect` with the landmarker for `mode`.
 *
 * A MediaPipe graph stays broken after any calculator error ("Graph has errors"), so a failing
 * instance is recreated instead of reused. If the GPU delegate throws or returns implausible
 * landmarks (seen on Adreno GPUs in Chrome for Android), every mode switches to the CPU delegate
 * for the rest of the session and `detect` is retried once.
 */
export async function detectFaces(
  mode: Mode,
  detect: (landmarker: FaceLandmarker) => FaceLandmarkerResult,
): Promise<FaceLandmarkerResult> {
  const instance = await getInstance(mode)
  try {
    const result = detect(instance.landmarker)
    if (instance.delegate === 'CPU' || landmarksPlausible(result)) return result
    console.warn('[mediapipe] GPU delegate returned implausible landmarks, switching to CPU')
    discard(mode, instance)
  } catch (err) {
    discard(mode, instance)
    if (instance.delegate === 'CPU') throw err
    console.warn('[mediapipe] GPU delegate failed, switching to CPU', err)
  }
  if (delegate === 'GPU') {
    delegate = 'CPU'
    for (const [m, i] of ready) if (i.delegate === 'GPU') discard(m, i)
  }
  return detect(await getFaceLandmarker(mode))
}
