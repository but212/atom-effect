import { SMI_MAX } from './constants';

let collectorEpoch = 0;

export function nextEpoch(): number {
  collectorEpoch = ((collectorEpoch + 1) | 0) & SMI_MAX;
  return collectorEpoch;
}

export function currentEpoch(): number {
  return collectorEpoch;
}
