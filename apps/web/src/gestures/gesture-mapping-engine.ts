import { ExponentialSmoother, mapSignal, type GestureFeatureName, type GestureFrame } from "@gsw/gesture-domain";
import type { GestureMapping } from "@gsw/project-schema";

export interface MappingOutput {
  mapping: GestureMapping;
  sourceValue: number;
  mappedValue: number;
  gateState?: boolean;
  gateChanged?: boolean;
}

export class GestureMappingEngine {
  #mappings: GestureMapping[] = [];
  #smoothers = new Map<string, ExponentialSmoother>();
  #gateStates = new Map<string, boolean>();

  setMappings(mappings: GestureMapping[]): void {
    this.#mappings = mappings.filter((mapping) => mapping.enabled);
    this.#smoothers.clear();
    this.#gateStates.clear();
    for (const mapping of this.#mappings) {
      this.#smoothers.set(mapping.id, new ExponentialSmoother(mapping.transform.smoothing));
    }
  }

  process(frame: GestureFrame): MappingOutput[] {
    const outputs: MappingOutput[] = [];
    for (const mapping of this.#mappings) {
      const sourceValue = frame.features[mapping.source as GestureFeatureName];
      if (sourceValue === undefined) continue;
      const rawMapped = mapSignal(sourceValue, mapping.transform);
      const mappedValue = this.#smoothers.get(mapping.id)?.next(rawMapped) ?? rawMapped;
      if (mapping.target.type !== "selected-track-toggle") {
        outputs.push({ mapping, sourceValue, mappedValue });
        continue;
      }
      const previous = this.#gateStates.get(mapping.id);
      const gateState = previous === undefined
        ? mappedValue >= mapping.target.gate.onThreshold
        : previous
          ? mappedValue > mapping.target.gate.offThreshold
          : mappedValue >= mapping.target.gate.onThreshold;
      this.#gateStates.set(mapping.id, gateState);
      outputs.push({
        mapping,
        sourceValue,
        mappedValue,
        gateState,
        gateChanged: previous === undefined || gateState !== previous
      });
    }
    return outputs;
  }
}
